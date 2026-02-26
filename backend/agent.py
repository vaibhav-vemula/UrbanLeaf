import json
import logging
from datetime import datetime
from fastapi import HTTPException
from google import genai

from models import AgentRequest, LocationQuery, IntentClassification, AnalyzeRequest, NDVIRequest
from database import (
    query_parks_by_location, query_park_area_by_id, query_park_stat_by_id,
    get_park_ndvi, get_park_information, get_park_air_quality,
    analyze_park_removal_impact
)
from utils import (
    geometry_from_geojson, compute_ndvi, compute_walkability, compute_pm25,
    compute_population, simulate_replacement_with_buildings
)
logger = logging.getLogger(__name__)

def get_session_storage():
    from main import session_storage
    return session_storage

async def log_agent_response(session_id: str, response: dict):
    """Pass through agent response (HCS logging removed — migrated to Arbitrum)"""
    return response

async def handle_agent_request(request: AgentRequest, client: genai.Client):
    """Handle agent requests and process user queries about parks"""
    try:
        message = request.message
        ui_context = request.uiContext or {}
        selected_park_id = ui_context.get("selectedParkId")
        session_id = request.sessionId or str(int(datetime.now().timestamp() * 1000000) % 1000000)
        wallet_address = request.walletAddress

        storage = get_session_storage()
        if session_id not in storage:
            storage[session_id] = {}

        if storage[session_id].get("awaiting_fundraising_response") or storage[session_id].get("awaiting_funding_goal"):
            logger.info(f"Continuing proposal creation flow for session {session_id}")
            response = await handle_create_proposal_intent(selected_park_id, session_id, message, wallet_address)
            return await log_agent_response(session_id, response)

        prompt = f"""Analyze this user query about parks and classify the intent:

User query: "{message}"

Examples:
- "show parks in Austin" -> show_parks intent, city location
- "show parks in zipcode 24060" -> show_parks intent, zip location
- "find parks in 90210" -> show_parks intent, zip location
- "parks in TX" -> show_parks intent, state location
- "how big is this park" -> ask_area intent
- "park area in square meters" -> ask_area intent, m2 unit
- "what's the NDVI of this park" -> park_ndvi_query intent
- "how green is this park" -> park_ndvi_query intent
- "how many people live here" -> park_stat_query intent, metric: "SUM_TOTPOP"
- "total population" -> park_stat_query intent, metric: "SUM_TOTPOP"
- "Asian population served" -> park_stat_query intent, metric: "SUM_ASIAN_"
- "how many kids are in this area" -> park_stat_query intent, metric: "SUM_KIDSVC"
- "seniors in the area" -> park_stat_query intent, metric: "SUM_SENIOR"
- "young adults population" -> park_stat_query intent, metric: "SUM_YOUNGP"
- "adults in the area" -> park_stat_query intent, metric: "SUM_YOUNGP"
- "adult population served" -> park_stat_query intent, metric: "SUM_YOUNGP"
- "what happens if removed" -> park_removal_impact intent, landUseType: removed
- "tell me about this park" -> park_info_query intent
- "describe this park" -> park_info_query intent
- "park information" -> park_info_query intent
- "when was this park built" -> park_info_query intent
- "what's the air quality here" -> air_quality_query intent
- "pollution levels in this area" -> air_quality_query intent
- "is the air safe to breathe" -> air_quality_query intent
- "PM2.5 levels" -> air_quality_query intent
- "air pollution near this park" -> air_quality_query intent
- "how polluted is this area" -> air_quality_query intent
- "propose this to the community" -> create_proposal intent
- "create a proposal" -> create_proposal intent
- "submit this as proposal" -> create_proposal intent
- "submit proposal with end date" -> create_proposal intent
- "create proposal with deadline 25th october 2025" -> create_proposal intent
- "hello" -> greeting intent"""

        try:
            schema = {
                "type": "OBJECT",
                "properties": {
                    "intent": {
                        "type": "STRING",
                        "enum": [
                            "show_parks", "ask_area", "greeting", "unknown",
                            "park_removal_impact", "park_ndvi_query", "park_stat_query",
                            "park_info_query", "air_quality_query", "create_proposal"
                        ]
                    },
                    "locationType": {"type": "STRING"},
                    "locationValue": {"type": "STRING"},
                    "unit": {"type": "STRING"},
                    "landUseType": {"type": "STRING"},
                    "metric": {"type": "STRING"}
                },
                "required": ["intent"]
            }

            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config={
                    "response_mime_type": "application/json",
                    "response_schema": schema,
                }
            )
            logger.info(f"Gemini structured response: {response.text}")

            parsed = json.loads(response.text)

        except Exception as e:
            logger.error(f"Gemini API error: {e}")
            parsed = {"intent": "unknown"}

        logger.info(f"Parsed intent: {parsed.get('intent')}")

        if parsed.get("intent") == "show_parks":
            response = await handle_show_parks_intent(parsed, session_id)
            return await log_agent_response(session_id, response)
        elif parsed.get("intent") == "ask_area":
            response = await handle_ask_area_intent(parsed, selected_park_id, session_id)
            return await log_agent_response(session_id, response)
        elif parsed.get("intent") == "park_removal_impact":
            response = await handle_park_removal_impact_intent(parsed, selected_park_id, session_id)
            return await log_agent_response(session_id, response)
        elif parsed.get("intent") == "park_ndvi_query":
            response = await handle_park_ndvi_query_intent(selected_park_id, session_id)
            return await log_agent_response(session_id, response)
        elif parsed.get("intent") == "park_stat_query":
            response = await handle_park_stat_query_intent(parsed, selected_park_id, session_id)
            return await log_agent_response(session_id, response)
        elif parsed.get("intent") == "park_info_query":
            response = await handle_park_info_query_intent(selected_park_id, session_id, client)
            return await log_agent_response(session_id, response)
        elif parsed.get("intent") == "air_quality_query":
            response = await handle_air_quality_query_intent(selected_park_id, session_id)
            return await log_agent_response(session_id, response)
        elif parsed.get("intent") == "create_proposal":
            response = await handle_create_proposal_intent(selected_park_id, session_id, message, wallet_address)
            return await log_agent_response(session_id, response)
        elif parsed.get("intent") == "greeting":
            response = handle_greeting_intent(session_id)
            return await log_agent_response(session_id, response)

        fallback_reply = "I'm UrbanLeaf AI, your urban intelligence assistant. I can show parks by zipcode/city/state, analyze environmental impacts, or tell you about a selected park. Try asking: \"show parks in 90210\" or \"what happens if this park is removed?\""
        response = {
            "sessionId": session_id,
            "action": "answer",
            "reply": fallback_reply,
        }
        return await log_agent_response(session_id, response)

    except Exception as e:
        logger.error(f"Error in agent endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail="Server error")

async def handle_show_parks_intent(parsed, session_id):
    """Handle show parks intent"""
    query = LocationQuery()
    location_value = parsed.get("locationValue", "")
    location_type = parsed.get("locationType")

    if not location_type and location_value:
        if location_value.strip().isdigit() and len(location_value.strip()) == 5:
            location_type = "zip"
        elif len(location_value.strip()) == 2 and location_value.strip().isalpha():
            location_type = "state"
        else:
            location_type = "city"

    if location_type == "zip":
        query.zip = location_value
    elif location_type == "city":
        query.city = location_value
    elif location_type == "state":
        query.state = location_value

    fc = await query_parks_by_location(query)
    reply = f"Loaded {len(fc['features'])} park(s) for {location_type}: {location_value}."

    return {
        "sessionId": session_id,
        "action": "render_parks",
        "reply": reply,
        "data": {"featureCollection": fc},
    }

async def handle_ask_area_intent(parsed, selected_park_id, session_id):
    """Handle ask area intent"""
    if not selected_park_id:
        return {
            "sessionId": session_id,
            "action": "need_selection",
            "reply": "Please click a park first.",
        }

    info = await query_park_area_by_id(selected_park_id)
    if not info:
        return {
            "sessionId": session_id,
            "action": "error",
            "reply": "Could not find that park.",
        }

    value = info["acres"]
    unit = parsed.get("unit", "acres")
    converted = value
    unit_label = "acres"

    if unit == "m2":
        converted = value * 4046.86
        unit_label = "m²"
    elif unit == "km2":
        converted = value * 0.00404686
        unit_label = "km²"
    elif unit == "hectares":
        converted = value * 0.404686
        unit_label = "hectares"

    formatted = f"{converted:,.2f}"
    reply = f"Area of \"{info['name']}\": {formatted} {unit_label}."

    return {
        "sessionId": session_id,
        "action": "answer",
        "reply": reply,
        "data": {
            "parkId": selected_park_id,
            "area": converted,
            "unit": unit_label,
        },
    }

async def handle_park_removal_impact_intent(parsed, selected_park_id, session_id):
    """Handle park removal impact intent"""
    if not selected_park_id:
        return {
            "sessionId": session_id,
            "action": "need_selection",
            "reply": "Please select a park to analyze its removal impact.",
        }

    impact = await analyze_park_removal_impact(
        selected_park_id, parsed.get("landUseType", "removed")
    )

    storage = get_session_storage()
    if session_id not in storage:
        storage[session_id] = {}

    storage[session_id]["latest_removal_analysis"] = {
        "park_id": selected_park_id,
        "analysis_data": impact,
        "timestamp": datetime.now().isoformat()
    }

    return {
        "sessionId": session_id,
        "action": "removal_impact",
        "reply": impact["message"],
        "data": impact,
    }

async def handle_park_ndvi_query_intent(selected_park_id, session_id):
    """Handle park NDVI query intent"""
    if not selected_park_id:
        return {
            "sessionId": session_id,
            "action": "need_selection",
            "reply": "Please select a park.",
        }

    ndvi = await get_park_ndvi(selected_park_id)
    reply = f"The NDVI of this park is approximately {ndvi:.3f}."

    return {
        "sessionId": session_id,
        "action": "answer",
        "reply": reply,
        "data": {"ndvi": ndvi},
    }

async def handle_park_stat_query_intent(parsed, selected_park_id, session_id):
    """Handle park statistics query intent"""
    if not selected_park_id:
        return {
            "sessionId": session_id,
            "action": "need_selection",
            "reply": "Please select a park.",
        }
    if not parsed.get("metric"):
        return {
            "sessionId": session_id,
            "action": "error",
            "reply": "Metric not specified.",
        }

    stat = await query_park_stat_by_id(selected_park_id, parsed["metric"])
    reply = f"The value for {parsed['metric']} is {stat['formatted']}."

    return {
        "sessionId": session_id,
        "action": "answer",
        "reply": reply,
        "data": {"metric": parsed["metric"], "value": stat["value"]},
    }

async def handle_park_info_query_intent(selected_park_id, session_id, client):
    """Handle park information query intent"""
    if not selected_park_id:
        return {
            "sessionId": session_id,
            "action": "need_selection",
            "reply": "Please select a park to get information about.",
        }

    park_info = await get_park_information(selected_park_id, client)

    return {
        "sessionId": session_id,
        "action": "park_information",
        "reply": park_info["description"],
        "data": park_info,
    }

async def handle_air_quality_query_intent(selected_park_id, session_id):
    """Handle air quality query intent"""
    if not selected_park_id:
        return {
            "sessionId": session_id,
            "action": "need_selection",
            "reply": "Please select a park to check air quality.",
        }

    air_quality_data = await get_park_air_quality(selected_park_id)

    return {
        "sessionId": session_id,
        "action": "air_quality_assessment",
        "reply": air_quality_data["message"],
        "data": air_quality_data,
    }

def handle_greeting_intent(session_id):
    """Handle greeting intent"""
    reply = "Hello! Welcome to UrbanLeaf AI - your AI-powered urban intelligence platform. Try: \"show parks of zipcode 20008\" or \"show parks of city Austin\"."
    return {
        "sessionId": session_id,
        "action": "answer",
        "reply": reply,
    }

async def handle_create_proposal_intent(selected_park_id, session_id, message, wallet_address=None):
    """Handle create proposal intent with fundraising questions"""
    from supabase_client import check_user_authorization

    # Check authorization first
    auth_result = await check_user_authorization(wallet_address)

    if not auth_result["authorized"]:
        error_msg = auth_result.get("error", "Authorization required")

        if error_msg and "not found" in error_msg.lower():
            reply = "⚠️ **Authorization Required**\n\nOnly authorized government employees or invited city planners can create proposals.\n\nAre you an authorized user? Complete your profile to verify your government employee status."
        else:
            reply = "⚠️ **Authorization Required**\n\nOnly authorized government employees or invited city planners can create proposals.\n\nAre you an authorized user? Update your profile to verify your government employee status."

        return {
            "sessionId": session_id,
            "action": "unauthorized",
            "reply": reply,
            "showProfileButton": True,
        }

    logger.info(f"User {wallet_address} authorized to create proposal")

    storage = get_session_storage()

    if session_id not in storage or "latest_removal_analysis" not in storage[session_id]:
        return {
            "sessionId": session_id,
            "action": "need_analysis",
            "reply": "Please analyze the park removal first before creating a proposal. Ask 'what happens if removed' for the selected park.",
        }

    if storage[session_id].get("awaiting_fundraising_response"):
        message_lower = message.lower().strip()
        if any(word in message_lower for word in ['yes', 'yeah', 'yep', 'sure', 'y', 'enable', 'fund']):
            storage[session_id]["fundraising_enabled"] = True
            storage[session_id]["awaiting_fundraising_response"] = False
            storage[session_id]["awaiting_funding_goal"] = True

            return {
                "sessionId": session_id,
                "action": "ask_funding_goal",
                "reply": "Great! What funding goal are you planning for this proposal?\n\nPlease specify the amount in ETH (e.g., '0.1 ETH' or '0.5').",
            }
        elif any(word in message_lower for word in ['no', 'nope', 'nah', 'n', 'skip', 'dont', "don't"]):
            storage[session_id]["fundraising_enabled"] = False
            storage[session_id]["funding_goal"] = 0
            storage[session_id]["awaiting_fundraising_response"] = False

            return await _create_proposal_with_settings(selected_park_id, session_id, message, wallet_address, storage)
        else:
            return {
                "sessionId": session_id,
                "action": "clarify_fundraising",
                "reply": "I need a clear yes or no response. Would you like to enable fundraising if this proposal is accepted?\n\nRespond with 'yes' or 'no'.",
            }

    if storage[session_id].get("awaiting_funding_goal"):
        import re
        numbers = re.findall(r'\d+(?:,\d{3})*(?:\.\d+)?', message)
        if numbers:
            goal_hbar = float(numbers[0].replace(',', ''))
            storage[session_id]["funding_goal"] = int(goal_hbar * 100000000)
            storage[session_id]["awaiting_funding_goal"] = False
            return await _create_proposal_with_settings(selected_park_id, session_id, message, wallet_address, storage)
        else:
            return {
                "sessionId": session_id,
                "action": "clarify_goal",
                "reply": "Please specify a valid funding goal amount in ETH.\n\nFor example: '0.1' or '0.5 ETH'",
            }
    storage[session_id]["awaiting_fundraising_response"] = True

    return {
        "sessionId": session_id,
        "action": "ask_fundraising",
        "reply": "Would you like to enable fundraising if this proposal is accepted?\n\nThis will allow community members to donate ETH to support the initiative.\n\nRespond with 'yes' or 'no'.",
    }

def _cleanup_proposal_session(storage, session_id):
    """Clean up proposal creation session flags"""
    if session_id in storage:
        storage[session_id].pop("awaiting_fundraising_response", None)
        storage[session_id].pop("awaiting_funding_goal", None)
        storage[session_id].pop("fundraising_enabled", None)
        storage[session_id].pop("funding_goal", None)

async def _create_proposal_with_settings(selected_park_id, session_id, message, wallet_address, storage):
    """Create the proposal with the configured fundraising settings"""

    removal_analysis = storage[session_id]["latest_removal_analysis"]
    analysis_data = removal_analysis["analysis_data"]
    fundraising_enabled = storage[session_id].get("fundraising_enabled", False)
    funding_goal = storage[session_id].get("funding_goal", 0)

    end_date = "November 30, 2025"
    if message:
        message_lower = message.lower()
        if "november 30" in message_lower or "30th november" in message_lower:
            end_date = "November 30, 2025"
        elif "date" in message_lower or "deadline" in message_lower:
            import re
            date_pattern = r'\b(\d{1,2}(?:st|nd|rd|th)?\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4})\b'
            date_match = re.search(date_pattern, message_lower)
            if date_match:
                end_date = date_match.group(1).title()

    park_name = analysis_data.get("parkName", "Selected Park")

    proposal_summary = f"""
🏛️ **COMMUNITY PROPOSAL: PARK PROTECTION INITIATIVE**

**Park:** {park_name}
**Proposal Deadline:** {end_date}
**Status:** OPEN FOR COMMUNITY INPUT

---

**📊 ENVIRONMENTAL IMPACT ANALYSIS**

**Vegetation Health Impact:**
• Current NDVI: {analysis_data.get('ndviBefore', 'Unknown')}
• Post-removal NDVI: {analysis_data.get('ndviAfter', 'Unknown')}
• Vegetation loss: {round((analysis_data.get('ndviBefore', 0) - analysis_data.get('ndviAfter', 0)) * 100, 1) if analysis_data.get('ndviBefore') and analysis_data.get('ndviAfter') else 'Unknown'}%

**Air Quality Impact:**
• Current PM2.5: {analysis_data.get('pm25Before', 'Unknown')} μg/m³
• Projected PM2.5: {analysis_data.get('pm25After', 'Unknown')} μg/m³
• Pollution increase: +{analysis_data.get('pm25IncreasePercent', 'Unknown')}%

**Community Impact:**
• Population affected: {analysis_data.get('affectedPopulation10MinWalk', 0):,} residents
• Demographics impacted:
  - Children: {analysis_data.get('demographics', {}).get('kids', 0):,}
  - Adults: {analysis_data.get('demographics', {}).get('adults', 0):,}
  - Seniors: {analysis_data.get('demographics', {}).get('seniors', 0):,}

---

**🎯 PROPOSAL SUMMARY**

Based on the environmental impact analysis, removing {park_name} would significantly harm our community through:

1. **Environmental Degradation:** {round((analysis_data.get('ndviBefore', 0) - analysis_data.get('ndviAfter', 0)) * 100, 1) if analysis_data.get('ndviBefore') and analysis_data.get('ndviAfter') else 'Significant'}% loss in vegetation health
2. **Air Quality Decline:** {analysis_data.get('pm25IncreasePercent', 'Substantial')}% increase in air pollution
3. **Community Health Impact:** {analysis_data.get('affectedPopulation10MinWalk', 0):,} residents losing access to green space

**We propose to PROTECT this vital community asset and explore alternative development solutions that preserve environmental and public health.**

---

**📝 COMMUNITY ACTION ITEMS**
• Review environmental impact data
• Attend community meetings before {end_date}
• Submit feedback to local planning committee
• Share this proposal with neighbors and stakeholders

---

*Environmental analysis generated by UrbanLeaf AI on {removal_analysis.get('timestamp', 'recent analysis')}*
*UrbanLeaf AI - AI-Powered Urban Intelligence Platform*
"""

    frontend_description_prompt = f"""Generate a neutral, objective 600-character description for a community proposal about {park_name}.

Environmental data:
- Vegetation health would decline significantly
- Air quality would worsen with increased pollution
- Thousands of residents would lose access to green space
- Community demographics include families with children and seniors

Requirements:
- Start with "This park"
- Write in a factual, descriptive style
- Describe what the park provides and potential impacts
- Mention environmental and health impacts WITHOUT using specific numbers
- Keep it around 600 characters (can be between 550-600)
- Be neutral and objective, avoid advocacy language
- Present facts about impacts, not calls to action
- Include more details about the park's role in the community"""

    try:
        frontend_desc_response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=frontend_description_prompt
        )
        frontend_description = frontend_desc_response.text.strip()

        if len(frontend_description) > 600:
            frontend_description = frontend_description[:597] + "..."

        logger.info(f"Generated frontend description ({len(frontend_description)} chars): {frontend_description}")
    except Exception as e:
        logger.error(f"Error generating frontend description with Gemini: {e}")
        frontend_description = f"This park provides essential green space serving thousands of local residents including families with children and seniors. Its removal would result in significantly reduced air quality, decreased vegetation health, and loss of recreational opportunities for the surrounding community. The park serves as a vital gathering place where neighbors connect and children play safely. The environmental impact would extend beyond the immediate area, affecting air quality and reducing the overall livability of the neighborhood for current and future residents."

    proposal_data = {
        "parkId": selected_park_id,
        "parkName": park_name,
        "proposalSummary": proposal_summary,
        "endDate": end_date,
        "analysisData": analysis_data,
        "frontendDescription": frontend_description,
        "timestamp": datetime.now().isoformat(),
        "fundraisingEnabled": fundraising_enabled,
        "fundingGoal": funding_goal,
        "creator": wallet_address
    }

    try:
        from blockchain import BlockchainService
        blockchain_service = BlockchainService()
        if not await blockchain_service.is_connected():
            logger.warning("Blockchain not connected, creating proposal locally only")
            _cleanup_proposal_session(storage, session_id)
            return {
                "sessionId": session_id,
                "action": "proposal_created",
                "reply": f"Community proposal created for {park_name} with deadline {end_date}. The proposal includes comprehensive environmental impact analysis and is ready for community review.\n\n⚠️ Note: Blockchain submission disabled - proposal created locally only.",
                "data": proposal_data
            }

        blockchain_result = await blockchain_service.create_proposal_on_blockchain(proposal_data)

        if blockchain_result['success']:
            try:
                from email_service import email_service
                from database import get_users_by_zip_code

                proposal_id = blockchain_result.get('proposal_id', 0)
                park_zip = analysis_data.get('parkZip') or removal_analysis.get('parkZip')
                if not park_zip and selected_park_id:
                    from database import get_supabase
                    supabase = get_supabase()
                    try:
                        park_response = supabase.table('parks').select('park_zip').eq('park_id', selected_park_id).execute()
                        if park_response.data and len(park_response.data) > 0:
                            park_zip = park_response.data[0].get('park_zip')
                    except Exception as e:
                        logger.error(f"Error fetching park zip: {e}")

                if park_zip:
                    users = await get_users_by_zip_code(park_zip)
                    description = blockchain_result.get('email_summary',
                        f"{park_name}: Environmental impact analysis shows significant changes to vegetation and air quality."
                    )
                    emails_sent = 0
                    for user in users:
                        try:
                            email_sent = email_service.send_proposal_notification(
                                recipient_email=user['email'],
                                park_name=park_name,
                                proposal_id=proposal_id,
                                end_date=end_date,
                                description=description
                            )
                            if email_sent:
                                emails_sent += 1
                        except Exception as e:
                            logger.error(f"Failed to send email to {user['email']}: {e}")

                    if emails_sent > 0:
                        logger.info(f"Sent {emails_sent} email notifications to users in ZIP {park_zip} for proposal #{proposal_id}")
                    else:
                        logger.warning(f"No emails sent for proposal #{proposal_id} (ZIP: {park_zip}, {len(users)} users found)")
                else:
                    logger.warning(f"Could not determine park ZIP code, no emails sent for proposal #{proposal_id}")

            except Exception as e:
                logger.error(f"Error sending email notifications: {e}")
                import traceback
                traceback.print_exc()

            reply = f"""Community proposal created for {park_name} with deadline {end_date}.

✅ **Successfully submitted to Arbitrum Sepolia!**
🔗 Transaction: {blockchain_result['transaction_hash'][:10]}...{blockchain_result['transaction_hash'][-8:]}
🌐 View on Arbiscan: {blockchain_result['explorer_url']}

The proposal includes comprehensive environmental impact analysis and is ready for community review."""

            _cleanup_proposal_session(storage, session_id)
            return {
                "sessionId": session_id,
                "action": "proposal_created",
                "reply": reply,
                "data": {
                    **proposal_data,
                    "blockchain": blockchain_result
                }
            }
        else:
            reply = f"""Community proposal created for {park_name} with deadline {end_date}.

⚠️ **Blockchain submission failed:** {blockchain_result.get('error', 'Unknown error')}

The proposal has been created locally and includes comprehensive environmental impact analysis. It is ready for community review, but was not submitted to the blockchain."""

            _cleanup_proposal_session(storage, session_id)
            return {
                "sessionId": session_id,
                "action": "proposal_created",
                "reply": reply,
                "data": {
                    **proposal_data,
                    "blockchain": {"error": blockchain_result.get('error')}
                }
            }

    except ImportError:
        logger.warning("Blockchain module not available")
        _cleanup_proposal_session(storage, session_id)
        return {
            "sessionId": session_id,
            "action": "proposal_created",
            "reply": f"Community proposal created for {park_name} with deadline {end_date}. The proposal includes comprehensive environmental impact analysis and is ready for community review.\n\n⚠️ Note: Blockchain integration not available - proposal created locally only.",
            "data": proposal_data
        }
    except Exception as e:
        logger.error(f"Blockchain integration error: {str(e)}")
        _cleanup_proposal_session(storage, session_id)
        return {
            "sessionId": session_id,
            "action": "proposal_created",
            "reply": f"Community proposal created for {park_name} with deadline {end_date}. The proposal includes comprehensive environmental impact analysis and is ready for community review.\n\n⚠️ Note: Blockchain submission failed ({str(e)}) - proposal created locally only.",
            "data": proposal_data
        }

async def handle_analyze_request(request: AnalyzeRequest):
    """Handle analyze endpoint requests"""
    try:
        geometry = request.geometry
        land_use_type = request.landUseType

        try:
            park_geom = geometry_from_geojson(geometry)
            buffer_geom = park_geom.buffer(800)
        except ValueError as e:
            logger.error(f"Geometry error in analyze endpoint: {e}")
            raise HTTPException(status_code=400, detail=f"Invalid geometry: {str(e)}")

        ndvi_before = compute_ndvi(buffer_geom)
        walkability_before = compute_walkability(buffer_geom)
        pm25_before = compute_pm25(buffer_geom)
        affected_population = compute_population(buffer_geom)

        if land_use_type == "removed":
            buffer_after = buffer_geom.difference(park_geom)
            ndvi_after = compute_ndvi(buffer_after)
        elif land_use_type == "replaced_by_building":
            ndvi_after = simulate_replacement_with_buildings(buffer_geom, park_geom)
        else:
            ndvi_after = ndvi_before

        walkability_after = compute_walkability(buffer_geom.difference(park_geom))
        pm25_after = compute_pm25(buffer_geom.difference(park_geom))

        return {
            "affectedPopulation10MinWalk": int(affected_population),
            "ndviBefore": round(ndvi_before, 4) if ndvi_before else None,
            "ndviAfter": round(ndvi_after, 4) if ndvi_after else None,
            "walkabilityBefore": walkability_before,
            "walkabilityAfter": walkability_after,
            "pm25Before": round(pm25_before, 2) if pm25_before else None,
            "pm25After": round(pm25_after, 2) if pm25_after else None
        }

    except Exception as e:
        logger.error(f"Error in analyze endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

async def handle_ndvi_request(request: NDVIRequest):
    """Handle NDVI endpoint requests"""
    try:
        try:
            geometry = geometry_from_geojson(request.geometry)
        except ValueError as e:
            logger.error(f"Geometry error in NDVI endpoint: {e}")
            raise HTTPException(status_code=400, detail=f"Invalid geometry: {str(e)}")

        ndvi_value = compute_ndvi(geometry)

        return {
            "ndvi": round(ndvi_value, 4) if ndvi_value is not None else None
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in NDVI endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))