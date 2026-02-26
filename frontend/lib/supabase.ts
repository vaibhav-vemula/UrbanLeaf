import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env.local file.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// Database types
export interface HederaUser {
  wallet_address: string;
  name: string | null;
  email: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  latitude: number | null;  // Decimal latitude (e.g., 38.88101234) - Required for profile completion
  longitude: number | null;  // Decimal longitude (e.g., -77.09876543) - Required for profile completion
  is_government_employee: boolean;
  pin: string | null;
  created_at: string;
  updated_at: string;
}

// User profile operations
export async function getUserProfile(walletAddress: string) {
  try {
    const { data, error } = await supabase
      .from('hedera_users')
      .select('*')
      .eq('wallet_address', walletAddress)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return { success: true, data };
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return { success: false, error };
  }
}

export async function saveUserProfile(profileData: Partial<HederaUser>) {
  try {
    const { wallet_address } = profileData;

    if (!wallet_address) {
      throw new Error('Wallet address is required');
    }

    // Check if user exists
    const { data: existingUser } = await supabase
      .from('hedera_users')
      .select('wallet_address')
      .eq('wallet_address', wallet_address)
      .single();

    if (existingUser) {
      // Update existing user
      const { data, error } = await supabase
        .from('hedera_users')
        .update({
          ...profileData,
          updated_at: new Date().toISOString(),
        })
        .eq('wallet_address', wallet_address)
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } else {
      // Insert new user
      const { data, error } = await supabase
        .from('hedera_users')
        .insert({
          ...profileData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    }
  } catch (error) {
    console.error('Error saving user profile:', error);
    return { success: false, error };
  }
}

export async function getAllUserEmails() {
  try {
    const { data, error } = await supabase
      .from('hedera_users')
      .select('email')
      .not('email', 'is', null);

    if (error) throw error;

    const emails = data.map(user => user.email).filter(Boolean);
    return { success: true, emails };
  } catch (error) {
    console.error('Error fetching user emails:', error);
    return { success: false, error };
  }
}

// Create initial account entry when wallet connects (only wallet_address)
export async function createInitialAccount(walletAddress: string) {
  try {
    // Check if account already exists
    const { data: existingUser } = await supabase
      .from('hedera_users')
      .select('wallet_address')
      .eq('wallet_address', walletAddress)
      .single();

    if (existingUser) {
      // Account already exists, no need to create
      return { success: true, exists: true, data: existingUser };
    }

    // Create minimal account with just wallet address
    const { data, error } = await supabase
      .from('hedera_users')
      .insert({
        wallet_address: walletAddress,
        name: null,
        email: null,
        address_line1: null,
        city: null,
        state: null,
        zip_code: null,
        latitude: null,
        longitude: null,
        is_government_employee: false,
        pin: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    console.log('✅ Created initial account for wallet:', walletAddress);
    return { success: true, exists: false, data };
  } catch (error) {
    console.error('Error creating initial account:', error);
    return { success: false, error };
  }
}
