import os
import json
from typing import Optional, Dict, Any, List
from supabase import create_client, Client
from fastapi import HTTPException
import logging
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_supabase_client = None

def get_supabase() -> Client:
    """Get or create Supabase client (lazy initialization for serverless)"""
    global _supabase_client
    if _supabase_client is None:
        logger.info("Initializing Supabase client...")

        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_KEY")

        if not supabase_url or not supabase_key:
            raise ValueError("SUPABASE_URL and SUPABASE_KEY environment variables are required")

        _supabase_client = create_client(supabase_url, supabase_key)
        logger.info("Supabase client initialized")

    return _supabase_client

async def init_db():
    """Initialize Supabase client"""
    get_supabase()
    logger.info("Database initialized (Supabase client)")

async def close_db():
    """Close Supabase client (no-op)"""
    pass

def build_feature_collection(rows):
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": json.loads(row["geometry"]) if isinstance(row["geometry"], str) else row["geometry"],
                "properties": {
                    "id": row["park_id"],
                    "gid": row["gid"],
                    "Park_id": row["park_id"],
                    "Park_Name": row["park_name"],
                    "Park_Addre": row["park_addre"],
                    "Park_Owner": row["park_owner"],
                    "Park_Zip": row["park_zip"],
                    "Park_Size_Acres": row["area_acres"],
                },
            }
            for row in rows
        ],
    }

async def query_parks_by_location(query, simplify_tolerance: float = 0.0002):
    supabase = get_supabase()

    try:
        db_query = supabase.table('parks').select(
            'gid, park_id, park_name, park_addre, park_owner, park_zip, '
            'park_size_, shape_area, geom'
        )
        if query.zip:
            db_query = db_query.eq('park_zip', query.zip)
        elif query.city:
            db_query = db_query.ilike('park_place', query.city)
        elif query.state:
            db_query = db_query.ilike('park_state', query.state)
        else:
            return {"type": "FeatureCollection", "features": []}
        response = db_query.limit(5000).execute()

        features = []
        for row in response.data:
            area_acres = row.get('park_size_') or (row.get('shape_area', 0) * 0.000247105 if row.get('shape_area') else 0)
            geometry = row.get('geom', {})

            features.append({
                "type": "Feature",
                "geometry": geometry if isinstance(geometry, dict) else json.loads(geometry) if geometry else {},
                "properties": {
                    "id": row['park_id'],
                    "gid": row['gid'],
                    "Park_id": row['park_id'],
                    "Park_Name": row['park_name'],
                    "Park_Addre": row['park_addre'],
                    "Park_Owner": row['park_owner'],
                    "Park_Zip": row['park_zip'],
                    "Park_Size_Acres": area_acres,
                }
            })

        return {"type": "FeatureCollection", "features": features}

    except Exception as e:
        logger.error(f"Error querying parks: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def query_park_area_by_id(park_id: str):
    supabase = get_supabase()
    try:
        response = supabase.table('parks').select(
            'park_name, park_size_, shape_area'
        ).eq('park_id', park_id).limit(1).execute()

        if not response.data:
            return None

        row = response.data[0]
        area_acres = row.get('park_size_') or (row.get('shape_area', 0) * 0.000247105 if row.get('shape_area') else 0)

        return {
            "name": row.get("park_name") or "Unnamed Park",
            "acres": area_acres,
        }
    except Exception as e:
        logger.error(f"Error querying park area by id {park_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def get_park_statistics_by_id(park_id: str):
    supabase = get_supabase()
    try:
        response = supabase.table('parks_stats').select(
            'sum_totpop, sum_kidsvc, sum_youngp, sum_senior, '
            'sum_hhilow, sum_hhimed, sum_hhihig, sum_tothhs, '
            'sum_white_, sum_black_, sum_asian_, sum_hisp_s, peracre'
        ).eq('park_id', park_id).execute()

        if not response.data:
            return None

        return response.data[0]
    except Exception as e:
        logger.error(f"Error getting park statistics by id {park_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def query_park_stat_by_id(park_id: str, metric: str):
    supabase = get_supabase()
    try:
        metric_lower = metric.lower()
        response = supabase.table('parks_stats').select(metric_lower).eq('park_id', park_id).limit(1).execute()

        if not response.data:
            return None

        row = response.data[0]
        try:
            value = row[metric_lower]
        except KeyError:
            logger.error(f"Column not found: {metric_lower}")
            return None

        return {
            "value": value,
            "formatted": f"{value:,}" if value else "0",
        }
    except Exception as e:
        logger.error(f"Error querying park stat by id {park_id}, metric {metric}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def get_park_ndvi(park_id: str):
    from utils import geometry_from_geojson, compute_ndvi
    supabase = get_supabase()
    try:
        response = supabase.table('parks').select('geom').eq('park_id', park_id).execute()

        if not response.data:
            raise HTTPException(status_code=404, detail="Park not found")

        row = response.data[0]
        geometry = row.get("geom")

        if not geometry:
            raise HTTPException(status_code=400, detail="Park has no geometry")

        try:
            park_geom = geometry_from_geojson(geometry)
            ndvi_value = compute_ndvi(park_geom)
            return ndvi_value
        except ValueError as e:
            logger.error(f"Geometry error for park {park_id}: {e}")
            raise HTTPException(status_code=400, detail=f"Invalid park geometry: {str(e)}")
        except Exception as e:
            logger.error(f"NDVI computation error for park {park_id}: {e}")
            raise HTTPException(status_code=500, detail=f"Error computing NDVI: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting park NDVI for {park_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def get_park_information(park_id: str, client):
    from utils import geometry_from_geojson, assess_air_quality_and_damage
    supabase = get_supabase()
    try:
        park_response = supabase.table('parks').select(
            'park_name, park_addre, park_owner, park_zip, park_size_, shape_area, geom'
        ).eq('park_id', park_id).execute()

        if not park_response.data:
            raise HTTPException(status_code=404, detail="Park not found")

        park_row = park_response.data[0]
        stats_response = supabase.table('parks_stats').select(
            'sum_totpop, sum_kidsvc, sum_senior, peracre'
        ).eq('park_id', park_id).execute()

        stats_row = stats_response.data[0] if stats_response.data else {}
        area_acres = park_row.get('park_size_') or (park_row.get('shape_area', 0) * 0.000247105 if park_row.get('shape_area') else 0)
        try:
            ndvi_value = await get_park_ndvi(park_id)
        except:
            ndvi_value = None

        try:
            geometry = park_row.get("geom")
            if geometry:
                park_geometry = geometry_from_geojson(geometry)
                air_quality = assess_air_quality_and_damage(park_geometry)
            else:
                air_quality = None
        except Exception as e:
            logger.error(f"Error getting air quality for park {park_id}: {e}")
            air_quality = None

        park_data = {
            "name": park_row.get("park_name") or "Unnamed Park",
            "address": park_row.get("park_addre") or "Address not available",
            "owner": park_row.get("park_owner") or "Owner not specified",
            "zipcode": park_row.get("park_zip") or "Unknown",
            "area_acres": round(area_acres, 2) if area_acres else "Unknown",
            "population_served": stats_row.get("sum_totpop") if stats_row.get("sum_totpop") else "Unknown",
            "kids_served": stats_row.get("sum_kidsvc") if stats_row.get("sum_kidsvc") else "Unknown",
            "seniors_served": stats_row.get("sum_senior") if stats_row.get("sum_senior") else "Unknown",
            "per_acre_demand": stats_row.get("peracre") if stats_row.get("peracre") else "Unknown",
            "ndvi": round(ndvi_value, 3) if ndvi_value else "Unknown",
            "air_quality": air_quality
        }

        air_quality_text = ""
        if air_quality:
            air_quality_text = f"""
Air Quality Assessment:
- PM2.5 Concentration: {air_quality.get('pm25_ugm3', 'Unknown')} μg/m³
- Health Risk Level: {air_quality.get('health_risk', 'Unknown')}
- Environmental Impact: {air_quality.get('environmental_damage', 'Unknown')}
- WHO Guideline Exceedance: {air_quality.get('who_guideline_exceedance', 'Unknown')}x
- Health Impact: {air_quality.get('health_impact', 'Unknown')}
- Recommendations: {air_quality.get('recommendations', 'Unknown')}"""

        prompt = f"""Generate a comprehensive description of this park based on the following data:

Park Name: {park_data['name']}
Address: {park_data['address']}
Owner/Manager: {park_data['owner']}
ZIP Code: {park_data['zipcode']}
Area: {park_data['area_acres']} acres
Population Served (10-min walk): {park_data['population_served']} people
Kids Served: {park_data['kids_served']}
Seniors Served: {park_data['seniors_served']}
Demand per Acre: {park_data['per_acre_demand']}
Vegetation Health (NDVI): {park_data['ndvi']}{air_quality_text}

Please provide:
1. A brief overview of the park
2. Key features and characteristics
3. Community impact and demographics served
4. Environmental health indicators (including air quality and pollution impact)
5. Health recommendations based on air quality data
6. Any interesting insights about when it might have been established or its significance

Write in a friendly, informative tone suitable for residents and visitors. Pay special attention to air quality concerns and environmental health."""

        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt
            )
            description = response.text
            logger.info(f"Generated park description for {park_id}")
        except Exception as e:
            logger.error(f"Error generating park description: {e}")
            description = f"""**{park_data['name']}**

This {park_data['area_acres']}-acre park is located at {park_data['address']} in ZIP code {park_data['zipcode']}.
It's managed by {park_data['owner']} and serves approximately {park_data['population_served']} people within a 10-minute walk.

The park provides recreational opportunities for {park_data['kids_served']} children and {park_data['seniors_served']} seniors in the surrounding community.
With a vegetation health index (NDVI) of {park_data['ndvi']}, it contributes to the local environmental quality and urban green space."""

        return {
            "parkId": park_id,
            "parkName": park_data['name'],
            "description": description,
            "details": park_data
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting park information for {park_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def get_park_air_quality(park_id: str):
    from utils import geometry_from_geojson, assess_air_quality_and_damage
    supabase = get_supabase()
    try:
        response = supabase.table('parks').select('park_name, geom').eq('park_id', park_id).execute()

        if not response.data:
            raise HTTPException(status_code=404, detail="Park not found")

        row = response.data[0]
        park_name = row.get("park_name") or "Unnamed Park"
        geometry = row.get("geom")

        if not geometry:
            raise HTTPException(status_code=400, detail="Park has no geometry")

        try:
            park_geom = geometry_from_geojson(geometry)
            current_air_quality = assess_air_quality_and_damage(park_geom)

            return {
                "parkId": park_id,
                "parkName": park_name,
                "currentAirQuality": current_air_quality,
                "message": f"Air quality assessment for {park_name}: PM2.5 level is {current_air_quality.get('pm25_ugm3', 'unknown')} μg/m³ ({current_air_quality.get('health_risk', 'unknown')} risk level)"
            }

        except ValueError as e:
            logger.error(f"Geometry error for park {park_id}: {e}")
            raise HTTPException(status_code=400, detail=f"Invalid park geometry: {str(e)}")
        except Exception as e:
            logger.error(f"Air quality computation error for park {park_id}: {e}")
            raise HTTPException(status_code=500, detail=f"Error computing air quality: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting park air quality for {park_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def analyze_park_removal_impact(park_id: str, land_use_type: str = "removed"):
    from utils import (geometry_from_geojson, compute_ndvi, compute_walkability,
                    compute_pm25, compute_population, simulate_replacement_with_buildings)

    supabase = get_supabase()
    try:
        response = supabase.table('parks_stats').select('park_name, geom').eq('park_id', park_id).execute()

        if not response.data:
            return None

        row = response.data[0]
        park_name = row.get("park_name")
        geometry = row.get("geom")

        stats = await get_park_statistics_by_id(park_id)
        if not stats:
            raise HTTPException(status_code=404, detail="Park statistics not found")

        if not geometry:
            raise HTTPException(status_code=400, detail="Park has no geometry")

        try:
            park_geom = geometry_from_geojson(geometry)
            buffer_geom = park_geom.buffer(800)
        except ValueError as e:
            logger.error(f"Geometry error for park {park_id}: {e}")
            raise HTTPException(status_code=400, detail=f"Invalid park geometry: {str(e)}")

        ndvi_before = compute_ndvi(buffer_geom)
        walkability_before = compute_walkability(buffer_geom)
        pm25_before = compute_pm25(buffer_geom)
        affected_population = compute_population(buffer_geom)

        if land_use_type == "removed":
            buffer_after = buffer_geom.difference(park_geom)
            ndvi_after = compute_ndvi(buffer_after)
            pm25_pollution_factor = 1.2
        elif land_use_type == "replaced_by_building":
            ndvi_after = simulate_replacement_with_buildings(buffer_geom, park_geom)
            pm25_pollution_factor = 1.35
        else:
            ndvi_after = ndvi_before
            pm25_pollution_factor = 1.1

        walkability_after = compute_walkability(buffer_geom.difference(park_geom))

        if pm25_before:
            pm25_after = pm25_before * pm25_pollution_factor
            pm25_increase = pm25_after - pm25_before
            pm25_increase_percent = ((pm25_pollution_factor - 1) * 100)
        else:
            pm25_after = None
            pm25_increase = None
            pm25_increase_percent = None

        return {
            "parkId": park_id,
            "parkName": park_name,
            "landUseType": land_use_type,
            "affectedPopulation10MinWalk": int(affected_population),
            "ndviBefore": round(ndvi_before, 4) if ndvi_before else None,
            "ndviAfter": round(ndvi_after, 4) if ndvi_after else None,
            "walkabilityBefore": walkability_before,
            "walkabilityAfter": walkability_after,
            "pm25Before": round(pm25_before, 2) if pm25_before else None,
            "pm25After": round(pm25_after, 2) if pm25_after else None,
            "pm25Increase": round(pm25_increase, 2) if pm25_increase else None,
            "pm25IncreasePercent": round(pm25_increase_percent, 1) if pm25_increase_percent else None,
            "demographics": {
                "total": stats.get("sum_totpop"),
                "kids": stats.get("sum_kidsvc"),
                "adults": stats.get("sum_youngp"),
                "seniors": stats.get("sum_senior"),
                "white": stats.get("sum_white_"),
                "black": stats.get("sum_black_"),
                "asian": stats.get("sum_asian_"),
                "hispanic": stats.get("sum_hisp_s"),
            },
            "income": {
                "low": stats.get("sum_hhilow"),
                "middle": stats.get("sum_hhimed"),
                "high": stats.get("sum_hhihig"),
            },
            "households": stats.get("sum_tothhs"),
            "perAcreDemand": stats.get("peracre"),
            "summary": {
                "people_affected": f"{stats.get('sum_totpop', 0):,} people lose park access within 10-minute walk",
                "ndvi_impact": f"Vegetation health drops from {round(ndvi_before, 3) if ndvi_before else 'unknown'} to {round(ndvi_after, 3) if ndvi_after else 'unknown'} ({'-' if ndvi_before and ndvi_after else '?'}{round((ndvi_before - ndvi_after) * 100, 1) if ndvi_before and ndvi_after else 'unknown'}% loss)",
                "pm25_impact": f"Air pollution increases by {round(pm25_increase_percent, 1) if pm25_increase_percent else 'unknown'}% (from {round(pm25_before, 2) if pm25_before else 'unknown'} to {round(pm25_after, 2) if pm25_after else 'unknown'} μg/m³)"
            },
            "message": f"Environmental Impact Summary:\n\n🏞️ VEGETATION HEALTH (NDVI)\n   • Before: {round(ndvi_before, 3) if ndvi_before else 'Unknown'}\n   • After: {round(ndvi_after, 3) if ndvi_after else 'Unknown'}\n   • Loss: {round((ndvi_before - ndvi_after) * 100, 1) if ndvi_before and ndvi_after else 'Unknown'}% vegetation decline\n\n👥 PEOPLE AFFECTED\n   • Total population losing access: {stats.get('sum_totpop', 0):,} people\n   • Demographics: {stats.get('sum_kidsvc', 0):,} kids, {stats.get('sum_youngp', 0):,} adults, {stats.get('sum_senior', 0):,} seniors\n\n🏭 AIR QUALITY (PM2.5)\n   • Before removal: {round(pm25_before, 2) if pm25_before else 'Unknown'} μg/m³\n   • After removal: {round(pm25_after, 2) if pm25_after else 'Unknown'} μg/m³\n   • Pollution increase: +{round(pm25_increase_percent, 1) if pm25_increase_percent else 'Unknown'}% ({'+' if pm25_increase else ''}{round(pm25_increase, 2) if pm25_increase else 'Unknown'} μg/m³)\n\nRemoving {park_name} would significantly impact {stats.get('sum_totpop', 0):,} residents through reduced air quality, loss of green space, and decreased environmental health.",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error analyzing park removal impact for {park_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def analyze_park_removal_pollution_impact(park_id: str, land_use_type: str = "removed"):
    from utils import geometry_from_geojson, compute_pm25, get_health_risk_category, get_environmental_damage_level

    supabase = get_supabase()
    try:
        response = supabase.table('parks').select('park_name, geom').eq('park_id', park_id).execute()

        if not response.data:
            return None

        row = response.data[0]
        park_name = row.get("park_name") or "Unnamed Park"
        geometry = row.get("geom")

        if not geometry:
            raise HTTPException(status_code=400, detail="Park has no geometry")

        try:
            park_geom = geometry_from_geojson(geometry)
            buffer_geom = park_geom.buffer(1000)

            current_pm25 = compute_pm25(buffer_geom)

            if land_use_type == "removed":
                pollution_increase_factor = 1.2
                impact_description = "complete removal"
            elif land_use_type == "replaced_by_building":
                pollution_increase_factor = 1.35
                impact_description = "replacement with buildings"
            else:
                pollution_increase_factor = 1.15
                impact_description = "modification"

            if current_pm25:
                estimated_pm25_after = current_pm25 * pollution_increase_factor
                pollution_increase = estimated_pm25_after - current_pm25
            else:
                estimated_pm25_after = None
                pollution_increase = None

            if estimated_pm25_after:
                after_assessment = {
                    "pm25_ugm3": round(estimated_pm25_after, 2),
                    "health_risk": get_health_risk_category(estimated_pm25_after),
                    "environmental_damage": get_environmental_damage_level(estimated_pm25_after)
                }
            else:
                after_assessment = None

            return {
                "parkId": park_id,
                "parkName": park_name,
                "landUseType": land_use_type,
                "currentPM25": round(current_pm25, 2) if current_pm25 else None,
                "estimatedPM25After": round(estimated_pm25_after, 2) if estimated_pm25_after else None,
                "pollutionIncrease": round(pollution_increase, 2) if pollution_increase else None,
                "pollutionIncreasePercent": round((pollution_increase_factor - 1) * 100, 1),
                "afterAssessment": after_assessment,
                "impactDescription": impact_description,
                "message": f"If {park_name} is {impact_description}, PM2.5 levels could increase by {round((pollution_increase_factor - 1) * 100, 1)}% (from {round(current_pm25, 2) if current_pm25 else 'unknown'} to {round(estimated_pm25_after, 2) if estimated_pm25_after else 'unknown'} μg/m³), worsening air quality for the surrounding area."
            }

        except Exception as e:
            logger.error(f"Error in pollution impact analysis: {e}")
            return None
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error analyzing park removal pollution impact for {park_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def get_users_by_zip_code(zip_code: str):
    """
    Get all users with email addresses in a specific zip code

    Args:
        zip_code: ZIP code to search for

    Returns:
        List of user emails in that zip code
    """
    supabase = get_supabase()
    try:
        response = supabase.table('hedera_users')\
            .select('email, name, zip_code')\
            .eq('zip_code', zip_code)\
            .not_.is_('email', 'null')\
            .execute()

        if not response.data:
            return []
        users = [
            {
                'email': user['email'],
                'name': user.get('name', 'Community Member')
            }
            for user in response.data
            if user.get('email')
        ]

        logger.info(f"Found {len(users)} users with emails in ZIP code {zip_code}")
        return users

    except Exception as e:
        logger.error(f"Error fetching users by ZIP code {zip_code}: {e}")
        return []
