import os
import json
import asyncio
from typing import Optional, Dict, Any, List
from datetime import datetime
from contextlib import asynccontextmanager
import asyncpg
import ee
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google import genai
from google.genai import types
import logging
import warnings
from dotenv import load_dotenv

from database import (
    init_db, close_db, query_parks_by_location, query_park_area_by_id,
    get_park_statistics_by_id, query_park_stat_by_id, get_park_ndvi,
    get_park_information, get_park_air_quality, analyze_park_removal_impact,
    analyze_park_removal_pollution_impact
)
from blockchain import BlockchainService
from models import (
    AgentRequest, LocationQuery, AnalyzeRequest, NDVIRequest,
    Intent, LocationType, Unit, LandUseType, IntentClassification,
    SendTokensRequest
)
from utils import (
    geometry_from_geojson, compute_ndvi, compute_walkability, compute_pm25,
    assess_air_quality_and_damage, get_air_quality_recommendations,
    compute_population, simulate_replacement_with_buildings,
    get_health_risk_category, get_environmental_damage_level
)
from agent import handle_agent_request, handle_analyze_request, handle_ndvi_request

load_dotenv()

warnings.filterwarnings("ignore", category=UserWarning, module="pydantic")
session_storage: Dict[str, Dict[str, Any]] = {}

gee_project_id = os.getenv('GEE_PROJECT_ID')
ee.Initialize(project=gee_project_id)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    logger.info("Database connection pool initialized")
    yield
    await close_db()

app = FastAPI(
    title="UrbanLeaf AI API",
    description="Urban planning and GIS-aware API",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
gemini_api_key = os.getenv("GEMINI_API_KEY")
if not gemini_api_key:
    raise ValueError("GEMINI_API_KEY environment variable is required")

try:
    client = genai.Client(api_key=gemini_api_key)
    logger.info("Gemini API client initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize Gemini API client: {e}")
    raise e


@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "name": "UrbanLeaf AI API",
        "version": "1.0.0",
        "description": "Urban planning and GIS-aware API",
        "endpoints": {
            "agent": "POST /api/agent - AI agent for park queries",
            "analyze": "POST /api/analyze - Analyze park removal impact",
            "ndvi": "POST /api/ndvi - Calculate NDVI for a location",
            "health": "GET /health - Health check",
            "proposals": "GET /api/proposals - Get all active proposals",
            "proposal_details": "GET /api/proposals/{id} - Get proposal details",
            "contract_info": "GET /api/contract-info - Get blockchain contract info"
        },
        "docs": "/docs",
        "redoc": "/redoc"
    }

@app.post("/api/agent")
async def agent_endpoint(request: AgentRequest):
    return await handle_agent_request(request, client)

@app.post("/api/analyze")
async def analyze_endpoint(request: AnalyzeRequest):
    return await handle_analyze_request(request)

@app.post("/api/ndvi")
async def ndvi_endpoint(request: NDVIRequest):
    return await handle_ndvi_request(request)

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.get("/api/parks/{zipcode}")
async def get_parks_by_zipcode(zipcode: str):
    """Get parks by zipcode"""
    try:
        logger.info(f"GET /api/parks/{zipcode} - Fetching parks for zipcode")
        query = LocationQuery(zip=zipcode)

        feature_collection = await query_parks_by_location(query)

        if not feature_collection or not feature_collection.get('features'):
            return {
                "success": False,
                "error": f"No parks found for zipcode {zipcode}"
            }

        return {
            "success": True,
            "featureCollection": feature_collection,
            "count": len(feature_collection.get('features', []))
        }

    except Exception as e:
        logger.error(f"Error fetching parks for zipcode {zipcode}: {e}")
        return {"success": False, "error": str(e)}

@app.get("/api/proposals")
async def get_proposals():
    """Get all proposals (active, accepted, rejected) from Arbitrum Sepolia blockchain"""
    try:
        blockchain_service = BlockchainService()

        if not await blockchain_service.is_connected():
            return {"success": False, "error": "Arbitrum Sepolia blockchain not connected"}

        import asyncio
        active_ids_task = blockchain_service.get_all_active_proposals()
        accepted_ids_task = blockchain_service.get_all_accepted_proposals()
        rejected_ids_task = blockchain_service.get_all_rejected_proposals()

        active_ids, accepted_ids, rejected_ids = await asyncio.gather(
            active_ids_task,
            accepted_ids_task,
            rejected_ids_task
        )

        all_proposal_ids = list(set(active_ids + accepted_ids + rejected_ids))

        proposals = []
        for proposal_id in all_proposal_ids:
            try:
                proposal_data = await blockchain_service.get_proposal(proposal_id)
                if proposal_data:
                    proposals.append(proposal_data)
            except Exception as e:
                logger.error(f"Error fetching proposal {proposal_id}: {e}")
                continue

        return {
            "success": True,
            "proposals": proposals,
            "count": len(proposals)
        }

    except Exception as e:
        logger.error(f"Error fetching proposals: {e}")
        return {"success": False, "error": str(e)}

@app.get("/api/proposals/{proposal_id}")
async def get_proposal_details(proposal_id: int):
    """Get detailed information for a specific proposal from Arbitrum Sepolia blockchain"""
    try:
        blockchain_service = BlockchainService()

        if not await blockchain_service.is_connected():
            return {"success": False, "error": "Arbitrum Sepolia blockchain not connected"}

        proposal = await blockchain_service.get_proposal(proposal_id)

        if not proposal:
            return {"success": False, "error": "Proposal not found"}

        return {
            "success": True,
            "proposal": proposal
        }

    except Exception as e:
        logger.error(f"Error fetching proposal {proposal_id}: {e}")
        return {"success": False, "error": str(e)}

@app.get("/api/contract-info")
async def get_contract_info():
    """Get contract info for frontend integration"""
    try:
        blockchain_service = BlockchainService()
        contract_info = await blockchain_service.get_contract_info()

        return {
            "success": True,
            "blockchain": "arbitrum_sepolia",
            "network": contract_info.get("network"),
            "contractAddress": contract_info.get("contractAddress"),
            "deployer": contract_info.get("deployer"),
            "explorerUrl": contract_info.get("explorerUrl")
        }

    except Exception as e:
        logger.error(f"Error getting contract info: {e}")
        return {"success": False, "error": str(e)}

@app.post("/api/create-proposal")
async def create_proposal(proposal_data: dict):
    """Create a new proposal on Arbitrum Sepolia blockchain"""
    try:
        blockchain_service = BlockchainService()

        if not await blockchain_service.is_connected():
            return {"success": False, "error": "Arbitrum Sepolia blockchain not connected"}
        result = await blockchain_service.create_proposal_on_blockchain(proposal_data)
        return result

    except Exception as e:
        logger.error(f"Error creating proposal: {e}")
        return {"success": False, "error": str(e)}

@app.get("/api/user-balances")
async def get_user_balances(address: str):
    """Get user ETH balance on Arbitrum Sepolia"""
    try:
        blockchain_service = BlockchainService()

        if not await blockchain_service.is_connected():
            return {"success": False, "error": "Arbitrum Sepolia blockchain not connected"}

        result = await blockchain_service.get_user_balances(address)
        return result

    except Exception as e:
        logger.error(f"Error getting user balances for {address}: {e}")
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", 4000)), reload=True)