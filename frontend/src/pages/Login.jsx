import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import API from '../api/axios';

/**
 * Login Page
 * Handles user authentication with JWT and MFA checks
 */
const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await API.post('/auth/login', {
        email,
        password
      });

      if (response.data.requiresMfaSetup) {
        // First-time login: must enroll in MFA before getting a real session
        localStorage.setItem('exam_setup_token', response.data.setupToken);
        navigate('/setup-mfa');
      } else if (response.data.mfaRequired) {
        // Existing user: must pass MFA OTP before getting a real session
        localStorage.setItem('exam_temp_token', response.data.tempToken);
        navigate('/verify-mfa');
      } else if (response.data.token) {
        // Defensive fallback — should not occur after MFA enforcement
        login(response.data.token, response.data.user);
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden
      bg-gradient-to-br from-orange-400 via-orange-500 to-orange-600">

      {/* Decorative rings — UTM elearning style */}
      <div className="absolute -top-20 -left-20 w-96 h-96 rounded-full border-[40px]
        border-white/10 pointer-events-none" />
      <div className="absolute -top-10 -left-10 w-72 h-72 rounded-full border-[30px]
        border-white/10 pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-96 h-96 rounded-full border-[40px]
        border-white/10 pointer-events-none" />
      <div className="absolute -bottom-12 -right-12 w-64 h-64 rounded-full border-[28px]
        border-white/10 pointer-events-none" />

      {/* Login card */}
      <div className="relative z-10 w-full max-w-[420px] mx-4 bg-white rounded-2xl
        shadow-2xl p-10">

        {/* Logo + title */}
        <div className="flex flex-col items-center mb-8">
          <img src="/LOGO-UTM.png" alt="UTM logo"
            className="h-24 w-auto mb-4" />
          <h1 className="text-2xl font-bold text-[#7A1F2E] text-center">
            SecureExam UTM
          </h1>
          <p className="text-sm text-gray-500 mt-1 text-center">
            Sign in to your secure exam account
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200
            text-red-700 rounded-lg text-sm text-center">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input type="email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading} required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                focus:ring-2 focus:ring-[#7A1F2E] focus:border-transparent
                disabled:opacity-50 text-sm" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading} required
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                  focus:ring-2 focus:ring-[#7A1F2E] focus:border-transparent
                  pr-16 disabled:opacity-50 text-sm" />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                disabled={loading}
                className="absolute inset-y-0 right-0 px-4 text-xs text-gray-500
                  hover:text-gray-800 focus:outline-none">
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading}
            className="w-full py-2.5 mt-2 font-semibold text-white rounded-lg
              bg-[#7A1F2E] hover:bg-[#601826] transition
              disabled:opacity-50 focus:ring-2 focus:ring-[#7A1F2E] focus:ring-offset-2">
            {loading ? 'Signing in...' : 'Log in'}
          </button>
        </form>

        <div className="text-xs text-center text-gray-400 mt-6">
          <p>All activities are monitored and logged</p>
          <Link to="/regulations"
            className="mt-1 inline-block hover:text-gray-600 underline">
            View Regulations
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Login;
