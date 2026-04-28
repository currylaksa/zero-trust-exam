import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../api/axios';
import { useAuth } from '../context/useAuth';
import RoleNavbar from '../components/RoleNavbar';

const HOME_PATHS = {
  student: '/student/dashboard',
  lecturer: '/lecturer/dashboard',
  staff: '/staff/dashboard',
  admin: '/admin/dashboard',
};

const Regulations = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  useEffect(() => {
    const fetchRegulations = async () => {
      try {
        const response = await axiosInstance.get('/regulations');
        setData(response.data);
      } catch (err) {
        console.error('Error fetching regulations:', err);
        setError('Failed to load regulations. Please try again later.');
      } finally {
        setLoading(false);
      }
    };
    fetchRegulations();
  }, []);

  const getIcon = (iconStr) => {
    switch (iconStr) {
      case 'shield': return '🛡️';
      case 'clipboard': return '📋';
      case 'lock': return '🔒';
      case 'eye': return '👁️';
      default: return '📜';
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col font-sans">
      {user && (
        <RoleNavbar
          user={user}
          role={user.role}
          homePath={HOME_PATHS[user.role] || '/dashboard'}
          links={[]}
          onLogout={logout}
        />
      )}

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <button
          onClick={() => navigate(-1)}
          className="mb-6 inline-flex items-center text-sm font-medium text-[#7A1F2E] hover:text-[#601826]"
        >
          &larr; Back
        </button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Zero-Trust Security Regulations</h1>
          <p className="mt-2 text-lg text-gray-600">
            The following policies are automatically enforced by this system. All users are bound by these regulations.
          </p>
          {data && (
            <p className="mt-2 text-xs text-gray-500">
              Version {data.version} — Last updated {data.lastUpdated}
            </p>
          )}
        </div>

        {loading ? (
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white shadow rounded-lg p-6 animate-pulse">
                <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
                <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bg-red-50 text-red-700 p-4 rounded-lg">{error}</div>
        ) : (
          <div className="space-y-8">
            {data.categories.map((category) => (
              <div key={category.id} className="bg-white shadow overflow-hidden sm:rounded-lg border border-gray-200">
                <div className="px-4 py-5 sm:px-6 bg-gray-50 border-b border-gray-200 flex items-center">
                  <span className="text-2xl mr-3">{getIcon(category.icon)}</span>
                  <h3 className="text-lg leading-6 font-medium text-gray-900">
                    {category.title}
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/2">
                          Rule
                        </th>
                        <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-1/6">
                          Enforcement
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/3">
                          Consequence
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {category.rules.map((rule, index) => (
                        <tr key={rule.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-6 py-4 text-sm font-medium text-gray-900">
                            {rule.rule}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                              Automatic
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">
                            {rule.consequence}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Regulations;
