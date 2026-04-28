import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import axiosInstance from '../api/axios';

const MFAVerify = () => {
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    // On mount: check if exam_temp_token exists
    const tempToken = localStorage.getItem('exam_temp_token');
    if (!tempToken) {
      navigate('/login', { replace: true });
    } else {
      // Auto-focus the OTP input
      inputRef.current?.focus();
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (otp.length !== 6 || !/^\d+$/.test(otp)) {
      setError('Please enter a valid 6-digit numeric code.');
      return;
    }

    setLoading(true);
    try {
      const tempToken = localStorage.getItem('exam_temp_token');
      const response = await axiosInstance.post('/auth/verify-mfa', {
        tempToken,
        otp
      });

      // On success: Remove temp token, login, and navigate
      localStorage.removeItem('exam_temp_token');
      // login expected to take token and user object based on instructions
      login(response.data.token, response.data.user);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'MFA verification failed. Please try again.');
      setOtp('');
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (e) => {
    // Only allow numeric input
    const value = e.target.value;
    if (value === '' || /^\d+$/.test(value)) {
      setOtp(value);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-md border border-gray-100">
        <div>
          <h2 className="mt-2 text-center text-3xl font-extrabold text-gray-900">
            Two-Factor Authentication
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Enter the 6-digit code from your authenticator app
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="otp" className="sr-only">
              6-Digit Code
            </label>
            <input
              id="otp"
              name="otp"
              type="text"
              autoComplete="one-time-code"
              required
              maxLength={6}
              value={otp}
              onChange={handleOtpChange}
              ref={inputRef}
              className="appearance-none rounded-md relative block w-full px-3 py-4 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-[#7A1F2E] focus:border-[#7A1F2E] focus:z-10 text-center text-3xl tracking-widest font-mono"
              placeholder="000000"
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={loading || otp.length !== 6}
              className={`group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white ${loading || otp.length !== 6 ? 'bg-[#7A1F2E]/60 cursor-not-allowed' : 'bg-[#7A1F2E] hover:bg-[#601826]'} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#7A1F2E] transition-colors duration-200`}
            >
              {loading ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Verifying...
                </span>
              ) : 'Verify'}
            </button>
          </div>
        </form>

        <div className="text-center mt-4">
          <Link to="/login" className="font-medium text-sm text-[#7A1F2E] hover:text-[#601826]">
            &larr; Back to login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default MFAVerify;
