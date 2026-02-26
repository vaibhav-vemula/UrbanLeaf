import os
import asyncio
import logging
from dotenv import load_dotenv
from flow_py_sdk import flow_client, cadence, Tx, ProposalKey, InMemorySigner
from flow_py_sdk.cadence import Address
from flow_py_sdk.signer import SignAlgo, HashAlgo
from datetime import datetime

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ProposalCloser:
    def __init__(self):
        self.network = os.getenv('FLOW_NETWORK', 'testnet')
        self.private_key_hex = os.getenv('FLOW_PRIVATE_KEY')
        self.address = os.getenv('FLOW_ADDRESS', '').replace('0x', '')
        self.contract_address = os.getenv('FLOW_CONTRACT_ADDRESS', self.address).replace('0x', '')

        network_configs = {
            'testnet': {
                'host': 'access.devnet.nodes.onflow.org',
                'port': '9000',
            },
            'mainnet': {
                'host': 'access.mainnet.nodes.onflow.org',
                'port': '9000',
            },
            'emulator': {
                'host': 'localhost',
                'port': '3569',
            }
        }

        config = network_configs.get(self.network, network_configs['testnet'])
        self.access_node_host = config['host']
        self.access_node_port = config['port']

        self.signer = InMemorySigner(
            hash_algo=HashAlgo.SHA3_256,
            sign_algo=SignAlgo.ECDSA_P256,
            private_key_hex=self.private_key_hex
        )

    async def get_all_active_proposals(self):
        """Get all active proposal IDs from the blockchain"""
        try:
            async with flow_client(host=self.access_node_host, port=self.access_node_port) as client:
                script_code = f'''
                    import UrbanLeaf AICommunity from 0x{self.contract_address}

                    access(all) fun main(): [UInt64] {{
                        return UrbanLeaf AICommunity.getAllActiveProposals()
                    }}
                '''

                result = await client.execute_script_at_latest_block(
                    script=script_code.encode('utf-8'),
                    arguments=[]
                )

                if result:
                    import json
                    from flow_py_sdk.cadence import cadence_object_hook
                    cadence_value = json.loads(result, object_hook=cadence_object_hook)

                    if hasattr(cadence_value, 'value'):
                        return [int(id.value) if hasattr(id, 'value') else int(id) for id in cadence_value.value]
                    return [int(id.value) if hasattr(id, 'value') else int(id) for id in cadence_value] if cadence_value else []
                return []

        except Exception as e:
            logger.error(f"Failed to get active proposals: {e}")
            return []

    async def get_proposal_details(self, proposal_id: int):
        """Get proposal details including end date"""
        try:
            async with flow_client(host=self.access_node_host, port=self.access_node_port) as client:
                script_code = f'''
                    import UrbanLeaf AICommunity from 0x{self.contract_address}

                    access(all) fun main(proposalId: UInt64): UrbanLeaf AICommunity.Proposal? {{
                        return UrbanLeaf AICommunity.getProposal(proposalId: proposalId)
                    }}
                '''

                from flow_py_sdk.cadence import encode_arguments
                encoded_args = encode_arguments([cadence.UInt64(proposal_id)])

                result = await client.execute_script_at_latest_block(
                    script=script_code.encode('utf-8'),
                    arguments=encoded_args
                )

                if result:
                    import json
                    from flow_py_sdk.cadence import cadence_object_hook
                    cadence_value = json.loads(result, object_hook=cadence_object_hook)
                    return cadence_value
                return None

        except Exception as e:
            logger.error(f"Failed to get proposal {proposal_id}: {e}")
            return None

    async def close_proposal(self, proposal_id: int):
        """Close a proposal by calling the Admin's updateProposalStatus function"""
        try:
            async with flow_client(host=self.access_node_host, port=self.access_node_port) as client:
                account_address = Address.from_hex(self.address)
                account = await client.get_account_at_latest_block(address=account_address.bytes)
                latest_block = await client.get_latest_block()
                transaction_script = f'''
                    import UrbanLeaf AICommunity from 0x{self.contract_address}

                    transaction(proposalId: UInt64) {{
                        let admin: &UrbanLeaf AICommunity.Admin

                        prepare(signer: auth(BorrowValue) &Account) {{
                            // Borrow the admin resource from storage
                            self.admin = signer.storage.borrow<&UrbanLeaf AICommunity.Admin>(
                                from: UrbanLeaf AICommunity.AdminStoragePath
                            ) ?? panic("Could not borrow admin resource")
                        }}

                        execute {{
                            self.admin.updateProposalStatus(proposalId: proposalId)
                            log("Proposal status updated successfully")
                        }}
                    }}
                '''

                proposal_key = ProposalKey(
                    key_address=account_address,
                    key_id=0,
                    key_sequence_number=account.keys[0].sequence_number
                )

                tx = Tx(
                    code=transaction_script,
                    reference_block_id=latest_block.id,
                    payer=account_address,
                    proposal_key=proposal_key
                )

                tx.add_authorizers(account_address)
                tx.add_arguments(cadence.UInt64(proposal_id))
                tx = tx.with_envelope_signature(
                    account_address,
                    0,
                    self.signer
                )

                logger.info(f"Sending transaction to close proposal {proposal_id}...")
                tx_grpc = tx.to_signed_grpc()
                tx_result = await client.send_transaction(transaction=tx_grpc)
                tx_id = tx_result.id.hex()

                logger.info(f"Transaction sent: {tx_id}")

                max_attempts = 30
                attempt = 0
                while attempt < max_attempts:
                    await asyncio.sleep(2)

                    tx_result_response = await client.get_transaction_result(id=tx_result.id)

                    if tx_result_response.status >= 4:
                        if tx_result_response.error_message:
                            logger.error(f"Transaction failed: {tx_result_response.error_message}")
                            return False

                        logger.info(f"Proposal {proposal_id} closed successfully!")
                        return True

                    attempt += 1

                logger.error(f"Transaction timeout for proposal {proposal_id}")
                return False

        except Exception as e:
            logger.error(f"Failed to close proposal {proposal_id}: {e}")
            import traceback
            traceback.print_exc()
            return False

    async def close_all_active_proposals(self):
        """Close all active proposals that have passed their end date"""
        logger.info("Fetching all active proposals...")

        active_proposals = await self.get_all_active_proposals()

        if not active_proposals:
            logger.info("No active proposals found.")
            return

        logger.info(f"Found {len(active_proposals)} active proposals")

        current_time = datetime.now().timestamp()
        closed_count = 0
        skipped_count = 0
        failed_count = 0

        for proposal_id in active_proposals:
            logger.info(f"Processing Proposal ID: {proposal_id}")
            proposal = await self.get_proposal_details(proposal_id)

            if not proposal:
                logger.warning(f"Could not fetch details for proposal {proposal_id}")
                failed_count += 1
                continue

            proposal_struct = proposal.value if hasattr(proposal, 'value') else proposal

            if hasattr(proposal_struct, 'fields') and isinstance(proposal_struct.fields, dict):
                end_date_field = proposal_struct.fields.get('endDate')
                if end_date_field and hasattr(end_date_field, 'value'):
                    end_date = float(end_date_field.value) / 1e8

                    logger.info(f"End date: {datetime.fromtimestamp(end_date).strftime('%Y-%m-%d %H:%M:%S')}")
                    logger.info(f"Current time: {datetime.fromtimestamp(current_time).strftime('%Y-%m-%d %H:%M:%S')}")

                    if current_time > end_date:
                        logger.info("✓ Voting period has ended. Closing proposal...")
                        success = await self.close_proposal(proposal_id)

                        if success:
                            closed_count += 1
                        else:
                            failed_count += 1
                    else:
                        logger.info("⏳ Voting period has not ended yet. Skipping...")
                        skipped_count += 1
                else:
                    logger.warning("Could not extract end date from proposal")
                    failed_count += 1
            else:
                logger.warning("Unexpected proposal structure")
                failed_count += 1
                
        logger.info(f"Total active proposals: {len(active_proposals)}")
        logger.info(f"Successfully closed: {closed_count}")
        logger.info(f"Skipped (still active): {skipped_count}")
        logger.info(f"Failed: {failed_count}")


async def main():
    """Main function to run the script"""
    closer = ProposalCloser()
    await closer.close_all_active_proposals()

if __name__ == "__main__":
    asyncio.run(main())
