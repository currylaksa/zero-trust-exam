import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axios';
import { useAuth } from '../context/useAuth';

const MFASetup = () => {
    const navigate = useNavigate();
    const { login } = useAuth();
    const [qrCode, setQrCode] = useState(null);
    const [otp, setOtp] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSuccess, setIsSuccess] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);

    const fetchedRef = React.useRef(false);

    useEffect(() => {
        if (fetchedRef.current) return;
        fetchedRef.current = true;

        const setupToken = localStorage.getItem('exam_setup_token');
        if (!setupToken) {
            // No setup token → user shouldn't be here. Send to login.
            navigate('/login', { replace: true });
            return;
        }

        const fetchQRCode = async () => {
            try {
                const response = await axios.post('/auth/setup-mfa', { setupToken });
                if (response.data && response.data.qrCode) {
                    setQrCode(response.data.qrCode);
                } else {
                    setError('Failed to generate QR Code. Please try again.');
                }
            } catch (err) {
                setError(err.response?.data?.message || 'Error setting up MFA.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchQRCode();
    }, [navigate]);

    const handleConfirmSetup = async (e) => {
        e.preventDefault();
        setError('');

        if (!otp || otp.length !== 6) {
            setError('Please enter a valid 6-digit code.');
            return;
        }

        const setupToken = localStorage.getItem('exam_setup_token');
        if (!setupToken) {
            setError('Setup session expired. Please log in again.');
            navigate('/login', { replace: true });
            return;
        }

        setIsVerifying(true);
        try {
            const response = await axios.post('/auth/verify-mfa', {
                tempToken: setupToken,
                otp: otp
            });

            if (response.data && response.data.token && response.data.user) {
                // MFA enrolled — promote setup token to a real session.
                localStorage.removeItem('exam_setup_token');
                login(response.data.token, response.data.user);
                setIsSuccess(true);
            } else {
                setError('Verification succeeded but session could not be established. Please log in again.');
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Invalid verification code. Please try again.');
        } finally {
            setIsVerifying(false);
        }
    };

    if (isSuccess) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-stone-50 py-12 px-4 sm:px-6 lg:px-8">
                <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-md text-center">
                    <div>
                        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-6">
                            <svg className="h-10 w-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                            Success!
                        </h2>
                        <p className="mt-2 text-center text-sm text-gray-600">
                            MFA has been successfully enabled for your account.
                        </p>
                    </div>
                    <div className="mt-8">
                        <button
                            onClick={() => navigate('/dashboard')}
                            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#7A1F2E] hover:bg-[#601826] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#7A1F2E]"
                        >
                            Go to Dashboard
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-stone-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-md">
                <div>
                    <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                        Enable Two-Factor Authentication
                    </h2>
                </div>

                {error && (
                    <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
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

                <div className="mt-8 space-y-6">
                    {/* Step 1: Scan QR Code */}
                    <div className="border border-gray-200 rounded-md p-6 bg-gray-50">
                        <h3 className="text-lg font-medium text-gray-900 mb-2">Step 1: Scan this QR code</h3>
                        <p className="text-sm text-gray-600 mb-4">
                            Use Google Authenticator or Authy to scan the code below.
                        </p>
                        
                        <div className="flex justify-center items-center h-48 bg-white rounded border border-gray-200">
                            {isLoading ? (
                                <div className="flex flex-col items-center">
                                    <svg className="animate-spin h-8 w-8 text-[#7A1F2E] mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    <span className="text-sm text-gray-500">Generating QR code...</span>
                                </div>
                            ) : qrCode ? (
                                <img src={qrCode} alt="MFA QR Code" className="h-44 w-44 object-contain" />
                            ) : (
                                <span className="text-sm text-red-500">QR Code unavailable</span>
                            )}
                        </div>
                    </div>

                    {/* Step 2: Verification */}
                    {(!isLoading && qrCode) && (
                        <div className="border border-gray-200 rounded-md p-6 bg-gray-50">
                            <h3 className="text-lg font-medium text-gray-900 mb-2">Step 2: Enter the verification code</h3>
                            <p className="text-sm text-gray-600 mb-4">
                                Enter the 6-digit code shown in your authenticator app to confirm setup.
                            </p>
                            
                            <form onSubmit={handleConfirmSetup} className="space-y-4">
                                <div>
                                    <label htmlFor="otp" className="sr-only">Verification Code</label>
                                    <input
                                        id="otp"
                                        name="otp"
                                        type="text"
                                        required
                                        className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-[#7A1F2E] focus:border-[#7A1F2E] focus:z-10 sm:text-sm tracking-widest text-center text-lg"
                                        placeholder="000000"
                                        maxLength="6"
                                        value={otp}
                                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                                        disabled={isVerifying}
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={isVerifying || otp.length !== 6}
                                    className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-[#7A1F2E] hover:bg-[#601826] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#7A1F2E] disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isVerifying ? 'Verifying...' : 'Confirm Setup'}
                                </button>
                            </form>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MFASetup;
