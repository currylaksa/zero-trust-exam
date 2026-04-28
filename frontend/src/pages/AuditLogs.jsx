import React, { useState, useEffect, useCallback } from 'react';
import axios from '../api/axios';
import { useAuth } from '../context/useAuth';
import RoleNavbar from '../components/RoleNavbar';
import { PageWrapper, PageMain, PageHeading, ErrorAlert } from '../components/ui';

const AuditLogs = () => {
  const { user, logout } = useAuth();
  
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activityType, setActivityType] = useState('');
  const [date, setDate] = useState('');
  const [page, setPage] = useState(1);
  const limit = 50;

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      if (search !== debouncedSearch) {
        setPage(1); // Reset to page 1 on search change
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [search, debouncedSearch]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit,
        ...(debouncedSearch && { search: debouncedSearch }),
        ...(activityType && { activity_type: activityType }),
        ...(date && { date })
      };
      
      const response = await axios.get('/monitoring/audit-logs', { params });
      const data = response.data;
      
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
      setError(null);
    } catch (err) {
      console.error('Audit logs fetch error:', err);
      // Give a more descriptive error if possible from the response
      const errorMessage = err.response?.data?.message || 'Failed to load audit logs.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, activityType, date, page, limit]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleClearFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setActivityType('');
    setDate('');
    setPage(1);
  };

  const getActivityTypeBadge = (type) => {
    switch (type) {
      case 'TAB_SWITCH':
      case 'FULLSCREEN_EXIT':
      case 'IP_MISMATCH':
        return 'bg-red-100 text-red-800';
      case 'LOGIN':
      case 'EXAM_SUBMIT':
        return 'bg-green-100 text-green-800';
      case 'EXAM_START':
        return 'bg-yellow-100 text-yellow-800';
      case 'HEARTBEAT':
      case 'API_ACCESS':
        return 'bg-gray-100 text-gray-800';
      case 'LOGOUT':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatTimestamp = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    const day = d.getDate().toString().padStart(2, '0');
    const monthFormatter = new Intl.DateTimeFormat('en', { month: 'short' });
    const month = monthFormatter.format(d);
    const year = d.getFullYear();
    const time = d.toTimeString().split(' ')[0];
    return `${day} ${month} ${year}, ${time}`;
  };

  const homePath = user?.role === 'admin' ? '/admin/dashboard' : '/lecturer/dashboard';

  return (
    <PageWrapper>
      <RoleNavbar
        user={user}
        role={user?.role || 'lecturer'}
        homePath={homePath}
        links={[
          { key: 'audit-dashboard', label: 'Dashboard', to: homePath },
          { key: 'audit-monitoring', label: 'Live Monitoring', to: '/manage/monitoring' },
          { key: 'audit-regulations', label: 'Regulations', to: '/regulations' }
        ]}
        onLogout={logout}
      />

      <PageMain>
        <PageHeading>Audit Log</PageHeading>

        {/* Filter Bar */}
        <div className="bg-white shadow rounded-lg p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4 border-b border-gray-200 pb-4">
            <div className="flex-1">
              <label htmlFor="search" className="sr-only">Search</label>
              <input
                type="text"
                id="search"
                className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-[#7A1F2E] focus:border-[#7A1F2E] sm:text-sm"
                placeholder="Search by username or email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="w-full md:w-48">
              <select
                className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-[#7A1F2E] focus:border-[#7A1F2E] sm:text-sm"
                value={activityType}
                onChange={(e) => {
                  setActivityType(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All Types</option>
                <option value="LOGIN">LOGIN</option>
                <option value="LOGOUT">LOGOUT</option>
                <option value="EXAM_START">EXAM_START</option>
                <option value="EXAM_SUBMIT">EXAM_SUBMIT</option>
                <option value="TAB_SWITCH">TAB_SWITCH</option>
                <option value="FULLSCREEN_EXIT">FULLSCREEN_EXIT</option>
                <option value="IP_MISMATCH">IP_MISMATCH</option>
                <option value="HEARTBEAT">HEARTBEAT</option>
                <option value="API_ACCESS">API_ACCESS</option>
              </select>
            </div>
            <div className="w-full md:w-48">
              <input
                type="date"
                className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-[#7A1F2E] focus:border-[#7A1F2E] sm:text-sm"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div>
              <button
                type="button"
                className="w-full md:w-auto inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#7A1F2E]"
                onClick={handleClearFilters}
              >
                Clear Filters
              </button>
            </div>
          </div>
          
          <div className="pt-4 text-sm text-gray-500">
            Showing {logs.length} of {total} entries
          </div>
        </div>

        <ErrorAlert message={error} className="mb-6" />

        {/* Table */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Username
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Activity Type
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Session ID
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading && logs.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-8 text-center text-sm text-gray-500">
                      Loading logs...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-8 text-center text-sm text-gray-500">
                      No logs found matching your criteria.
                    </td>
                  </tr>
                ) : (
                  logs.map((log, index) => (
                    <tr key={log.log_id || index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatTimestamp(log.timestamp)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {log.username || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getActivityTypeBadge(log.activity_type)}`}>
                          {log.activity_type}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 max-w-sm truncate" title={log.description}>
                        {log.description || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {log.session_id || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          {totalPages > 0 && (
            <div className="bg-white px-4 py-3 border-t border-gray-200 flex items-center justify-between sm:px-6">
              <div className="flex-1 flex justify-between sm:hidden">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    Page <span className="font-medium">{page}</span> of <span className="font-medium">{totalPages === 0 ? 1 : totalPages}</span>
                  </p>
                </div>
                <div>
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <span className="sr-only">Previous</span>
                      Previous
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages || totalPages === 0}
                      className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <span className="sr-only">Next</span>
                      Next
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
        </div>
      </PageMain>
    </PageWrapper>
  );
};

export default AuditLogs;