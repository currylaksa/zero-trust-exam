import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/useAuth';
import RoleNavbar from '../components/RoleNavbar';
import { PageWrapper, PageMain, PageHeading, MetricCard } from '../components/ui';

const GradingPanel = () => {
  const { examId } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [examTitle, setExamTitle] = useState('');

  // Expanded panel state: keep track of which session's details are visible
  const [expandedSession, setExpandedSession] = useState(null);
  const [sessionDetails, setSessionDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Scores form tracking: answer_id -> score
  const [scores, setScores] = useState({});
  const [saveStatus, setSaveStatus] = useState({});

  const fetchSubmissions = useCallback(async () => {
    try {
      const res = await api.get(`/sessions/exam/${examId}/submissions`);
      setSubmissions(res.data);
      if (res.data.length > 0) {
        setExamTitle(res.data[0].exam_title);
      }
    } catch (err) {
      setError('Failed to load submissions.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  const fullyGradedCount = submissions.filter(s => s.is_fully_graded && s.has_manual).length;
  const mcqOnlyCount = submissions.filter(s => !s.has_manual).length;
  const pendingCount = submissions.length - fullyGradedCount - mcqOnlyCount;

  const toggleExpand = async (sessionId) => {
    if (expandedSession === sessionId) {
      setExpandedSession(null);
      setSessionDetails(null);
      return;
    }
    
    setExpandedSession(sessionId);
    setDetailsLoading(true);
    setScores({});
    setSaveStatus({});
    
    try {
      const res = await api.get(`/sessions/${sessionId}/results`);
      setSessionDetails(res.data);
      
      // Init scores form
      const initialScores = {};
      res.data.questions.forEach(q => {
        if (q.question_type !== 'mcq') {
          initialScores[q.answer_id || q.question_id] = q.score || 0;
        }
      });
      setScores(initialScores);
    } catch (err) {
      console.error(err);
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleScoreChange = (id, value) => {
    setScores({ ...scores, [id]: value });
    setSaveStatus({ ...saveStatus, [id]: null });
  };

  const saveScore = async (answerId) => {
    console.log('saveScore called', {answerId, scoreVal: scores[answerId]});
    const scoreVal = scores[answerId];
    if (scoreVal === undefined || scoreVal === '') return;
    
    try {
      await api.put(`/sessions/${expandedSession}/answers/${answerId}/grade`, {
        score: Number(scoreVal)
      });
      setSaveStatus({ ...saveStatus, [answerId]: 'success' });
      
      // Refresh the list silently so counts update
      fetchSubmissions();
    } catch (err) {
      console.error(err);
      setSaveStatus({ ...saveStatus, [answerId]: 'error' });
      alert(err.response?.data?.message || 'Failed to save score');
    }
  };

  const homePath = user?.role === 'admin' ? '/admin/dashboard' : '/lecturer/dashboard';

  return (
    <PageWrapper>
      <RoleNavbar
        user={user}
        role={user?.role || 'lecturer'}
        homePath={homePath}
        links={[
          { key: 'grading-dashboard', label: 'Dashboard', to: homePath },
          { key: 'grading-monitoring', label: 'Live Monitoring', to: '/manage/monitoring' },
          { key: 'grading-audit', label: 'Audit Logs', to: '/manage/audit-logs' },
          { key: 'grading-regulations', label: 'Regulations', to: '/regulations' }
        ]}
        onLogout={logout}
      />

      <PageMain className="space-y-6">
        {loading ? (
          <div className="py-20 text-center text-gray-600">Loading submissions...</div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">{error}</div>
        ) : (
          <>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <PageHeading className="mb-0">
            Exam Submissions {examTitle ? `- ${examTitle}` : ''}
          </PageHeading>
          <button
            onClick={() => navigate(homePath)}
            className="text-gray-600 hover:text-gray-900 border border-gray-300 rounded px-4 py-2 text-sm font-medium"
          >
            Back to Dashboard
          </button>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <MetricCard label="Total Submissions" value={submissions.length} accentColor="border-gray-400" />
          <MetricCard label="Fully Graded" value={fullyGradedCount + mcqOnlyCount} accentColor="border-green-500" valueColor="text-green-700" />
          <MetricCard label="Pending Grading" value={pendingCount} accentColor="border-yellow-500" valueColor="text-yellow-700" />
        </div>

        {/* Table */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Matric No.</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Submitted</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {submissions.map((sub) => (
                <React.Fragment key={sub.session_id}>
                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {sub.username}
                      <p className="text-xs text-gray-500 font-normal">{sub.email}</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{sub.student_matric || 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(sub.start_time).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                      {sub.earned_marks} / {sub.total_marks}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {!sub.has_manual ? (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                          MCQ Only
                        </span>
                      ) : sub.is_fully_graded ? (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          Fully Graded
                        </span>
                      ) : (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => toggleExpand(sub.session_id)}
                        className="text-[#7A1F2E] hover:text-[#601826] border border-[#7A1F2E] rounded px-3 py-1"
                      >
                        {expandedSession === sub.session_id ? 'Close' : 'Grade'}
                      </button>
                    </td>
                  </tr>
                  
                  {/* Expanded Row */}
                  {expandedSession === sub.session_id && (
                    <tr>
                      <td colSpan="6" className="px-6 py-6 bg-gray-50 border-b border-gray-200">
                        {detailsLoading ? (
                          <p className="text-center text-gray-500 text-sm">Loading answers...</p>
                        ) : sessionDetails ? (
                          <div className="space-y-6 max-w-4xl mx-auto">
                            {sessionDetails.questions.map((q, i) => (
                              <div key={q.question_id} className="bg-white p-4 rounded border border-gray-200 shadow-sm">
                                <h4 className="font-medium text-gray-800 mb-2">
                                  {i + 1}. {q.question_text}
                                </h4>
                                
                                {q.question_type === 'mcq' ? (
                                  <div className="text-sm text-gray-600 space-y-1 bg-gray-50 p-3 rounded">
                                    <p><span className="font-semibold">Correct Answer:</span> {q.correct_answer}</p>
                                    <p><span className="font-semibold">Student Answer:</span> <span className={q.is_correct ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>{q.student_answer || 'No Answer'}</span></p>
                                    <p><span className="font-semibold">Score:</span> {q.score !== null && q.score !== undefined ? q.score : 0} / {q.marks}</p>
                                  </div>
                                ) : (
                                  <div className="space-y-3">
                                    <div>
                                      <p className="text-xs font-semibold text-gray-500 uppercase">Student's Answer</p>
                                      <textarea
                                        readOnly
                                        disabled
                                        className="mt-1 w-full p-3 bg-gray-100 border border-gray-300 rounded text-sm text-gray-800 min-h-[100px]"
                                        value={q.student_answer || 'No answer provided.'}
                                      />
                                    </div>
                                    <div className="flex items-center space-x-4 bg-blue-50 p-3 rounded border border-blue-100">
                                      <div className="flex flex-col">
                                        <label className="text-xs font-semibold text-blue-800 uppercase">Marks Available: {q.marks}</label>
                                        <div className="flex items-center mt-1">
                                          <input
                                            type="number"
                                            min="0"
                                            max={q.marks}
                                            value={scores[q.answer_id || q.question_id] !== undefined ? scores[q.answer_id || q.question_id] : ''}
                                            onChange={(e) => handleScoreChange(q.answer_id || q.question_id, e.target.value)}
                                            className="w-20 p-2 border border-blue-300 rounded shadow-sm text-sm focus:ring-[#7A1F2E] focus:border-[#7A1F2E]"
                                            placeholder="Score"
                                            disabled={q.is_nullified}
                                          />
                                          <span className="ml-2 text-sm text-gray-600">/ {q.marks}</span>
                                        </div>
                                      </div>
                                      <div className="pt-4 flex items-center space-x-3">
                                        {!q.is_nullified && (
                                          <button
                                            onClick={() => saveScore(q.answer_id, q.marks)}
                                            disabled={!q.answer_id} // can't grade if they didn't even submit a row
                                            className={`px-4 py-2 text-sm font-medium text-white rounded bg-[#7A1F2E] hover:bg-[#601826] ${!q.answer_id ? 'opacity-50 cursor-not-allowed' : ''}`}
                                          >
                                            Save Score
                                          </button>
                                        )}
                                        
                                        {saveStatus[q.answer_id] === 'success' && (
                                          <span className="text-green-600 flex items-center space-x-1 text-sm font-medium">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                            <span>Saved!</span>
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )}
                                {q.is_nullified && (
                                  <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start">
                                    <span className="text-xl mr-2">⚠️</span>
                                    <div>
                                      <p className="text-sm text-yellow-800 font-bold">Score Nullified</p>
                                      <p className="text-sm text-yellow-700">This answer was submitted after suspicious session activity was detected. Marks cannot be assigned.</p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-center text-red-500 text-sm">Failed to load details.</p>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              
              {submissions.length === 0 && (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                    No submissions found for this exam yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
          </>
        )}
      </PageMain>
    </PageWrapper>
  );
};

export default GradingPanel;