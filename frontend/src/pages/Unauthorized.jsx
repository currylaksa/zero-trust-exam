import React from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Unauthorized Page
 * Shown when user lacks necessary permissions
 */
const Unauthorized = () => {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-center min-h-screen bg-stone-50">
      <div className="text-center p-8">
        <h1 className="text-6xl font-bold text-red-600 mb-4">Access Denied</h1>
        <p className="text-xl text-gray-600 mb-8">
          You do not have permission to access this page.
        </p>
        <button
          onClick={() => navigate('/dashboard')}
          className="px-6 py-3 font-semibold text-white bg-[#7A1F2E] rounded-lg hover:bg-[#601826]"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
};

export default Unauthorized;
