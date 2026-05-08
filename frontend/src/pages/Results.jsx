import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API from '../api/axios';
import { useAuth } from '../context/useAuth';
import RoleNavbar from '../components/RoleNavbar';

/**
 * Results Page
 * Student views their exam results
 */
const Results = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchResults = async () => {
      try {
        setLoading(true);
        const response = await API.get(`/sessions/${sessionId}/results`);
        setData(response.data);
      } catch (err) {
        console.error('Failed to fetch results:', err);
        setError(err.response?.data?.message || 'Failed to load exam results.');
      } finally {
        setLoading(false);
      }
    };
    
    if (sessionId) fetchResults();
  }, [sessionId]);

  const calculateTimeTaken = (start, end) => {
    if (!start || !end) return 'Unknown';
    const startTime = new Date(start);
    const endTime = new Date(end);
    const diffMs = endTime - startTime;
    const diffMins = Math.floor(diffMs / 60000);
    const diffSecs = Math.floor((diffMs % 60000) / 1000);
    return `${diffMins} minutes and ${diffSecs} seconds`;
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#7A1F2E]"></div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-md shadow-sm">
          <h3 className="font-bold mb-2">Error</h3>
          <p>{error}</p>
          <button 
            onClick={() => navigate('/dashboard')}
            className="mt-4 px-4 py-2 bg-red-100 text-red-800 rounded hover:bg-red-200 font-medium transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      );
    }

    if (!data) return null;

    const { session, stats, questions } = data;
    
    const timeTaken = calculateTimeTaken(session.start_time, session.end_time);

    return (
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        {/* Summary Details */}
        <div className="p-6 md:p-8 bg-gray-50 border-b border-gray-200 flex flex-col space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{session.title}</h2>
              <p className="text-gray-500 mt-1">Status: <span className="capitalize font-medium text-gray-700">{session.status.replace('_', ' ')}</span></p>
            </div>
            
            {session.status === 'completed' && (
              <div className="bg-green-100 text-green-800 px-4 py-2 rounded-md font-semibold text-sm flex items-center shadow-sm">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                Exam Submitted Successfully
              </div>
            )}
            
            {session.status === 'flagged' && (
              <div className="bg-yellow-100 text-yellow-800 px-4 py-2 rounded-md font-semibold text-sm flex items-center shadow-sm">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                Session Flagged for Review
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-4 rounded-md border border-gray-200 shadow-sm flex flex-col justify-center">
              <p className="text-sm border-b pb-2 mb-2 font-medium uppercase tracking-wide">
                {stats.is_fully_graded ? (
                   <span className="text-gray-900">Your Score</span>
                ) : (
                   <span className="text-gray-500">Provisional Score</span>
                )}
              </p>
              <div className="mt-2 flex items-baseline">
                {stats.is_fully_graded ? (
                   <>
                     {(() => {
                       const pct = stats.total_marks > 0
                         ? Math.round((stats.earned_marks / stats.total_marks) * 100)
                         : 0;
                       const colorCls = stats.total_marks > 0
                         ? (pct >= 50 ? 'text-green-600' : 'text-red-600')
                         : 'text-gray-600';
                       return (
                         <>
                           <span className={`text-3xl font-bold ${colorCls}`}>{stats.earned_marks}</span>
                           <span className="text-gray-500 ml-1 text-lg">/ {stats.total_marks} ({pct}%)</span>
                         </>
                       );
                     })()}
                   </>
                ) : (
                   <>
                     <span className="text-3xl font-bold text-[#7A1F2E]">{stats.earned_marks}</span>
                     <span className="text-gray-500 ml-1 text-lg">/ {stats.total_marks}</span>
                   </>
                )}
              </div>
            </div>
            
            <div className="bg-white p-4 rounded-md border border-gray-200 shadow-sm flex flex-col justify-center">
              <p className="text-sm text-gray-500 font-medium uppercase tracking-wide">Questions Answered</p>
              <div className="mt-2 flex items-baseline">
                <span className="text-3xl font-bold text-gray-900">{stats.answered_count}</span>
                <span className="text-gray-500 ml-1 text-lg">/ {stats.total_questions}</span>
              </div>
            </div>
            
            <div className="bg-white p-4 rounded-md border border-gray-200 shadow-sm flex flex-col justify-center">
              <p className="text-sm text-gray-500 font-medium uppercase tracking-wide">Time Taken</p>
              <p className="mt-2 text-xl font-semibold text-gray-800">{timeTaken}</p>
            </div>
          </div>

          {!stats.is_fully_graded && (
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-md text-sm text-yellow-800 flex items-start">
              <svg className="w-5 h-5 text-yellow-500 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              <p>
                <strong>Note:</strong> This score is provisional. Essay and short answer questions are pending manual review by your lecturer. Your final score will be updated after grading is complete.
              </p>
            </div>
          )}

          {session.flagged_activity_count > 0 && (
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-md">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-yellow-800 font-medium">
                    {session.flagged_activity_count} suspicious activities were detected during your session.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Questions Review */}
        <div className="p-6 md:p-8">
          <h3 className="text-xl font-bold text-gray-900 mb-6 border-b pb-2">Questions Review</h3>
          
          <div className="space-y-8">
            {questions.map((q, idx) => (
              <div key={q.question_id} className="bg-white border rounded-lg shadow-sm overflow-hidden">
                <div className="bg-gray-50 px-6 py-4 border-b flex justify-between items-center">
                  <div className="flex items-center space-x-4">
                    <span className="font-semibold text-gray-700">Question {idx + 1}</span>
                    <span className="text-xs uppercase font-bold tracking-wider text-gray-500 px-2 py-1 bg-gray-200 rounded">
                      {q.question_type.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="font-medium text-sm">
                    {q.is_nullified ? (
                      <span className="text-yellow-600">0 / {q.marks} marks</span>
                    ) : q.score !== null && q.score !== undefined ? (
                      <span className="text-gray-700">{q.score} / {q.marks} marks</span>
                    ) : (
                      <span className="text-yellow-600">Pending / {q.marks} marks</span>
                    )}
                  </div>
                </div>
                
                <div className="p-6">
                  <p className="text-lg text-gray-900 whitespace-pre-wrap mb-6 font-medium bg-gray-50 p-4 rounded">
                    {q.question_text}
                  </p>

                  {!q.is_answered ? (
                    <div className="mt-4 p-4 bg-gray-100 rounded-md border border-gray-200">
                      <p className="text-gray-500 italic flex items-center">
                        <svg className="w-5 h-5 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        Not answered
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 space-y-4">
                      {q.question_type === 'MCQ' || q.question_type === 'mcq' ? (
                        <div className="space-y-3">
                          <p className="text-sm font-semibold text-gray-500 uppercase mb-2">Options:</p>
                          {q.options.map((opt, optIdx) => {
                            const isSelected = String(q.student_answer) === String(opt);
                            const isCorrectAnswer = String(q.correct_answer) === String(opt);
                            
                            let optionClass = 'border-gray-200 bg-white';
                            let icon = null;
                            
                            if (isSelected && isCorrectAnswer) {
                              optionClass = 'border-green-500 bg-green-50 ring-1 ring-green-500';
                              icon = <svg className="w-5 h-5 text-green-600 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>;
                            } else if (isSelected && !isCorrectAnswer) {
                              optionClass = 'border-red-500 bg-red-50 ring-1 ring-red-500';
                              icon = <svg className="w-5 h-5 text-red-600 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>;
                            } else if (!isSelected && isCorrectAnswer) {
                              optionClass = 'border-green-500 bg-white border-dashed border-2';
                              icon = <span className="text-sm text-green-600 font-medium ml-auto">Correct Answer</span>;
                            }

                            return (
                              <div key={optIdx} className={`p-4 border rounded-lg flex items-center ${optionClass}`}>
                                <div className={`w-4 h-4 rounded-full border flex items-center justify-center mr-3 
                                  ${isSelected 
                                    ? (isCorrectAnswer ? 'border-green-500 bg-green-500' : 'border-red-500 bg-red-500') 
                                    : 'border-gray-300'}`}>
                                </div>
                                <span className={`${isSelected ? 'font-medium text-gray-900' : 'text-gray-700'}`}>{opt}</span>
                                {icon}
                              </div>
                            );
                          })}
                          
                          {q.is_nullified ? (
                            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start">
                              <span className="text-xl mr-2">⚠️</span>
                              <div>
                                <p className="text-sm text-yellow-800 font-bold">Score Nullified</p>
                                <p className="text-sm text-yellow-700">This answer was submitted after suspicious session activity was detected. No marks awarded.</p>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                            <p className="text-sm text-gray-500 mb-2 font-medium">Your Answer:</p>
                            <p className="text-gray-900 whitespace-pre-wrap">{q.student_answer || 'No answer provided'}</p>
                          </div>
                          
                          {q.is_nullified ? (
                            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start">
                              <span className="text-xl mr-2">⚠️</span>
                              <div>
                                <p className="text-sm text-yellow-800 font-bold">Score Nullified</p>
                                <p className="text-sm text-yellow-700">This answer was submitted after suspicious session activity was detected. Marks cannot be assigned.</p>
                              </div>
                            </div>
                          ) : q.score !== null && q.score !== undefined ? (
                            <div className="flex items-start p-4 bg-green-50 border border-green-200 rounded-lg">
                              <svg className="w-5 h-5 text-green-500 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                              <div>
                                <p className="text-sm text-green-800 font-bold">Graded</p>
                                <p className="text-sm text-green-700">Marks awarded: {q.score} / {q.marks}</p>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start p-4 bg-blue-50 border border-blue-100 rounded-lg">
                              <svg className="w-5 h-5 text-blue-500 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                              <p className="text-sm text-blue-800">
                                Pending manual review by lecturer. This question is not included in the auto-graded score.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 flex justify-center">
            <button
              onClick={() => navigate('/dashboard')}
              className="px-8 py-3 bg-[#7A1F2E] text-white font-medium rounded-md shadow-sm hover:bg-[#601826] transition-colors focus:ring-2 focus:ring-offset-2 focus:ring-[#7A1F2E]"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col font-sans text-gray-900">
      <RoleNavbar
        user={user}
        role={user?.role || 'student'}
        homePath="/student/dashboard"
        links={[
          { key: 'results-dashboard', label: 'Dashboard', to: '/student/dashboard' },
          { key: 'results-regulations', label: 'Regulations', to: '/regulations' }
        ]}
        onLogout={logout}
      />

      {/* Main Content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {renderContent()}
      </main>
    </div>
  );
};

export default Results;
