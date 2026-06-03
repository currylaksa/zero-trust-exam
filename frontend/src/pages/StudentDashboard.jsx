import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axiosInstance from '../api/axios';
import { useAuth } from '../context/useAuth';
import RoleNavbar from '../components/RoleNavbar';
import { MetricCard, EmptyState } from '../components/ui';

// Presentational metric icons (no logic).
const mcIcon = 'h-8 w-8';
const IconStack = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={mcIcon}>
    <path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" />
  </svg>
);
const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={mcIcon}>
    <path d="M20 6L9 17l-5-5" />
  </svg>
);
const IconPlay = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={mcIcon}>
    <circle cx="12" cy="12" r="9" /><path d="M10 8l6 4-6 4V8z" />
  </svg>
);

const StudentDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [exams, setExams] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showRegulationsModal, setShowRegulationsModal] = useState(false);
  const [selectedExamId, setSelectedExamId] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [examsRes, sessionsRes] = await Promise.all([
          axiosInstance.get('/exams'),
          axiosInstance.get('/sessions/my-sessions')
        ]);

        setExams(examsRes.data);
        setSessions(sessionsRes.data);
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        setError(err.response?.data?.message || 'Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const confirmStartExam = (examId) => {
    setSelectedExamId(examId);
    setShowRegulationsModal(true);
  };

  const [starting, setStarting] = useState(false);

  const proceedToStart = async () => {
    if (!selectedExamId) return;
    setStarting(true);
    
    try {
      const response = await axiosInstance.post(`/sessions/start/${selectedExamId}`);
      setShowRegulationsModal(false);
      navigate(`/exam/${response.data.session_id}`);
    } catch (err) {
      console.error('Failed to start exam:', err);
      if (err.response?.status === 409 && err.response?.data?.session_id) {
        setShowRegulationsModal(false);
        navigate(`/exam/${err.response.data.session_id}`);
      } else {
        alert(err.response?.data?.message || 'Failed to start exam. Please try again.');
      }
    } finally {
      setStarting(false);
    }
  };

  const handleContinue = async (sessionId) => {
    try {
      const response = await axiosInstance.post(`/sessions/${sessionId}/initiate-resume`);
      if (response.data.requiresMFA) {
        localStorage.setItem('exam_resume_token', response.data.resumeToken);
        localStorage.setItem('exam_resume_session_id', sessionId);
        navigate('/resume-verify');
      } else {
        navigate(`/exam/${sessionId}`);
      }
    } catch (err) {
      console.error('Failed to initiate resume:', err);
      alert(err.response?.data?.message || 'Failed to resume exam. Please try again.');
    }
  };

  const handleViewResults = (sessionId) => {
    navigate(`/results/${sessionId}`);
  };

  const getExamStatus = (exam) => {
    if (exam.status !== 'published') return null;

    const examSessions = sessions.filter(s => s.exam_id === exam.exam_id);
    if (examSessions.length === 0) {
      return { label: 'Available', color: 'bg-green-100 text-green-800', type: 'available' };
    }

    // Priority: in_progress > completed > flagged > available
    const inProgress = examSessions.find(s => s.status === 'in_progress');
    if (inProgress) {
      return {
        label: 'In Progress',
        color: 'bg-yellow-100 text-yellow-800',
        type: 'in_progress',
        sessionId: inProgress.session_id
      };
    }

    const completed = examSessions.find(s => s.status === 'completed');
    if (completed) {
      return {
        label: 'Completed',
        color: 'bg-gray-100 text-gray-800',
        type: 'completed',
        sessionId: completed.session_id
      };
    }

    const flagged = examSessions.find(s => s.status === 'flagged');
    if (flagged) {
      return {
        label: 'Session Flagged',
        color: 'bg-red-100 text-red-800',
        type: 'flagged',
        sessionId: flagged.session_id
      };
    }

    return { label: 'Available', color: 'bg-green-100 text-green-800', type: 'available' };
  };

  const dashboardExams = exams
    .map(exam => ({
      ...exam,
      statusInfo: getExamStatus(exam)
    }))
    .filter(exam => exam.statusInfo !== null); // Only show published exams

  const totalExams = dashboardExams.length;
  const completedExams = dashboardExams.filter(e => e.statusInfo.type === 'completed').length;
  const availableExams = dashboardExams.filter(e => e.statusInfo.type === 'available').length;

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col font-sans">
      <RoleNavbar
        user={user}
        role={user?.role}
        homePath="/student/dashboard"
        links={[
          { key: 'student-regulations', label: 'Regulations', to: '/regulations' }
        ]}
        onLogout={logout}
      />

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Your Exams</h1>
          <p className="mt-1 text-sm text-gray-500">Welcome back, {user?.username || 'student'}. Here are your assigned exams.</p>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <MetricCard label="Total Exams" value={totalExams} accentColor="border-[#7A1F2E]" valueColor="text-[#7A1F2E]" icon={<IconStack />} />
          <MetricCard label="Completed" value={completedExams} accentColor="border-green-500" valueColor="text-green-600" icon={<IconCheck />} />
          <MetricCard label="Available" value={availableExams} accentColor="border-amber-500" valueColor="text-amber-600" icon={<IconPlay />} />
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
            {error}
          </div>
        )}

        {/* Exams Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {loading ? (
            // Skeletons
            [...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 shadow-md animate-pulse flex flex-col space-y-4">
                <div className="h-6 bg-gray-200 rounded w-3/4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                <div className="h-6 bg-gray-200 rounded-full w-24"></div>
                <div className="mt-auto h-10 bg-gray-200 rounded w-full"></div>
              </div>
            ))
          ) : dashboardExams.length === 0 ? (
            <div className="col-span-1 md:col-span-2">
              <EmptyState title="No exams available at this time" subtitle="Published exams assigned to you will appear here." />
            </div>
          ) : (
            dashboardExams.map((exam) => (
              <div key={exam.exam_id} className="lift bg-white rounded-xl border border-gray-200 p-6 shadow-md hover:shadow-lg flex flex-col">
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900">{exam.title}</h3>
                  <p className="text-gray-500 mt-1 mb-4 text-sm">Duration: {exam.duration} minutes</p>

                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${exam.statusInfo.color}`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                    {exam.statusInfo.label}
                  </span>
                </div>

                <div className="mt-6 pt-4 border-t border-gray-100">
                  {exam.statusInfo.type === 'available' && (
                    <button
                      onClick={() => confirmStartExam(exam.exam_id)}
                      className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#7A1F2E] hover:bg-[#601826] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#7A1F2E]"
                    >
                      Start Exam
                    </button>
                  )}
                  {exam.statusInfo.type === 'in_progress' && (
                    <button
                      onClick={() => handleContinue(exam.statusInfo.sessionId)}
                      className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-yellow-500 hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-400"
                    >
                      Continue
                    </button>
                  )}
                  {exam.statusInfo.type === 'completed' && (
                    <button
                      onClick={() => handleViewResults(exam.statusInfo.sessionId)}
                      className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                    >
                      View Results
                    </button>
                  )}
                  {exam.statusInfo.type === 'flagged' && (
                    <div>
                      <button
                        onClick={() => handleViewResults(exam.statusInfo.sessionId)}
                        className="w-full flex justify-center py-2 px-4 border border-red-300 rounded-md shadow-sm text-sm font-medium text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                      >
                        View Results
                      </button>
                      <p className="mt-2 text-xs text-red-600">
                        Your session was flagged for suspicious activity. Your lecturer has been notified.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {/* Regulations Modal */}
      {showRegulationsModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true" onClick={() => setShowRegulationsModal(false)}>
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>
            
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            
            <div className="relative inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full z-10">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 sm:mx-0 sm:h-10 sm:w-10">
                    <span className="text-xl">⚠️</span>
                  </div>
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">
                      Zero-Trust Regulations
                    </h3>
                    <div className="mt-2 text-sm text-gray-500">
                      <p className="mb-2">
                        Before starting this exam, you are reminded that all Zero-Trust regulations apply.
                      </p>
                      <Link to="/regulations" target="_blank" className="text-[#7A1F2E] hover:text-[#601826] underline">
                        View Regulations (opens in new tab)
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  onClick={proceedToStart}
                  disabled={starting}
                  className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 ${starting ? 'bg-[#7A1F2E]/60 cursor-not-allowed' : 'bg-[#7A1F2E] hover:bg-[#601826]'} text-base font-medium text-white focus:outline-none sm:ml-3 sm:w-auto sm:text-sm`}
                >
                  {starting ? 'Starting...' : 'I Understand, Start Exam'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowRegulationsModal(false)}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentDashboard;
