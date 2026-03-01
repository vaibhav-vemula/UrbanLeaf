import os
import json
import httpx
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime

logger = logging.getLogger(__name__)


class BlockchainService:
    def __init__(self):
        self.service_url = os.getenv('BLOCKCHAIN_SERVICE_URL', 'http://localhost:5000')
        self.cre_workflow_url = os.getenv('CRE_WORKFLOW_URL', '')
        self.cre_workflow_dir = os.getenv('CRE_WORKFLOW_DIR', '')
        self.network = 'arbitrum_sepolia'
        self.explorer_base = 'https://sepolia.arbiscan.io'
        self.timeout = httpx.Timeout(30.0, connect=10.0)

        logger.info(f"Blockchain Service URL: {self.service_url}")
        logger.info(f"Network: {self.network}")
        if self.cre_workflow_url:
            logger.info(f"CRE Workflow URL: {self.cre_workflow_url}")

    async def is_connected(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(f"{self.service_url}/health")
                return response.status_code == 200
        except Exception as e:
            logger.error(f"Blockchain service connection failed: {e}")
            return False

    async def get_contract_info(self) -> Dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(f"{self.service_url}/api/contract/info")
                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.error(f"Failed to get contract info: {e}")
            raise

    async def create_proposal_on_blockchain(self, proposal_data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            analysis_data = proposal_data['analysisData']
            end_date_str = proposal_data['endDate']
            try:
                parsed_date = datetime.strptime(end_date_str, "%B %d, %Y")
                end_of_day = parsed_date.replace(hour=23, minute=59, second=59)
                end_timestamp = int(end_of_day.timestamp())
            except:
                end_timestamp = int(datetime.now().timestamp() + 30 * 24 * 3600)

            current_time = int(datetime.now().timestamp())
            buffer_time = 3600

            if end_timestamp <= current_time + buffer_time:
                end_timestamp = current_time + (30 * 24 * 3600) + buffer_time

            ndvi_before = max(0, int(float(analysis_data.get('ndviBefore', 0)) * 1e8))
            ndvi_after = max(0, int(float(analysis_data.get('ndviAfter', 0)) * 1e8))
            pm25_before = max(0, int(float(analysis_data.get('pm25Before', 0)) * 1e8))
            pm25_after = max(0, int(float(analysis_data.get('pm25After', 0)) * 1e8))
            pm25_increase = max(0, int(float(analysis_data.get('pm25IncreasePercent', 0)) * 1e8))

            ndvi_before_val = float(analysis_data.get('ndviBefore', 0))
            ndvi_after_val = float(analysis_data.get('ndviAfter', 0))
            vegetation_loss = max(0, int((ndvi_before_val - ndvi_after_val) * 100 * 1e8)) if ndvi_before_val and ndvi_after_val else 0

            demographics = analysis_data.get('demographics', {})
            children = max(0, int(demographics.get('kids', 0)))
            adults = max(0, int(demographics.get('adults', 0)))
            seniors = max(0, int(demographics.get('seniors', 0)))
            total_affected = max(0, int(analysis_data.get('affectedPopulation10MinWalk', 0)))

            description = proposal_data.get('frontendDescription',
                f"This park provides green space for the community. Its removal would impact air quality and vegetation health."
            )

            blockchain_summary = await self._generate_blockchain_summary(
                proposal_data['proposalSummary'],
                analysis_data
            )

            creator_address = proposal_data.get('creator', None)
            fundraising_enabled = proposal_data.get('fundraisingEnabled', False)
            funding_goal = proposal_data.get('fundingGoal', 0)

            payload = {
                "parkName": proposal_data['parkName'],
                "parkId": proposal_data['parkId'],
                "description": description,
                "endDate": end_timestamp,
                "environmentalData": {
                    "ndviBefore": ndvi_before,
                    "ndviAfter": ndvi_after,
                    "pm25Before": pm25_before,
                    "pm25After": pm25_after,
                    "pm25IncreasePercent": pm25_increase,
                    "vegetationLossPercent": vegetation_loss
                },
                "demographics": {
                    "children": children,
                    "adults": adults,
                    "seniors": seniors,
                    "totalAffectedPopulation": total_affected
                },
                "creator": creator_address,
                "fundraisingEnabled": fundraising_enabled,
                "fundingGoal": funding_goal
            }

            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.service_url}/api/contract/create-proposal",
                    json=payload
                )
                response.raise_for_status()
                result = response.json()

            if result.get('success'):
                proposal_id = result.get('proposalId', result.get('proposal_id', 0))
                park_id = proposal_data.get('parkId', '')

                # Trigger CRE environmental scoring workflow (fire-and-forget)
                tx_hash = result.get('transactionHash', '')
                await self._trigger_cre_scoring(proposal_id, park_id, tx_hash)

                return {
                    'success': True,
                    'proposal_id': proposal_id,
                    'transaction_hash': result.get('transactionHash'),
                    'status': result.get('status'),
                    'explorer_url': f"{self.explorer_base}/tx/{result.get('transactionHash')}",
                    'email_summary': blockchain_summary,
                    'cre_scoring': 'triggered' if self.cre_workflow_url else 'not_configured',
                }
            else:
                return {'success': False, 'error': result.get('error', 'Unknown error')}

        except Exception as e:
            logger.error(f"Failed to create proposal: {e}")
            import traceback
            traceback.print_exc()
            return {'success': False, 'error': str(e)}

    async def get_proposal(self, proposal_id: int) -> Optional[Dict[str, Any]]:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(f"{self.service_url}/api/contract/proposal/{proposal_id}")
                if response.status_code == 404:
                    return None
                response.raise_for_status()
                result = response.json()

            if result.get('success'):
                return self._parse_proposal(result.get('proposal'))
            return None

        except httpx.HTTPStatusError as e:
            if e.response.status_code != 404:
                logger.error(f"Failed to get proposal {proposal_id}: {e}")
            return None
        except Exception as e:
            logger.error(f"Failed to get proposal {proposal_id}: {e}")
            return None

    async def get_all_active_proposals(self) -> List[int]:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(f"{self.service_url}/api/contract/proposals/active")
                response.raise_for_status()
                result = response.json()
            return result.get('proposalIds', []) if result.get('success') else []
        except Exception as e:
            logger.error(f"Failed to get active proposals: {e}")
            return []

    async def get_all_accepted_proposals(self) -> List[int]:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(f"{self.service_url}/api/contract/proposals/accepted")
                response.raise_for_status()
                result = response.json()
            return result.get('proposalIds', []) if result.get('success') else []
        except Exception as e:
            logger.error(f"Failed to get accepted proposals: {e}")
            return []

    async def get_all_rejected_proposals(self) -> List[int]:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(f"{self.service_url}/api/contract/proposals/rejected")
                response.raise_for_status()
                result = response.json()
            return result.get('proposalIds', []) if result.get('success') else []
        except Exception as e:
            logger.error(f"Failed to get rejected proposals: {e}")
            return []

    async def has_user_voted(self, proposal_id: int, user_address: str) -> bool:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(
                    f"{self.service_url}/api/contract/has-voted/{proposal_id}/{user_address}"
                )
                response.raise_for_status()
                result = response.json()
            return result.get('hasVoted', False) if result.get('success') else False
        except Exception as e:
            logger.error(f"Failed to check if user voted: {e}")
            return False

    async def submit_vote(self, proposal_id: int, vote: bool, voter_address: str) -> Dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.service_url}/api/contract/vote",
                    json={"proposalId": proposal_id, "vote": vote, "voter": voter_address}
                )
                response.raise_for_status()
                result = response.json()

            if result.get('success'):
                return {
                    'success': True,
                    'transaction_hash': result.get('transactionHash'),
                    'explorer_url': f"{self.explorer_base}/tx/{result.get('transactionHash')}"
                }
            return {'success': False, 'error': result.get('error', 'Unknown error')}

        except Exception as e:
            logger.error(f"Failed to submit vote: {e}")
            return {'success': False, 'error': str(e)}

    async def close_proposal(self, proposal_id: int) -> Dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.service_url}/api/contract/close-proposal",
                    json={"proposalId": proposal_id}
                )
                response.raise_for_status()
                result = response.json()

            if result.get('success'):
                return {
                    'success': True,
                    'transaction_hash': result.get('transactionHash'),
                    'status': result.get('status'),
                    'explorer_url': f"{self.explorer_base}/tx/{result.get('transactionHash')}"
                }
            return {'success': False, 'error': result.get('error', 'Unknown error')}
        except Exception as e:
            logger.error(f"Failed to close proposal: {e}")
            return {'success': False, 'error': str(e)}

    async def get_donation_progress(self, proposal_id: int) -> Dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(
                    f"{self.service_url}/api/contract/donation-progress/{proposal_id}"
                )
                response.raise_for_status()
                result = response.json()

            if result.get('success'):
                return {
                    'success': True,
                    'raised': result.get('raised', 0),
                    'goal': result.get('goal', 0),
                    'percentage': result.get('percentage', 0)
                }
            return {'success': False, 'error': result.get('error', 'Unknown error')}
        except Exception as e:
            logger.error(f"Failed to get donation progress: {e}")
            return {'success': False, 'error': str(e)}

    async def get_user_balances(self, address: str) -> Dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(f"{self.service_url}/api/balances/{address}")
                response.raise_for_status()
                result = response.json()

            if result.get('success'):
                return {'success': True, 'balances': result.get('balances', {'eth': 0})}
            return {'success': False, 'error': result.get('error', 'Unknown error')}
        except Exception as e:
            logger.error(f"Failed to get user balances: {e}")
            return {'success': False, 'error': str(e)}

    async def _trigger_cre_scoring(self, proposal_id: int, park_id: str, tx_hash: str = "") -> None:
        """
        Triggers CRE score-proposal workflow:
        - Production (CRE_WORKFLOW_URL set): HTTP call to deployed CRE endpoint
        - Local (CRE_WORKFLOW_DIR set): updates payload JSON and runs cre workflow simulate
        """
        if self.cre_workflow_url:
            # Production path — call deployed CRE HTTP endpoint
            try:
                async with httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=5.0)) as client:
                    response = await client.post(
                        f"{self.cre_workflow_url}/score-proposal",
                        json={"proposalId": str(proposal_id), "parkId": park_id},
                    )
                    if response.status_code == 200:
                        logger.info(f"CRE scoring triggered for proposal #{proposal_id} (park: {park_id})")
                    else:
                        logger.warning(f"CRE workflow returned {response.status_code} for proposal #{proposal_id}")
            except Exception as e:
                logger.warning(f"CRE scoring trigger failed (non-fatal): {e}")

        elif self.cre_workflow_dir:
            # Local dev path — update payload so simulate commands are ready to run
            self._update_cre_payload(proposal_id, park_id, tx_hash)

        else:
            logger.info("CRE_WORKFLOW_URL and CRE_WORKFLOW_DIR not set — skipping CRE scoring")

    def _update_cre_payload(self, proposal_id: int, park_id: str, tx_hash: str = "") -> None:
        try:
            test_dir = os.path.join(self.cre_workflow_dir, "test")

            # HTTP trigger payload
            payload_path = os.path.join(test_dir, "score-proposal-payload.json")
            with open(payload_path, "w") as f:
                json.dump({"proposalId": str(proposal_id), "parkId": park_id}, f, indent=2)

            # EVM trigger tx hash
            if tx_hash:
                tx_path = os.path.join(test_dir, "last-tx-hash.txt")
                with open(tx_path, "w") as f:
                    f.write(tx_hash)

            logger.info(
                f"[CRE local] Payload updated — proposal #{proposal_id} (park: {park_id})\n"
                f"  HTTP:  npm run simulate:score\n"
                f"  EVM:   npm run simulate:evm {tx_hash or '<tx-hash>'}"
            )
        except Exception as e:
            logger.warning(f"[CRE local] Failed to update payload (non-fatal): {e}")

    async def _generate_blockchain_summary(self, full_summary: str, analysis_data: Dict) -> str:
        try:
            from google import genai

            client = genai.Client(api_key=os.getenv('GEMINI_API_KEY'))
            prompt = f"""Create a neutral data summary for a park proposal focusing only on NDVI and PM2.5 metrics.

Key data points to include:
- Park name: {analysis_data.get('parkName', 'Unknown')}
- NDVI change: {analysis_data.get('ndviBefore', 0)} → {analysis_data.get('ndviAfter', 0)}
- PM2.5 increase: {analysis_data.get('pm25IncreasePercent', 0)}%

Requirements:
- Must be between 230-240 characters exactly
- Only include NDVI and PM2.5 data
- Neutral factual tone only
- No emotional words or judgments
- Include exact numerical values

Return only the factual summary."""

            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt
            )

            summary = response.text.strip()

            if len(summary) < 230:
                summary += " Environmental impact assessment indicates significant changes."
            elif len(summary) > 240:
                summary = summary[:240]

            return summary

        except Exception as e:
            logger.warning(f"Failed to generate summary: {e}")
            park_name = analysis_data.get('parkName', 'Park')
            ndvi_before = analysis_data.get('ndviBefore', 0)
            ndvi_after = analysis_data.get('ndviAfter', 0)
            pm25_increase = analysis_data.get('pm25IncreasePercent', 0)
            return f"{park_name}: NDVI {ndvi_before}→{ndvi_after}, PM2.5 +{pm25_increase}%"

    def _parse_proposal(self, proposal: Dict[str, Any]) -> Dict[str, Any]:
        if not proposal:
            return None

        env_data = proposal.get('environmentalData', {})
        environmental_data = {
            'ndviBefore': float(env_data.get('ndviBefore', 0)) / 1e8,
            'ndviAfter': float(env_data.get('ndviAfter', 0)) / 1e8,
            'pm25Before': float(env_data.get('pm25Before', 0)) / 1e8,
            'pm25After': float(env_data.get('pm25After', 0)) / 1e8,
            'pm25IncreasePercent': float(env_data.get('pm25IncreasePercent', 0)) / 1e8,
            'vegetationLossPercent': float(env_data.get('vegetationLossPercent', 0)) / 1e8,
        }

        return {
            'id': proposal.get('id'),
            'parkName': proposal.get('parkName'),
            'parkId': proposal.get('parkId'),
            'description': proposal.get('description'),
            'yesVotes': proposal.get('yesVotes', 0),
            'noVotes': proposal.get('noVotes', 0),
            'endDate': proposal.get('endDate'),
            'creator': proposal.get('creator'),
            'status': proposal.get('status', 'active'),
            'environmentalData': environmental_data,
            'demographics': proposal.get('demographics', {}),
            'fundingEnabled': proposal.get('fundingEnabled', False),
            'fundingGoal': proposal.get('fundingGoal', 0),
            'totalFundsRaised': proposal.get('totalFundsRaised', 0),
            # CRE AI score fields
            'aiEnvironmentalScore': proposal.get('aiEnvironmentalScore', 0),
            'aiUrgencyLevel': proposal.get('aiUrgencyLevel', ''),
            'aiInsight': proposal.get('aiInsight', ''),
            'aiScored': proposal.get('aiScored', False),
        }
