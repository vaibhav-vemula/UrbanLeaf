'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, User, Mail, MapPin, Shield, Save, Navigation, Loader2, Wallet, DollarSign } from 'lucide-react';
import WalletStatus from '@/components/ui/WalletStatus';
import CustomCursor from '@/components/ui/CustomCursor';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import { useWallet } from '@/components/providers/WalletProvider';
import { getUserProfile, saveUserProfile } from '@/lib/supabase';

type Tab = 'profile' | 'wallet';

export default function ProfilePage() {
  const router = useRouter();
  const { address } = useWallet();
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [balances, setBalances] = useState({
    eth: 0,
  });
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    addressLine1: '',
    city: '',
    state: '',
    zipCode: '',
    latitude: undefined as number | undefined,
    longitude: undefined as number | undefined,
    isGovernmentEmployee: false,
    pin: '',
  });
  const [errors, setErrors] = useState({
    name: '',
    email: '',
    addressLine1: '',
    city: '',
    state: '',
    zipCode: '',
    pin: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    loadProfile();
    if (activeTab === 'wallet' && address) {
      fetchBalances();
    }
  }, [address, activeTab]);

  async function fetchBalances() {
    if (!address) return;

    try {
      setIsLoadingBalances(true);
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/user-balances?address=${address}`);

      if (!response.ok) throw new Error('Failed to fetch balances');

      const data = await response.json();
      if (data.success) {
        setBalances({ eth: data.balances.eth || 0 });
      }
    } catch (error) {
      console.error('Error fetching balances:', error);
    } finally {
      setIsLoadingBalances(false);
    }
  }

  async function loadProfile() {
    if (!address) {
      router.push('/');
      return;
    }

    try {
      const result = await getUserProfile(address);
      if (result.success && result.data) {
        setFormData({
          name: result.data.name || '',
          email: result.data.email || '',
          addressLine1: result.data.address_line1 || '',
          city: result.data.city || '',
          state: result.data.state || '',
          zipCode: result.data.zip_code || '',
          latitude: result.data.latitude || undefined,
          longitude: result.data.longitude || undefined,
          isGovernmentEmployee: result.data.is_government_employee || false,
          pin: result.data.pin || '',
        });
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setIsLoading(false);
    }
  }

  function handleInputChange(field: string, value: string | boolean) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (typeof value === 'string') {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
    setSaveMessage('');
  }

  function validateForm() {
    const newErrors = {
      name: '',
      email: '',
      addressLine1: '',
      city: '',
      state: '',
      zipCode: '',
      pin: '',
    };

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (!formData.addressLine1.trim()) {
      newErrors.addressLine1 = 'Street address is required';
    }

    if (!formData.city.trim()) {
      newErrors.city = 'City is required';
    }

    if (!formData.state.trim()) {
      newErrors.state = 'State is required';
    }

    if (!formData.zipCode.trim()) {
      newErrors.zipCode = 'ZIP code is required';
    } else if (!/^\d{5}(-\d{4})?$/.test(formData.zipCode)) {
      newErrors.zipCode = 'Please enter a valid ZIP code';
    }

    if (formData.isGovernmentEmployee) {
      if (!formData.pin.trim()) {
        newErrors.pin = 'PIN is required for government employees';
      } else if (formData.pin !== '000000') {
        newErrors.pin = 'Invalid PIN';
      }
    }

    setErrors(newErrors);
    return !Object.values(newErrors).some(error => error);
  }

  function handleGetLocation() {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser');
      return;
    }

    setIsGettingLocation(true);
    setLocationError('');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        setFormData((prev) => ({
          ...prev,
          latitude: lat,
          longitude: lng,
        }));

        setIsGettingLocation(false);
        console.log(`📍 Location obtained: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      },
      (error) => {
        setIsGettingLocation(false);
        let errorMessage = 'Unable to get location';

        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location access denied. Please enable location permissions.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information unavailable.';
            break;
          case error.TIMEOUT:
            errorMessage = 'Location request timed out.';
            break;
        }

        setLocationError(errorMessage);
        console.error('Geolocation error:', error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }

  async function handleSave() {
    if (!validateForm()) {
      return;
    }

    // Validate location is required
    if (!formData.latitude || !formData.longitude) {
      setLocationError('Location is required. Please click "Get My Location" button to capture your GPS coordinates.');
      return;
    }

    try {
      setIsSaving(true);
      setSaveMessage('');
      setLocationError('');

      // Only set is_government_employee to true if PIN is exactly "000000"
      const isValidGovEmployee = formData.isGovernmentEmployee && formData.pin === '000000';

      // If user checked government employee but PIN is wrong, show error
      if (formData.isGovernmentEmployee && formData.pin !== '000000') {
        setSaveMessage('Invalid PIN code. Only authorized personnel with the correct PIN can be marked as government employees.');
        setIsSaving(false);
        return;
      }

      const result = await saveUserProfile({
        wallet_address: address!,
        name: formData.name,
        email: formData.email,
        address_line1: formData.addressLine1,
        city: formData.city,
        state: formData.state,
        zip_code: formData.zipCode,
        latitude: formData.latitude,
        longitude: formData.longitude,
        is_government_employee: isValidGovEmployee,
        pin: isValidGovEmployee ? formData.pin : null,
      });

      if (result.success) {
        setSaveMessage('Profile saved successfully!');
        setTimeout(() => setSaveMessage(''), 3000);
      } else {
        setSaveMessage('Error saving profile. Please try again.');
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      setSaveMessage('Error saving profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <CustomCursor />
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950">
        <WalletStatus />

        {/* Back Button */}
        <button
          onClick={() => router.push('/options')}
          className="absolute top-6 left-6 z-20 group flex items-center gap-2 px-5 py-2.5 bg-slate-800/90 backdrop-blur-md text-gray-300 hover:text-white rounded-full border-2 border-emerald-500/30 hover:border-emerald-400 shadow-lg hover:shadow-emerald-500/25 transition-all duration-300 hover:bg-gradient-to-r hover:from-emerald-500 hover:to-teal-600"
        >
          <ArrowLeft
            size={18}
            className="group-hover:-translate-x-1 transition-transform duration-300"
            strokeWidth={2.5}
          />
          <span className="font-semibold text-sm">Back to Options</span>
        </button>

        <div className="container mx-auto px-6 pt-24 pb-6">
          {/* Profile Card */}
          <div className="max-w-3xl mx-auto">
            <div className="bg-slate-900/50 backdrop-blur-xl border border-emerald-500/20 rounded-2xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border-b border-emerald-500/20 px-8 py-6">
                <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/20 rounded-lg">
                    {activeTab === 'profile' ? (
                      <User className="text-emerald-400" size={28} />
                    ) : (
                      <Wallet className="text-emerald-400" size={28} />
                    )}
                  </div>
                  {activeTab === 'profile' ? 'Profile Settings' : 'My Wallet'}
                </h1>
                <p className="text-gray-400 text-sm">
                  {activeTab === 'profile'
                    ? 'Manage your personal information and account preferences'
                    : 'View your token balances and wallet information'
                  }
                </p>
              </div>

              {/* Tabs */}
              <div className="border-b border-emerald-500/20 px-8">
                <div className="flex gap-2 justify-center">
                  <button
                    onClick={() => setActiveTab('profile')}
                    className={`px-6 py-3 text-sm font-semibold transition-all border-b-2 ${
                      activeTab === 'profile'
                        ? 'text-emerald-400 border-emerald-400'
                        : 'text-gray-400 border-transparent hover:text-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <User size={16} />
                      Profile
                    </div>
                  </button>
                  <button
                    onClick={() => setActiveTab('wallet')}
                    className={`px-6 py-3 text-sm font-semibold transition-all border-b-2 ${
                      activeTab === 'wallet'
                        ? 'text-emerald-400 border-emerald-400'
                        : 'text-gray-400 border-transparent hover:text-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Wallet size={16} />
                      Wallet
                    </div>
                  </button>
                </div>
              </div>

              <div className="px-8 py-6 space-y-6">
                {activeTab === 'profile' ? (
                  <>
                {/* Wallet Address Section */}
                <div>
                  <h2 className="text-sm font-semibold text-emerald-400 mb-3 uppercase tracking-wide">
                    Identity
                  </h2>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-2">
                      Wallet Address
                    </label>
                    <div className="px-4 py-3 bg-slate-800/70 border border-emerald-500/30 rounded-lg text-gray-300 font-mono text-sm break-all">
                      {address}
                    </div>
                  </div>
                </div>

                {/* Personal Information Section */}
                <div className="border-t border-emerald-500/20 pt-6">
                  <h2 className="text-sm font-semibold text-emerald-400 mb-4 uppercase tracking-wide">
                    Personal Information
                  </h2>
                  <div className="space-y-4">
                    {/* Name */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Full Name
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        placeholder="Enter your full name"
                        className={`w-full px-4 py-3 bg-slate-800/50 border ${
                          errors.name ? 'border-red-500/50' : 'border-slate-700'
                        } rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all`}
                      />
                      {errors.name && (
                        <p className="mt-1 text-sm text-red-400">{errors.name}</p>
                      )}
                    </div>

                    {/* Email */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        placeholder="your.email@example.com"
                        className={`w-full px-4 py-3 bg-slate-800/50 border ${
                          errors.email ? 'border-red-500/50' : 'border-slate-700'
                        } rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all`}
                      />
                      {errors.email && (
                        <p className="mt-1 text-sm text-red-400">{errors.email}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Address Section */}
                <div className="border-t border-emerald-500/20 pt-6">
                  <h2 className="text-sm font-semibold text-emerald-400 mb-4 uppercase tracking-wide flex items-center gap-2">
                    <MapPin size={16} />
                    Address & Location
                  </h2>
                  <div className="space-y-4">
                    {/* Address Line 1 */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Street Address
                      </label>
                      <input
                        type="text"
                        value={formData.addressLine1}
                        onChange={(e) => handleInputChange('addressLine1', e.target.value)}
                        placeholder="123 Main Street, Apt 4B"
                        className={`w-full px-4 py-3 bg-slate-800/50 border ${
                          errors.addressLine1 ? 'border-red-500/50' : 'border-slate-700'
                        } rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all`}
                      />
                      {errors.addressLine1 && (
                        <p className="mt-1 text-sm text-red-400">{errors.addressLine1}</p>
                      )}
                    </div>

                    {/* City and State */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          City
                        </label>
                        <input
                          type="text"
                          value={formData.city}
                          onChange={(e) => handleInputChange('city', e.target.value)}
                          placeholder="City"
                          className={`w-full px-4 py-3 bg-slate-800/50 border ${
                            errors.city ? 'border-red-500/50' : 'border-slate-700'
                          } rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all`}
                        />
                        {errors.city && (
                          <p className="mt-1 text-sm text-red-400">{errors.city}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          State
                        </label>
                        <input
                          type="text"
                          value={formData.state}
                          onChange={(e) => handleInputChange('state', e.target.value)}
                          placeholder="State"
                          className={`w-full px-4 py-3 bg-slate-800/50 border ${
                            errors.state ? 'border-red-500/50' : 'border-slate-700'
                          } rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all`}
                        />
                        {errors.state && (
                          <p className="mt-1 text-sm text-red-400">{errors.state}</p>
                        )}
                      </div>
                    </div>

                    {/* ZIP Code */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        ZIP Code
                      </label>
                      <input
                        type="text"
                        value={formData.zipCode}
                        onChange={(e) => handleInputChange('zipCode', e.target.value)}
                        placeholder="12345"
                        maxLength={10}
                        className={`w-full px-4 py-3 bg-slate-800/50 border ${
                          errors.zipCode ? 'border-red-500/50' : 'border-slate-700'
                        } rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all`}
                      />
                      {errors.zipCode && (
                        <p className="mt-1 text-sm text-red-400">{errors.zipCode}</p>
                      )}
                    </div>

                    {/* Get Location Button */}
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        GPS Location <span className="text-red-400">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={handleGetLocation}
                        disabled={isGettingLocation}
                        className={`w-full flex items-center justify-center gap-2 px-4 py-3 ${
                          formData.latitude && formData.longitude
                            ? 'bg-emerald-600/20 hover:bg-emerald-600/30 border-emerald-500/50 text-emerald-300'
                            : 'bg-blue-600/20 hover:bg-blue-600/30 border-blue-500/50 text-blue-300'
                        } border rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {isGettingLocation ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>Getting Location...</span>
                          </>
                        ) : (
                          <>
                            <Navigation className="w-5 h-5" />
                            <span>
                              {formData.latitude && formData.longitude
                                ? 'Update My Location'
                                : 'Get My Location (Required)'}
                            </span>
                          </>
                        )}
                      </button>

                      {formData.latitude && formData.longitude && (
                        <div className="mt-2 p-3 bg-emerald-900/20 border border-emerald-500/30 rounded-lg">
                          <p className="text-xs text-emerald-400 flex items-center gap-2">
                            <MapPin className="w-4 h-4" />
                            Location: {formData.latitude.toFixed(6)}, {formData.longitude.toFixed(6)}
                          </p>
                        </div>
                      )}

                      {locationError && (
                        <div className="mt-2 p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
                          <p className="text-xs text-red-400">{locationError}</p>
                        </div>
                      )}

                      <p className="text-xs text-gray-400 mt-2">
                        <span className="text-red-400 font-semibold">Required:</span> Your GPS location is needed for personalized park recommendations, nearby park discovery, and location-based features.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Government Employee Section */}
                <div className="border-t border-emerald-500/20 pt-6">
                  <h2 className="text-sm font-semibold text-emerald-400 mb-4 uppercase tracking-wide flex items-center gap-2">
                    <Shield size={16} />
                    Special Access
                  </h2>

                  <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-5">
                    <label className="flex items-start gap-4 cursor-pointer group">
                      <div className="relative flex-shrink-0 mt-1">
                        <input
                          type="checkbox"
                          checked={formData.isGovernmentEmployee}
                          onChange={(e) =>
                            handleInputChange('isGovernmentEmployee', e.target.checked)
                          }
                          className="sr-only peer"
                        />
                        <div className="w-6 h-6 bg-slate-700 border-2 border-slate-600 rounded-md peer-checked:bg-emerald-500 peer-checked:border-emerald-400 transition-all flex items-center justify-center group-hover:border-emerald-500/50">
                          {formData.isGovernmentEmployee && (
                            <svg
                              className="w-4 h-4 text-white"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={3}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="text-white font-medium mb-1">
                          I am a Government Employee
                        </div>
                        <p className="text-sm text-gray-400">
                          Government employees have additional privileges including proposal creation and administrative access
                        </p>
                      </div>
                    </label>

                    {/* PIN Input */}
                    {formData.isGovernmentEmployee && (
                      <div className="mt-5 pt-5 border-t border-emerald-500/20">
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Verification PIN
                        </label>
                        <input
                          type="password"
                          value={formData.pin}
                          onChange={(e) => handleInputChange('pin', e.target.value)}
                          placeholder="Enter 6-digit PIN"
                          maxLength={6}
                          className={`w-full px-4 py-3 bg-slate-800/50 border ${
                            errors.pin ? 'border-red-500/50' : 'border-emerald-500/50'
                          } rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20 transition-all font-mono tracking-widest text-center text-lg`}
                        />
                        {errors.pin && (
                          <p className="mt-1 text-sm text-red-400">{errors.pin}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-2 flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Enter the 6-digit PIN sent to your registered email by the UrbanLeaf AI team
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Save Button */}
                <div className="border-t border-emerald-500/20 pt-6">
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <Save size={20} />
                    <span className="text-base">
                      {isSaving ? 'Saving Changes...' : 'Save Profile'}
                    </span>
                  </button>

                  {saveMessage && (
                    <div
                      className={`mt-4 p-4 rounded-lg text-center font-medium ${
                        saveMessage.includes('Error')
                          ? 'bg-red-900/20 border border-red-500/50 text-red-300'
                          : 'bg-emerald-900/20 border border-emerald-500/50 text-emerald-300'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-2">
                        {saveMessage.includes('Error') ? (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                        <span>{saveMessage}</span>
                      </div>
                    </div>
                  )}
                </div>
                </>
                ) : (
                  /* Wallet Tab */
                  <>
                    {/* Wallet Address */}
                    <div>
                      <h2 className="text-sm font-semibold text-emerald-400 mb-3 uppercase tracking-wide">
                        Wallet Address
                      </h2>
                      <div className="px-4 py-3 bg-slate-800/70 border border-emerald-500/30 rounded-lg text-gray-300 font-mono text-sm break-all">
                        {address}
                      </div>
                    </div>

                    {/* Token Balances */}
                    <div className="border-t border-emerald-500/20 pt-6">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-semibold text-emerald-400 uppercase tracking-wide">
                          Token Balances
                        </h2>
                        <button
                          onClick={fetchBalances}
                          disabled={isLoadingBalances}
                          className="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/50 text-emerald-300 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                        >
                          {isLoadingBalances ? (
                            <div className="flex items-center gap-2">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Refreshing...
                            </div>
                          ) : (
                            'Refresh Balances'
                          )}
                        </button>
                      </div>

                      {isLoadingBalances && balances.eth === 0 ? (
                        <div className="flex items-center justify-center py-12">
                          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-4">
                          {/* ETH Balance */}
                          <div className="bg-gradient-to-br from-blue-900/20 to-blue-800/10 border border-blue-500/30 rounded-xl p-6">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-gray-400 text-sm font-medium">ETH</span>
                              <div className="p-2 bg-blue-500/20 rounded-lg">
                                <DollarSign className="text-blue-400" size={20} />
                              </div>
                            </div>
                            <div className="text-3xl font-bold text-white mb-1">
                              {balances.eth.toFixed(6)}
                            </div>
                            <div className="text-xs text-gray-500">Arbitrum Sepolia</div>
                          </div>
                        </div>
                      )}

                      {/* Info Message */}
                      <div className="mt-6 p-4 bg-blue-900/10 border border-blue-500/20 rounded-lg">
                        <p className="text-sm text-blue-300 flex items-start gap-2">
                          <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>
                            Network: <strong>Arbitrum Sepolia</strong> — Get testnet ETH from the Alchemy faucet.
                          </span>
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
