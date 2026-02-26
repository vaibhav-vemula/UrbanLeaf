"""Supabase client for user authentication and authorization"""
import os
import logging
from supabase import create_client, Client

logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    logger.warning("Supabase credentials not configured. Authorization checks will be disabled.")
    supabase: Client = None
else:
    try:
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("Supabase client initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {e}")
        supabase = None


async def check_user_authorization(wallet_address: str) -> dict:
    if not supabase:
        return {
            "authorized": False,
            "user": None,
            "error": "Authorization service not available"
        }

    if not wallet_address:
        return {
            "authorized": False,
            "user": None,
            "error": "Wallet address required"
        }

    try:
        response = supabase.table('hedera_users') \
            .select('wallet_address, name, email, is_government_employee') \
            .eq('wallet_address', wallet_address) \
            .single() \
            .execute()

        if response.data:
            user = response.data
            is_authorized = user.get('is_government_employee', False) is True

            logger.info(f"Authorization check for {wallet_address}: {is_authorized}")

            return {
                "authorized": is_authorized,
                "user": user,
                "error": None
            }
        else:
            logger.warning(f"User not found: {wallet_address}")
            return {
                "authorized": False,
                "user": None,
                "error": "User profile not found. Please complete your profile first."
            }

    except Exception as e:
        logger.error(f"Error checking authorization for {wallet_address}: {e}")
        return {
            "authorized": False,
            "user": None,
            "error": f"Authorization check failed: {str(e)}"
        }


async def get_user_profile(wallet_address: str) -> dict:
    if not supabase or not wallet_address:
        return None

    try:
        response = supabase.table('hedera_users') \
            .select('*') \
            .eq('wallet_address', wallet_address) \
            .single() \
            .execute()

        return response.data if response.data else None

    except Exception as e:
        logger.error(f"Error fetching user profile for {wallet_address}: {e}")
        return None
