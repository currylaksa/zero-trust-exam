import React, { useState, useEffect } from 'react';
import axios from '../api/axios';
import { useAuth } from '../context/useAuth';
import RoleNavbar from '../components/RoleNavbar';
import { PageWrapper, PageMain, PageHeading, ErrorAlert } from '../components/ui';

const MonitoringPanel = () => {
  const [sessions, setSessions] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user, logout } = useAuth();

  const fetchData = async () => {
    try {
      const [sessionsRes, alertsRes] = await Promise.all([
        axios.get('/monitoring/sessions'),
        axios.get('/monitoring/alerts')
      ]);
      setSessions(sessionsRes.data.data || sessionsRes.data || []);
      setAlerts(alertsRes.data.data || alertsRes.data || []);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Failed to load monitoring data.');
    } finally {
      if (loading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMarkReviewed = async (id) => {
    // Optimistic update
    const previousAlerts = [...alerts];
    setAlerts(alerts.filter(alert => (alert.flag_id || alert.id) !== id));

    try {
      await axios.put(`/monitoring/alerts/${id}/review`);
    } catch (err) {
      console.error('Failed to mark alert as reviewed:', err);
      // Revert if error
      setAlerts(previousAlerts);
    }
  };

  const getAlertBadgeColor = (type) => {
    switch (type) {
      case 'TAB_SWITCH': return 'bg-red-500 text-white';
      case 'FULLSCREEN_EXIT': return 'bg-orange-500 text-white';
      case 'IP_MISMATCH': return 'bg-red-800 text-white';
      default: return 'bg-yellow-500 text-white';
    }
  };

  const getSeverityBadgeColor = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'high': return 'bg-red-500 text-white';
      case 'medium': return 'bg-yellow-500 text-white';
      case 'low': return 'bg-blue-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const calculateDuration = (startTime, endTime) => {
    if (!startTime) return '0m';
    const start = new Date(startTime).getTime();
    const end = endTime ? new Date(endTime).getTime() : new Date().getTime();
    const diffMins = Math.floor((end - start) / 60000);
    if (diffMins < 60) return `${diffMins}m`;
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ${hours % 24}h ${mins}m`;
    return `${hours}h ${mins}m`;
  };

  const calculateTimeAgo = (timeStr) => {
    if (!timeStr) return 'Just now';
    const time = new Date(timeStr).getTime();
    const now = new Date().getTime();
    const diffMins = Math.floor((now - time) / 60000);
    if (diffMins === 0) return 'Just now';
    if (diffMins === 1) return '1 minute ago';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours === 1) return '1 hour ago';
    return `${diffHours} hours ago`;
  };

  // Derived metrics
  const activeSessionsCount = sessions.filter(s => s.status === 'in_progress' || s.status === 'flagged').length;
  const unreviewedAlertsCount = alerts.filter(a => !a.reviewed_at && !a.reviewed).length;
  // Approximation based on alerts array, total flagged today could be fetched separately or calculated if alerts has timestamp 
  const totalFlaggedTodayCount = alerts.length; 

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    // Shows format like "Mar 29, 04:39 PM"
    return new Date(dateStr).toLocaleString([], {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const formatStatus = (status) => {
    if (status === 'in_progress') return 'In Progress';
    if (status === 'completed') return 'Completed';
    if (!status) return '-';
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const homePath = user?.role === 'admin' ? '/admin/dashboard' : '/lecturer/dashboard';

  return (
    <PageWrapper>
      <RoleNavbar
        user={user}
        role={user?.role || 'lecturer'}
        homePath={homePath}
        links={[
          { key: 'monitor-dashboard', label: 'Dashboard', to: homePath },
          { key: 'monitor-audit', label: 'Audit Logs', to: '/manage/audit-logs' },
          { key: 'monitor-regulations', label: 'Regulations', to: '/regulations' }
        ]}
        onLogout={logout}
      />

      <PageMain>
        <PageHeading>Live Monitoring</PageHeading>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-[#7A1F2E]">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Active Sessions</h3>
            <p className="mt-2 text-3xl font-bold text-[#7A1F2E]">{activeSessionsCount}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-500">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Unreviewed Alerts</h3>
            <p className="mt-2 text-3xl font-bold text-red-600">{unreviewedAlertsCount}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-yellow-500">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Total Flagged Today</h3>
            <p className="mt-2 text-3xl font-bold text-yellow-600">{totalFlaggedTodayCount}</p>
          </div>
        </div>

        <ErrorAlert message={error} className="mb-6" />

        {/* Two-Column Layout 60/40 */}
        <div className="flex flex-col lg:flex-row gap-8">
          
          {/* Left Column: Live Sessions (60%) */}
          <div className="lg:w-3/5 min-w-0">
            <div className="bg-white shadow rounded-lg overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-200 bg-white">
                <h3 className="text-lg leading-6 font-medium text-gray-900">Live Sessions</h3>
              </div>
              
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Student</th>
                      <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Exam</th>
                      <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Started</th>
                      <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                      <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Tab Switches (total away time)</th>
                      <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Fullscreen Exits</th>
                      <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {!loading && sessions.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="px-6 py-8 text-center text-gray-500">No active sessions</td>
                      </tr>
                    ) : (
                      sessions.map((session) => {
                        const isFlagged = session.status === 'flagged' || session.flagged;
                        const manyTabSwitches = session.tab_switch_count >= 3;
                        return (
                          <tr 
                            key={session.id} 
                            className={isFlagged ? 'border-l-4 border-red-500' : ''}
                          >
                            <td className="px-6 py-4 whitespace-nowrap">{session.student_name || session.username || `User ${session.user_id}`}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{session.exam_title || `Exam ${session.exam_id}`}</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {formatDate(session.start_time)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">{calculateDuration(session.start_time, session.end_time)}</td>
                            <td className={`px-6 py-4 whitespace-nowrap ${manyTabSwitches ? 'text-red-600 font-bold' : ''}`}>
                              {session.total_away_seconds !== null && session.total_away_seconds !== undefined
                                ? `${session.tab_switch_count || 0} switches (${session.total_away_seconds}s total)`
                                : (session.tab_switch_count || 0)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">{session.fullscreen_exit_count || 0}</td>
                            <td className="px-6 py-4 whitespace-nowrap capitalize">
                              <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${session.status === 'completed' ? 'bg-green-100 text-green-800' : session.status === 'in_progress' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'}`}>
                                {formatStatus(session.status)}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Column: Activity Alerts panel (40%) */}
          <div className="lg:w-2/5 flex flex-col h-[600px]">
            <div className="bg-white shadow rounded-lg flex flex-col h-full overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-200">
                <h3 className="text-lg leading-6 font-medium text-gray-900">Alerts requiring review</h3>
              </div>
              
              <div className="p-4 flex-1 overflow-y-auto">
                {!loading && alerts.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">No unreviewed alerts</div>
                ) : (
                  <div className="space-y-4">
                    {alerts.map((alert) => {
                      // Handle the possibility that the alert has timestamp or flagged_at instead of created_at
                      const alertTime = alert.timestamp || alert.flagged_at || alert.created_at;
                      return (
                        <div key={alert.flag_id || alert.id} className="border rounded-lg p-4 bg-white shadow-sm hover:shadow transition">
                          <div className="flex justify-between items-start mb-2">
                            <span className="font-bold text-gray-900">{alert.student_name || alert.username || `User ${alert.user_id}`}</span>
                            <span className="text-xs text-gray-500">{calculateTimeAgo(alertTime)}</span>
                          </div>

                          <div className="mb-3 rounded-md border border-blue-100 bg-blue-50 px-3 py-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Exam</p>
                            <p
                              className="text-sm font-bold leading-5 text-blue-900"
                              style={{
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden'
                              }}
                            >
                              {alert.exam_title || 'Unknown exam'}
                            </p>
                          </div>
                          
                          <div className="flex items-center gap-2 mb-3">
                            <span className={`text-xs px-2 py-1 rounded font-semibold ${getAlertBadgeColor(alert.activity_type)}`}>
                              {alert.activity_type}
                            </span>
                            {alert.severity && (
                              <span className={`text-xs px-2 py-1 rounded font-semibold ${getSeverityBadgeColor(alert.severity)}`}>
                                {alert.severity}
                              </span>
                            )}
                          </div>

                          <p className="text-sm text-gray-600 mb-4">{alert.description || alert.details || 'Suspicious activity detected'}</p>

                          {alert.activity_type === 'TAB_SWITCH' &&
                            alert.duration_away_seconds !== null &&
                            alert.duration_away_seconds !== undefined &&
                            Number(alert.duration_away_seconds) > 0 && (
                              <p className="text-orange-600 text-xs mb-4">
                                Away duration: {alert.duration_away_seconds} seconds
                              </p>
                            )}
                          
                          <div className="flex justify-end">
                            <button
                              onClick={() => handleMarkReviewed(alert.flag_id || alert.id)}
                              className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-white border border-blue-300 rounded hover:bg-blue-50 outline-none"
                            >
                              Mark Reviewed
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </PageMain>
    </PageWrapper>
  );
};

export default MonitoringPanel;
