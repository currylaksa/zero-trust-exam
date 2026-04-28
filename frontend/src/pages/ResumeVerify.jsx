import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../api/axios';

const ResumeVerify = () => {
  const [otp, setOtp] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const inputRef = useRef(null);

  useEffect(() => {
    const resumeToken = localStorage.getItem('exam_resume_token');
    const sessionId = localStorage.getItem('exam_resume_session_id');

    if (!resumeToken || !sessionId) {
      navigate('/dashboard');
    } else {
      inputRef.current?.focus();
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) {
      setError('Please enter a 6-digit code');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const resumeToken = localStorage.getItem('exam_resume_token');

      const response = await axiosInstance.post('/sessions/verify-resume', {
        resumeToken,
        otp
      });

      if (response.data.verified) {
        localStorage.removeItem('exam_resume_token');
        localStorage.removeItem('exam_resume_session_id');
        navigate(`/exam/${response.data.sessionId}`);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid verification code');
      setOtp('');
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Verify Your Identity to Resume
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600 max-w">
          For security purposes, you must verify your identity before resuming your exam. Enter the 6-digit code from your authenticator app.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="mb-6 bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-yellow-700 font-medium">Security Verification Required</p>
              </div>
            </div>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="otp" className="block text-sm font-medium text-gray-700 text-center mb-4">
                Authentication Code
              </label>
              <div className="mt-1">
                <input
                  id="otp"
                  name="otp"
                  type="text"
                  maxLength={6}
                  ref={inputRef}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                  className="appearance-none block w-full px-3 py-4 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-[#7A1F2E] focus:border-[#7A1F2E] sm:text-2xl text-center font-mono tracking-[0.5em]"
                  placeholder="000000"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-red-50 p-4 border border-red-200">
                <div className="text-sm text-red-700 text-center font-medium">{error}</div>
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#7A1F2E] hover:bg-[#601826] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#7A1F2E] disabled:bg-[#7A1F2E]/60 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Verifying...' : 'Verify & Resume'}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <p className="text-xs text-center text-gray-500">
              If you did not request this, contact your lecturer immediately.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResumeVerify;