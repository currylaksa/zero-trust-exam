import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import axios from '../api/axios';
import { useAuth } from '../context/useAuth';
import RoleNavbar from '../components/RoleNavbar';
import { PageWrapper, PageMain, PageHeading, ErrorAlert, MetricCard } from '../components/ui';

// Risk-band thresholds — must match backend/risk-scoring/service.py LOW_BAND/HIGH_BAND.
const STALE_SCORE_MS = 90 * 1000;

// ── Presentational helpers (no business logic) ──
const svgCls = 'h-8 w-8';
const IconPulse = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={svgCls}>
    <path d="M3 12h4l2 6 4-12 2 6h6" />
  </svg>
);
const IconBell = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={svgCls}>
    <path d="M6 9a6 6 0 1112 0c0 6 2.5 6 2.5 8.5H3.5C3.5 15 6 15 6 9z" />
    <path d="M10 20.5a2 2 0 004 0" />
  </svg>
);
const IconFlag = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={svgCls}>
    <path d="M5 21V4M5 4h12l-2.5 4L17 12H5" />
  </svg>
);

// Pulsing "LIVE" indicator — signals the 30s auto-refresh poll is active.
const LivePill = () => (
  <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 ring-1 ring-green-200">
    <span className="lp-pulse h-1.5 w-1.5 rounded-full bg-green-500" />
    LIVE · 30s
  </span>
);

// Inline risk-score meter — width = score, colour = risk band.
const RiskMeter = ({ score, level }) => {
  if (score == null) return null;
  const color = level === 'high' ? 'bg-red-500' : level === 'medium' ? 'bg-amber-500' : 'bg-green-500';
  return (
    <div className="mt-1.5 h-1 w-24 overflow-hidden rounded-full bg-gray-200">
      <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${Math.max(4, Math.min(100, score))}%` }} />
    </div>
  );
};

const MonitoringPanel = () => {
  const [sessions, setSessions] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Control #26 dashboard state.
  const [sortBy, setSortBy] = useState('risk');               // 'risk' | 'started' | 'tab_switches'
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [riskHistory, setRiskHistory] = useState({ count: 0, scores: [] });
  const [historyLoading, setHistoryLoading] = useState(false);
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

  // Re-derive the live row for the currently selected session every render.
  // The poll updates `sessions` every 30s; this keeps the modal showing
  // current data without storing a stale snapshot from the row click.
  const liveSelected = useMemo(
    () => (selectedSessionId == null ? null : sessions.find((s) => s.session_id === selectedSessionId) || null),
    [sessions, selectedSessionId]
  );

  // Fetch risk-history when the modal opens AND on each poll while open.
  // The `sessions` dep means the sparkline refreshes naturally as new
  // scores accumulate; no separate poll needed for the modal itself.
  useEffect(() => {
    if (selectedSessionId == null) return undefined;
    let cancelled = false;
    setHistoryLoading(true);
    axios
      .get(`/monitoring/sessions/${selectedSessionId}/risk-history`)
      .then((res) => {
        if (cancelled) return;
        setRiskHistory(res.data || { count: 0, scores: [] });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load risk history:', err);
        setRiskHistory({ count: 0, scores: [] });
      })
      .finally(() => {
        if (cancelled) return;
        setHistoryLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedSessionId, sessions]);

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

  // Risk pill color — green/amber/red/grey (grey = not yet scored).
  const riskPillClass = (level) => {
    switch (level) {
      case 'high':   return 'bg-red-100 text-red-800 border-red-300';
      case 'medium': return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'low':    return 'bg-green-100 text-green-800 border-green-300';
      default:       return 'bg-gray-100 text-gray-500 border-gray-300';
    }
  };

  // Whether the latest score for a session is older than STALE_SCORE_MS.
  // Used by the modal to render the "scoring paused" indicator.
  const isStale = (scoredAt) => {
    if (!scoredAt) return false;
    return Date.now() - new Date(scoredAt).getTime() > STALE_SCORE_MS;
  };

  // Sort with risk DESC default; nulls (never-scored) sink. Sentinel -1
  // for null risk_score keeps the comparator total-ordered.
  const sortedSessions = useMemo(() => {
    const copy = [...sessions];
    if (sortBy === 'risk') {
      copy.sort((a, b) => (b.risk_score ?? -1) - (a.risk_score ?? -1));
    } else if (sortBy === 'started') {
      copy.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
    } else if (sortBy === 'tab_switches') {
      copy.sort((a, b) => (b.tab_switch_count ?? 0) - (a.tab_switch_count ?? 0));
    }
    return copy;
  }, [sessions, sortBy]);

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
          <MetricCard label="Active Sessions" value={activeSessionsCount}
            accentColor="border-[#7A1F2E]" valueColor="text-[#7A1F2E]" icon={<IconPulse />} />
          <MetricCard label="Unreviewed Alerts" value={unreviewedAlertsCount}
            accentColor="border-red-500" valueColor="text-red-600" icon={<IconBell />} />
          <MetricCard label="Total Flagged Today" value={totalFlaggedTodayCount}
            accentColor="border-yellow-500" valueColor="text-yellow-600" icon={<IconFlag />} />
        </div>

        <ErrorAlert message={error} className="mb-6" />

        {/* Two-Column Layout 60/40 */}
        <div className="flex flex-col lg:flex-row gap-8">
          
          {/* Left Column: Live Sessions (60%) */}
          <div className="lg:w-3/5 min-w-0">
            <div className="bg-white shadow rounded-lg overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-200 bg-white flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <h3 className="text-lg leading-6 font-semibold text-gray-900">Live Sessions</h3>
                  <LivePill />
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-gray-500 mr-2">Sort by:</span>
                  {[
                    { key: 'risk',         label: 'Risk' },
                    { key: 'started',      label: 'Started' },
                    { key: 'tab_switches', label: 'Tab Switches' },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setSortBy(opt.key)}
                      className={`px-2 py-1 rounded ${
                        sortBy === opt.key
                          ? 'bg-[#7A1F2E] text-white'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Student</th>
                      <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Risk</th>
                      <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Exam</th>
                      <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Started</th>
                      <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                      <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Tab Switches (total away time)</th>
                      <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Fullscreen Exits</th>
                      <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {!loading && sortedSessions.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="px-6 py-8 text-center text-gray-500">No active sessions</td>
                      </tr>
                    ) : (
                      sortedSessions.map((session) => {
                        const isFlagged = session.status === 'flagged' || session.flagged;
                        const isHighRisk = session.risk_level === 'high';
                        const manyTabSwitches = session.tab_switch_count >= 3;
                        const riskLabel = session.risk_score == null
                          ? 'scoring…'
                          : `${session.risk_score} ${session.risk_level}`;
                        return (
                          <tr
                            key={session.session_id}
                            onClick={() => setSelectedSessionId(session.session_id)}
                            className={`cursor-pointer transition-colors ${isFlagged || isHighRisk ? 'border-l-4 border-red-500 bg-red-50/40 hover:bg-red-50' : 'hover:bg-gray-50'}`}
                          >
                            <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{session.student_name || session.username || `User ${session.user_id}`}</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full border ${riskPillClass(session.risk_level)}`}>
                                {riskLabel}
                              </span>
                              <RiskMeter score={session.risk_score} level={session.risk_level} />
                            </td>
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
                              <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${session.status === 'completed' ? 'bg-green-100 text-green-800' : session.status === 'in_progress' ? 'bg-[#FFF1F2] text-[#7A1F2E] border border-[#7A1F2E]/20' : 'bg-red-100 text-red-800'}`}>
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

                          <div className="mb-3 rounded-md border border-[#7A1F2E]/15 bg-[#FFF1F2] px-3 py-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7A1F2E]">Exam</p>
                            <p
                              className="text-sm font-bold leading-5 text-[#601826]"
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
                              className="px-3 py-1.5 text-sm font-semibold text-[#7A1F2E] bg-white border border-[#7A1F2E]/40 rounded-md hover:bg-[#FFF1F2] transition outline-none"
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

      {/* Control #26 — session detail modal. Renders only when a row is selected. */}
      {selectedSessionId != null && (
        <SessionDetailModal
          session={liveSelected}
          history={riskHistory}
          historyLoading={historyLoading}
          isStale={isStale}
          riskPillClass={riskPillClass}
          onClose={() => setSelectedSessionId(null)}
        />
      )}
    </PageWrapper>
  );
};

// Inline SVG sparkline. No chart library — matches the lib-free convention
// of this codebase. Renders the `last 30 risk scores` as a polyline over
// three faintly-coloured horizontal bands (low/medium/high) so the
// invigilator immediately sees which band the trace is sitting in.
const Sparkline = ({ scores }) => {
  if (!scores || scores.length === 0) {
    return <p className="text-sm text-gray-400">No score history yet.</p>;
  }
  const W = 480;
  const H = 90;
  const PAD = 6;
  const yForScore = (score) => PAD + (H - PAD * 2) * (1 - score / 100);

  const xStep = scores.length > 1 ? (W - PAD * 2) / (scores.length - 1) : 0;
  const points = scores
    .map((s, i) => `${PAD + i * xStep},${yForScore(s.risk_score)}`)
    .join(' ');

  // Three risk bands as background fill (low at the bottom, high at top).
  const yHighTop    = 0;
  const yHighBottom = yForScore(70);
  const yMedBottom  = yForScore(40);

  return (
    <svg width={W} height={H} className="block w-full max-w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <rect x="0" y={yHighTop}    width={W} height={yHighBottom - yHighTop}      fill="#fee2e2" />
      <rect x="0" y={yHighBottom} width={W} height={yMedBottom - yHighBottom}    fill="#fef3c7" />
      <rect x="0" y={yMedBottom}  width={W} height={H - yMedBottom}              fill="#dcfce7" />
      <polyline fill="none" stroke="#7A1F2E" strokeWidth="2" points={points} />
      {scores.map((s, i) => (
        <circle
          key={s.score_id ?? i}
          cx={PAD + i * xStep}
          cy={yForScore(s.risk_score)}
          r="2.5"
          fill="#7A1F2E"
        />
      ))}
    </svg>
  );
};

const SessionDetailModal = ({ session, history, historyLoading, isStale, riskPillClass, onClose }) => {
  // If the session is no longer in the live list (e.g. completed during the
  // 30s poll), `session` is null. Show a graceful "session ended" state
  // and let the user close the modal.
  if (!session) {
    return (
      <div
        className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-lg shadow-2xl p-6 w-full max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="text-lg font-semibold text-gray-900">Session ended</h2>
          <p className="text-sm text-gray-600 mt-2">
            This session is no longer active. Open the audit log for the full event timeline.
          </p>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-800 rounded text-gray-800 hover:bg-gray-100"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const stale = isStale(session.risk_scored_at);
  const factors = Array.isArray(session.contributing_factors) ? session.contributing_factors : [];
  const studentLabel = session.student_name || session.username || `User ${session.user_id}`;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{studentLabel}</h2>
            <p className="text-sm text-gray-600">{session.exam_title || `Exam ${session.exam_id}`}</p>
            <p className="text-xs text-gray-500 mt-1 capitalize">Status: {session.status?.replace('_', ' ')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Current risk */}
        <div className="border-t pt-4">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">Current risk</div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-3xl font-bold text-gray-900">
              {session.risk_score == null ? '—' : session.risk_score}
            </span>
            <span className={`px-3 py-1 inline-flex text-sm font-semibold rounded-full border ${riskPillClass(session.risk_level)}`}>
              {session.risk_level || 'not yet scored'}
            </span>
            {stale && (
              <span className="px-2 py-1 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded">
                Scoring paused — last score &gt; 90s ago
              </span>
            )}
          </div>
        </div>

        {/* Contributing factors */}
        <div className="border-t mt-4 pt-4">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">Contributing factors</div>
          {factors.length === 0 ? (
            <p className="text-sm text-gray-400">None reported.</p>
          ) : (
            <ul className="list-disc pl-5 text-sm text-gray-800 space-y-1">
              {factors.map((f) => (
                <li key={f}>{String(f).replace(/_/g, ' ')}</li>
              ))}
            </ul>
          )}
        </div>

        {/* Sparkline */}
        <div className="border-t mt-4 pt-4">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">
            Last {history?.count ?? 0} scores
          </div>
          {historyLoading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : (
            <Sparkline scores={history?.scores || []} />
          )}
        </div>

        {/* Actions */}
        <div className="border-t mt-6 pt-4 flex justify-end gap-3">
          <Link
            to={`/manage/audit-logs?session_id=${session.session_id}`}
            className="px-4 py-2 text-sm font-semibold text-[#7A1F2E] bg-white border border-[#7A1F2E]/40 rounded-md hover:bg-[#FFF1F2] transition"
          >
            Open in audit logs
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-800 rounded text-gray-800 hover:bg-gray-100"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default MonitoringPanel;
