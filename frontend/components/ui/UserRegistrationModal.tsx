'use client';

import { useState } from 'react';
import { X, User, Mail, MapPin, Loader2, Shield, Navigation } from 'lucide-react';

interface UserRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    email: string;
    addressLine1: string;
    city: string;
    state: string;
    zipCode: string;
    latitude?: number;
    longitude?: number;
    isGovEmployee: boolean;
    pin?: string;
  }) => Promise<void>;
  walletAddress: string;
}

export default function UserRegistrationModal({
  isOpen,
  onClose,
  onSubmit,
  walletAddress,
}: UserRegistrationModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    addressLine1: '',
    city: '',
    state: '',
    zipCode: '',
    latitude: undefined as number | undefined,
    longitude: undefined as number | undefined,
    isGovEmployee: false,
    pin: '',
  });
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [errors, setErrors] = useState({
    name: '',
    email: '',
    addressLine1: '',
    city: '',
    state: '',
    zipCode: '',
    pin: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registrationError, setRegistrationError] = useState('');

  const validateForm = () => {
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

    if (formData.isGovEmployee) {
      if (!formData.pin.trim()) {
        newErrors.pin = 'PIN is required for government employees';
      } else if (formData.pin !== '000000') {
        newErrors.pin = 'Invalid PIN';
      }
    }

    setErrors(newErrors);
    return !Object.values(newErrors).some(error => error);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegistrationError('');

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        name: formData.name,
        email: formData.email,
        addressLine1: formData.addressLine1,
        city: formData.city,
        state: formData.state,
        zipCode: formData.zipCode,
        latitude: formData.latitude,
        longitude: formData.longitude,
        isGovEmployee: formData.isGovEmployee,
        pin: formData.isGovEmployee ? formData.pin : undefined,
      });
      // Reset form on success
      setFormData({
        name: '',
        email: '',
        addressLine1: '',
        city: '',
        state: '',
        zipCode: '',
        latitude: undefined,
        longitude: undefined,
        isGovEmployee: false,
        pin: '',
      });
      setRegistrationError('');
      setLocationError('');
    } catch (error) {
      console.error('Registration failed:', error);
      setRegistrationError('Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: keyof typeof formData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (typeof value === 'string') {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
    // Clear registration error
    setRegistrationError('');
  };

  const handleGetLocation = () => {
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
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn overflow-y-auto">
      <div className="relative w-full max-w-2xl my-8 bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl border border-emerald-500/30 shadow-2xl shadow-emerald-500/20 animate-slideUp">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white hover:bg-slate-700/50 rounded-full transition-colors z-10"
          disabled={isSubmitting}
        >
          <X size={20} />
        </button>

        {/* Header */}
        <div className="p-8 pb-6 border-b border-emerald-500/20">
          <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center mb-4 mx-auto">
            <User className="text-white" size={32} strokeWidth={2.5} />
          </div>
          <h2 className="text-3xl font-bold text-white text-center mb-2">
            Complete Your Profile
          </h2>
          <p className="text-gray-400 text-center text-sm">
            Wallet: <span className="text-emerald-400 font-mono">{walletAddress.slice(0, 8)}...{walletAddress.slice(-6)}</span>
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {/* Personal Information Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wide">
              Personal Information
            </h3>

            {/* Name field */}
            <div>
              <label htmlFor="name" className="block text-sm font-semibold text-gray-300 mb-2">
                Full Name
              </label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-400">
                  <User size={20} />
                </div>
                <input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="Enter your full name"
                  className={`w-full pl-12 pr-4 py-3 bg-slate-800/50 border ${
                    errors.name ? 'border-red-500/50' : 'border-slate-700'
                  } rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all`}
                  disabled={isSubmitting}
                />
              </div>
              {errors.name && (
                <p className="mt-1 text-sm text-red-400">{errors.name}</p>
              )}
            </div>

            {/* Email field */}
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-gray-300 mb-2">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-400">
                  <Mail size={20} />
                </div>
                <input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="your.email@example.com"
                  className={`w-full pl-12 pr-4 py-3 bg-slate-800/50 border ${
                    errors.email ? 'border-red-500/50' : 'border-slate-700'
                  } rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all`}
                  disabled={isSubmitting}
                />
              </div>
              {errors.email && (
                <p className="mt-1 text-sm text-red-400">{errors.email}</p>
              )}
            </div>
          </div>

          {/* Address Section */}
          <div className="space-y-4 pt-4 border-t border-emerald-500/20">
            <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wide flex items-center gap-2">
              <MapPin size={16} />
              Address
            </h3>

            {/* Address Line 1 */}
            <div>
              <label htmlFor="addressLine1" className="block text-sm font-semibold text-gray-300 mb-2">
                Street Address
              </label>
              <input
                id="addressLine1"
                type="text"
                value={formData.addressLine1}
                onChange={(e) => handleChange('addressLine1', e.target.value)}
                placeholder="123 Main Street, Apt 4B"
                className={`w-full px-4 py-3 bg-slate-800/50 border ${
                  errors.addressLine1 ? 'border-red-500/50' : 'border-slate-700'
                } rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all`}
                disabled={isSubmitting}
              />
              {errors.addressLine1 && (
                <p className="mt-1 text-sm text-red-400">{errors.addressLine1}</p>
              )}
            </div>

            {/* City and State */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="city" className="block text-sm font-semibold text-gray-300 mb-2">
                  City
                </label>
                <input
                  id="city"
                  type="text"
                  value={formData.city}
                  onChange={(e) => handleChange('city', e.target.value)}
                  placeholder="City"
                  className={`w-full px-4 py-3 bg-slate-800/50 border ${
                    errors.city ? 'border-red-500/50' : 'border-slate-700'
                  } rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all`}
                  disabled={isSubmitting}
                />
                {errors.city && (
                  <p className="mt-1 text-sm text-red-400">{errors.city}</p>
                )}
              </div>

              <div>
                <label htmlFor="state" className="block text-sm font-semibold text-gray-300 mb-2">
                  State
                </label>
                <input
                  id="state"
                  type="text"
                  value={formData.state}
                  onChange={(e) => handleChange('state', e.target.value)}
                  placeholder="State"
                  className={`w-full px-4 py-3 bg-slate-800/50 border ${
                    errors.state ? 'border-red-500/50' : 'border-slate-700'
                  } rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all`}
                  disabled={isSubmitting}
                />
                {errors.state && (
                  <p className="mt-1 text-sm text-red-400">{errors.state}</p>
                )}
              </div>
            </div>

            {/* ZIP Code */}
            <div>
              <label htmlFor="zipCode" className="block text-sm font-semibold text-gray-300 mb-2">
                ZIP Code
              </label>
              <input
                id="zipCode"
                type="text"
                value={formData.zipCode}
                onChange={(e) => handleChange('zipCode', e.target.value)}
                placeholder="12345"
                maxLength={10}
                className={`w-full px-4 py-3 bg-slate-800/50 border ${
                  errors.zipCode ? 'border-red-500/50' : 'border-slate-700'
                } rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all`}
                disabled={isSubmitting}
              />
              {errors.zipCode && (
                <p className="mt-1 text-sm text-red-400">{errors.zipCode}</p>
              )}
            </div>

            {/* Get Location Button */}
            <div className="mt-4">
              <button
                type="button"
                onClick={handleGetLocation}
                disabled={isSubmitting || isGettingLocation}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/50 text-blue-300 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGettingLocation ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Getting Location...</span>
                  </>
                ) : (
                  <>
                    <Navigation className="w-5 h-5" />
                    <span>Get My Location</span>
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
                Optional: Click to use your device's GPS location for personalized park recommendations
              </p>
            </div>
          </div>

          {/* Government Employee Section */}
          <div className="pt-4 border-t border-emerald-500/20">
            <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wide flex items-center gap-2 mb-4">
              <Shield size={16} />
              Special Access
            </h3>

            <div className="bg-slate-800/30 border border-slate-700 rounded-xl p-5">
              <label className="flex items-start gap-4 cursor-pointer group">
                <div className="relative flex-shrink-0 mt-1">
                  <input
                    type="checkbox"
                    checked={formData.isGovEmployee}
                    onChange={(e) => handleChange('isGovEmployee', e.target.checked)}
                    className="sr-only peer"
                    disabled={isSubmitting}
                  />
                  <div className="w-6 h-6 bg-slate-700 border-2 border-slate-600 rounded-md peer-checked:bg-emerald-500 peer-checked:border-emerald-400 transition-all flex items-center justify-center group-hover:border-emerald-500/50">
                    {formData.isGovEmployee && (
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

              {/* PIN Input - Only show if government employee is checked */}
              {formData.isGovEmployee && (
                <div className="mt-5 pt-5 border-t border-emerald-500/20">
                  <label htmlFor="pin" className="block text-sm font-medium text-gray-300 mb-2">
                    Verification PIN <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="pin"
                    type="password"
                    value={formData.pin}
                    onChange={(e) => handleChange('pin', e.target.value)}
                    placeholder="Enter 6-digit PIN"
                    maxLength={6}
                    className={`w-full px-4 py-3 bg-slate-800/50 border ${
                      errors.pin ? 'border-red-500/50' : 'border-emerald-500/50'
                    } rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-400 transition-all font-mono tracking-widest text-center text-lg`}
                    disabled={isSubmitting}
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

          {/* Registration Error Message */}
          {registrationError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
              <p className="text-sm text-red-400">{registrationError}</p>
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all duration-300 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Creating Account...
              </>
            ) : (
              <>
                Create Account
              </>
            )}
          </button>
        </form>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }

        .animate-slideUp {
          animation: slideUp 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
