import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import axios from '../api/axios';
import { useAuth } from '../context/useAuth';
import RoleNavbar from '../components/RoleNavbar';
import { PageWrapper, PageMain, PageHeading, ErrorAlert, MetricCard, Badge } from '../components/ui';

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

// Risk band → meter colour. Single source for the card accents.
const riskBandColor = (level) =>
  level === 'high' ? 'bg-red-500' : level === 'medium' ? 'bg-amber-500' : 'bg-green-500';

// One labelled telemetry field inside a session card. Mono value gives the
// "instrument readout" feel (IBM Plex Mono via --font-mono).
const Field = ({ label, value, valueClass = '' }) => (
  <div className="min-w-0">
    <dt className="text-[10px] font-medium uppercase tracking-wider text-gray-400">{label}</dt>
    <dd className={`mt-0.5 truncate font-mono text-sm text-gray-800 ${valueClass}`}>{value}</dd>
  </div>
);

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

              <div className="max-h-[640px] space-y-3 overflow-y-auto bg-stone-50/50 p-3 sm:p-4">
                {!loading && sortedSessions.length === 0 ? (
                  <div className="px-6 py-10 text-center text-gray-500">No active sessions</div>
                ) : (
                  sortedSessions.map((session) => {
                    const isFlagged = session.status === 'flagged' || session.flagged;
                    const isHighRisk = session.risk_level === 'high';
                    const isAlert = isFlagged || isHighRisk;
                    const manyTabSwitches = session.tab_switch_count >= 3;
                    const riskLabel = session.risk_score == null
                      ? 'scoring…'
                      : `${session.risk_score} ${session.risk_level}`;
                    const studentLabel = session.student_name || session.username || `User ${session.user_id}`;
                    const tabsValue = session.total_away_seconds !== null && session.total_away_seconds !== undefined
                      ? `${session.tab_switch_count || 0} · ${session.total_away_seconds}s away`
                      : `${session.tab_switch_count || 0}`;
                    const statusChip = session.status === 'completed'
                      ? 'bg-green-100 text-green-800'
                      : session.status === 'in_progress'
                        ? 'bg-[#FFF1F2] text-[#7A1F2E] border border-[#7A1F2E]/20'
                        : 'bg-red-100 text-red-800';
                    return (
                      <button
                        key={session.session_id}
                        type="button"
                        onClick={() => setSelectedSessionId(session.session_id)}
                        className={`lift block w-full rounded-xl border p-4 text-left transition ${
                          isAlert
                            ? 'border-red-200 border-l-4 border-l-red-500 bg-red-50/50 hover:bg-red-50'
                            : 'border-gray-200 bg-white hover:border-[#7A1F2E]/30 hover:shadow-md'
                        }`}
                      >
                        {/* Header: student + exam, risk pill */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-gray-900">{studentLabel}</p>
                            <p className="truncate text-xs text-gray-500">{session.exam_title || `Exam ${session.exam_id}`}</p>
                          </div>
                          <span className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${riskPillClass(session.risk_level)}`}>
                            {riskLabel}
                          </span>
                        </div>

                        {/* Risk meter + live status */}
                        <div className="mt-3 flex items-center gap-3">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200">
                            <div
                              className={`h-full rounded-full ${riskBandColor(session.risk_level)} transition-all duration-700`}
                              style={{ width: `${Math.max(4, Math.min(100, session.risk_score ?? 0))}%` }}
                            />
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${statusChip}`}>
                            {formatStatus(session.status)}
                          </span>
                        </div>

                        {/* Telemetry — wraps 2×2 on narrow, 1×4 on wide. Never scrolls sideways. */}
                        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                          <Field label="Started" value={formatDate(session.start_time)} />
                          <Field label="Duration" value={calculateDuration(session.start_time, session.end_time)} />
                          <Field label="Tab switches" value={tabsValue} valueClass={manyTabSwitches ? 'text-red-600 font-semibold' : ''} />
                          <Field label="Fullscreen" value={session.fullscreen_exit_count || 0} />
                        </dl>
                      </button>
                    );
                  })
                )}
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
          formatDate={formatDate}
          calculateDuration={calculateDuration}
          onClose={() => setSelectedSessionId(null)}
        />
      )}
    </PageWrapper>
  );
};

// Inline SVG sparkline. No chart library — matches the lib-free convention
// of this codebase. Renders the recent risk scores as a trace over three
// risk bands (low/medium/high) with dashed 40/70 threshold guides, a soft
// area fill, and the latest point emphasised with its value — so the
// invigilator reads both the band and the trend at a glance.
const Sparkline = ({ scores }) => {
  if (!scores || scores.length === 0) {
    return <p className="text-sm text-gray-400">No score history yet.</p>;
  }
  const W = 480;
  const H = 120;
  const PAD_L = 26;          // room for y-axis labels
  const PAD_R = 10;
  const PAD_Y = 10;
  const x0 = PAD_L;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_Y * 2;
  const yForScore = (s) => PAD_Y + plotH * (1 - Math.max(0, Math.min(100, s)) / 100);
  const xStep = scores.length > 1 ? plotW / (scores.length - 1) : 0;
  const xForI = (i) => x0 + i * xStep;

  const linePts = scores.map((s, i) => `${xForI(i)},${yForScore(s.risk_score)}`).join(' ');
  const areaPts = `${x0},${yForScore(0)} ${linePts} ${xForI(scores.length - 1)},${yForScore(0)}`;

  const yHigh = yForScore(70);
  const yMed  = yForScore(40);
  const last  = scores[scores.length - 1];
  const lastX = xForI(scores.length - 1);
  const lastY = yForScore(last.risk_score);
  const labelY = Math.max(12, lastY - 9);
  const bandStroke = last.risk_level === 'high' ? '#dc2626' : last.risk_level === 'medium' ? '#d97706' : '#16a34a';
  const mono = 'var(--font-mono, monospace)';
  const fmtTime = (t) => (t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Risk score trend over time">
        <defs>
          <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7A1F2E" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#7A1F2E" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Risk bands */}
        <rect x={x0} y={PAD_Y} width={plotW} height={yHigh - PAD_Y}      fill="#fee2e2" />
        <rect x={x0} y={yHigh} width={plotW} height={yMed - yHigh}        fill="#fef3c7" />
        <rect x={x0} y={yMed}  width={plotW} height={(H - PAD_Y) - yMed}  fill="#dcfce7" />

        {/* Y labels + dashed guides at the 40/70 thresholds */}
        {[100, 70, 40, 0].map((v) => (
          <g key={v}>
            {(v === 70 || v === 40) && (
              <line x1={x0} y1={yForScore(v)} x2={W - PAD_R} y2={yForScore(v)} stroke="#9ca3af" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
            )}
            <text x={x0 - 6} y={yForScore(v)} textAnchor="end" dominantBaseline="middle" fontSize="9" fill="#9ca3af" fontFamily={mono}>{v}</text>
          </g>
        ))}

        {/* Area + trace */}
        <polygon points={areaPts} fill="url(#sparkFill)" />
        <polyline className="spark-line" pathLength="1" fill="none" stroke="#7A1F2E" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={linePts} />

        {/* Points with white halo */}
        {scores.map((s, i) => (
          <circle key={s.score_id ?? i} cx={xForI(i)} cy={yForScore(s.risk_score)} r="2.5" fill="#7A1F2E" stroke="#fff" strokeWidth="1" />
        ))}

        {/* Latest point emphasised + value */}
        <circle cx={lastX} cy={lastY} r="6" fill="none" stroke={bandStroke} strokeWidth="2" opacity="0.45" />
        <circle cx={lastX} cy={lastY} r="3.5" fill={bandStroke} stroke="#fff" strokeWidth="1.5" />
        <text x={lastX - 7} y={labelY} textAnchor="end" fontSize="11" fontWeight="700" fill={bandStroke} fontFamily={mono}>{last.risk_score}</text>
      </svg>

      {/* Time range + band legend */}
      <div className="mt-2 flex items-center justify-between text-[11px] text-gray-400">
        <span className="font-mono">{fmtTime(scores[0].scored_at)}</span>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-400" />low</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" />med</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400" />high</span>
        </div>
        <span className="font-mono">{fmtTime(last.scored_at)}</span>
      </div>
    </div>
  );
};

const SessionDetailModal = ({ session, history, historyLoading, isStale, riskPillClass, formatDate, calculateDuration, onClose }) => {
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
  const tabsValue = session.total_away_seconds !== null && session.total_away_seconds !== undefined
    ? `${session.tab_switch_count || 0} · ${session.total_away_seconds}s away`
    : `${session.tab_switch_count || 0}`;
  const factorColor = session.risk_level === 'high' ? 'red' : session.risk_level === 'medium' ? 'amber' : 'gray';
  const histScores = history?.scores || [];
  const trendDelta = histScores.length >= 2
    ? histScores[histScores.length - 1].risk_score - histScores[0].risk_score
    : null;

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

        {/* Behavioural signals — the numbers behind the score (already on the session row) */}
        <div className="border-t mt-4 pt-4">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-3">Behavioural signals</div>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
            <Field label="Tab switches" value={tabsValue} />
            <Field label="Fullscreen" value={session.fullscreen_exit_count || 0} />
            <Field label="Duration" value={calculateDuration(session.start_time, session.end_time)} />
            <Field label="Started" value={formatDate(session.start_time)} />
          </dl>
        </div>

        {/* Contributing factors */}
        <div className="border-t mt-4 pt-4">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">Contributing factors</div>
          {factors.length === 0 ? (
            <p className="text-sm text-gray-400">None reported.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {factors.map((f) => (
                <Badge key={f} color={factorColor} className="capitalize">
                  <span aria-hidden="true">⚠</span>
                  {String(f).replace(/_/g, ' ')}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Sparkline */}
        <div className="border-t mt-4 pt-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-gray-500">
              Last {history?.count ?? 0} scores
            </div>
            {trendDelta != null && trendDelta !== 0 && (
              <span className={`inline-flex items-center gap-1 font-mono text-xs font-semibold ${trendDelta > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {trendDelta > 0 ? '▲' : '▼'} {trendDelta > 0 ? '+' : ''}{trendDelta}
              </span>
            )}
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
