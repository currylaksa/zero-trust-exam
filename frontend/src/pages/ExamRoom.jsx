import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API from '../api/axios';

/**
 * Exam Room Page
 * Student takes exam during exam session with zero-trust features
 */
const ExamRoom = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  // State
  const [sessionData, setSessionData] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState({ minutes: 0, seconds: 0 });
  const [warning, setWarning] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  // Refs for timers and intervals
  const heartbeatInteralRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const tabHiddenAt = useRef(null);
  const lastFullscreenExitAt = useRef(0);

  // Initial Data Load
  useEffect(() => {
    let isMounted = true;
    const loadExam = async () => {
      try {
        setLoading(true);
        // GET /api/sessions/:sessionId/questions
        const response = await API.get(`/sessions/${sessionId}/questions`);
        if (isMounted) {
          setSessionData(response.data.session || { duration: 60 }); 
          setQuestions(response.data.questions || []);
          
          // Optionally preload existing answers if available
          const initialAnswers = {};
          if (response.data.answers) {
            response.data.answers.forEach(a => {
              initialAnswers[a.question_id] = a.answer_text;
            });
          }
          setAnswers(initialAnswers);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          console.error("Failed to load exam", err);
          navigate('/dashboard');
        }
      }
    };
    loadExam();
    return () => { isMounted = false; };
  }, [sessionId, navigate]);

  // Re-enter fullscreen. MUST be called from a user gesture (click/keypress) —
  // the browser rejects requestFullscreen() outside transient user activation,
  // which is why a timer-based "auto-restore" silently fails.
  const enterFullScreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch (e) {
      console.warn("Fullscreen request failed", e);
    }
  }, []);

  // Effect 1: Fullscreen Enforcer
  useEffect(() => {
    // Request on mount (works only if arriving via a user gesture).
    enterFullScreen();

    const handleFullscreenChange = async () => {
      if (!document.fullscreenElement) {
        lastFullscreenExitAt.current = Date.now();
        // Persistent warning — stays until the student clicks to re-enter.
        setWarning('Warning: Fullscreen exit detected and logged');
        try {
          await API.post(`/sessions/${sessionId}/log`, {
            activity_type: 'FULLSCREEN_EXIT',
            description: 'User exited fullscreen'
          });
        } catch { console.error('Failed to log fullscreen exit'); }
      } else {
        // Back in fullscreen — clear the fullscreen warning if it's showing.
        setWarning(w => (w.includes('Fullscreen') ? '' : w));
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, [sessionId, enterFullScreen]);

  // Effect 2: Tab visibility
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.hidden) {
        tabHiddenAt.current = Date.now();
      } else {
        if (tabHiddenAt.current !== null) {
          const now = Date.now();
          const duration_away_seconds = Math.round((now - tabHiddenAt.current) / 1000);
          tabHiddenAt.current = null;

          const isLikelyFullscreenVisibilityJitter =
            duration_away_seconds === 0 && (now - lastFullscreenExitAt.current) <= 2000;
          if (isLikelyFullscreenVisibilityJitter) {
            return;
          }

          try {
            await API.post(`/sessions/${sessionId}/log`, {
              activity_type: 'TAB_SWITCH',
              description: 'Student switched tab',
              duration_away_seconds: duration_away_seconds
            });
          } catch { console.error('Failed to log tab switch'); }

          setWarning(`Warning: Tab switch detected. You were away for ${duration_away_seconds} seconds. This has been logged.`);
          setTimeout(() => { setWarning(''); }, 5000);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [sessionId]);

  // Effect 3: Prevent copy/paste/right-click
  useEffect(() => {
    const preventDefaultAction = (e) => e.preventDefault();
    document.addEventListener('contextmenu', preventDefaultAction);
    document.addEventListener('copy', preventDefaultAction);
    document.addEventListener('paste', preventDefaultAction);
    document.addEventListener('cut', preventDefaultAction);
    return () => {
      document.removeEventListener('contextmenu', preventDefaultAction);
      document.removeEventListener('copy', preventDefaultAction);
      document.removeEventListener('paste', preventDefaultAction);
      document.removeEventListener('cut', preventDefaultAction);
    };
  }, []);

  // Effect 4: Heartbeat
  useEffect(() => {
    const heartbeat = async () => {
      try {
        const response = await API.post(`/sessions/${sessionId}/heartbeat`);
        if (response.data && response.data.token) {
          localStorage.setItem('exam_token', response.data.token);
        }
      } catch (err) {
        if (err.response && (err.response.status === 401 || err.response.status === 403)) {
          navigate('/login', { state: { message: "Your session has expired. Please log in again." } });
        }
      }
    };
    // Initial call
    heartbeat();
    heartbeatInteralRef.current = setInterval(heartbeat, 60000);
    return () => { clearInterval(heartbeatInteralRef.current); };
  }, [sessionId, navigate]);

  // Logic to Submit Exam
  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await API.post(`/sessions/${sessionId}/submit`);
      navigate(`/results/${sessionId}`);
    } catch (err) {
      console.error('Failed to submit exam', err);
      const serverMsg = err.response?.data?.message || err.response?.data?.error;
      alert(serverMsg ? `Error submitting exam: ${serverMsg}` : 'Error submitting exam. Please try again.');
      setSubmitting(false);
      setShowSubmitModal(false);
    }
  }, [sessionId, navigate, submitting]);

  // Effect 5: Timer
  useEffect(() => {
    if (!sessionData || !sessionData.start_time || !sessionData.duration) return;

    const startTime = new Date(sessionData.start_time).getTime();
    const durationMs = sessionData.duration * 60 * 1000;
    const endTime = startTime + durationMs;

    const updateTimer = () => {
      const now = Date.now();
      const remainMs = endTime - now;

      if (remainMs <= 0) {
        setTimeLeft({ minutes: 0, seconds: 0 });
        clearInterval(timerIntervalRef.current);
        handleSubmit(); // Auto submit
      } else {
        const totalSeconds = Math.floor(remainMs / 1000);
        setTimeLeft({
          minutes: Math.floor(totalSeconds / 60),
          seconds: totalSeconds % 60
        });
      }
    };

    updateTimer(); // Initial call
    timerIntervalRef.current = setInterval(updateTimer, 1000);

    return () => { clearInterval(timerIntervalRef.current); };
  }, [sessionData, handleSubmit]);

  const saveAnswer = async (questionId, answerText) => {
    try {
      await API.post(`/sessions/${sessionId}/answer`, {
        question_id: questionId,
        answer_text: String(answerText)
      });
    } catch (err) {
      console.error('Failed to auto-save answer', err);
    }
  };

  const handleAnswerChange = (questionId, value) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      saveAnswer(questionId, value);
    }, 500);
  };

  // Clear any pending auto-save debounce on unmount so a trailing saveAnswer
  // does not fire after the component is gone (e.g. timer-driven auto-submit
  // mid-typing). Cleanup-only effect — no other deps needed.
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-50">
        <p className="text-xl text-gray-600">Loading Exam Environment...</p>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-50">
        <div className="text-center bg-white p-8 rounded-lg shadow-md">
          <p className="text-xl text-gray-800 mb-4">No questions found for this exam.</p>
          <button 
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 bg-[#7A1F2E] text-white rounded hover:bg-[#601826]"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const answeredCount = Object.keys(answers).filter(k => answers[k] !== undefined && answers[k] !== '').length;
  const isTimeLow = timeLeft.minutes < 5;

  // ── Zero-trust warning presentation ──
  // Purely derived from the existing `warning` string set by the detection
  // effects above. No new state, no logic — just how the warning is displayed.
  const isFullscreenWarn = warning.includes('Fullscreen');
  const awayMatch = warning.match(/(\d+)\s*seconds/);
  const warnTitle = isFullscreenWarn ? 'Fullscreen exited' : 'Tab switch detected';
  const warnSubtitle = isFullscreenWarn
    ? 'Proctored mode requires fullscreen. Click below to return.'
    : (awayMatch ? `You were away for ${awayMatch[1]} seconds.` : 'You left the exam tab.');
  const warnDurationMs = isFullscreenWarn ? 0 : 5000;   // tab-switch toast auto-dismisses; fullscreen stays
  const warnTheme = isFullscreenWarn
    ? { border: 'border-red-500', icon: 'text-red-600', title: 'text-red-800', bar: 'bg-red-500' }
    : { border: 'border-amber-500', icon: 'text-amber-600', title: 'text-amber-900', bar: 'bg-amber-500' };

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-stone-50 font-sans text-gray-900">
      {/* Top Bar */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-[#7A1F2E] border-b border-[#601826] z-50 flex items-center justify-between px-6 shadow-sm">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-bold text-white truncate max-w-xs">{sessionData?.title || 'Exam Session'}</h1>
        </div>

        {/* Warning moved out of the header into the center-top toast below. */}

        <div className="flex items-center space-x-6">
          <div className={`text-xl font-mono font-bold ${isTimeLow ? 'text-red-600' : 'text-white'}`}>
            {String(timeLeft.minutes).padStart(2, '0')}:{String(timeLeft.seconds).padStart(2, '0')}
          </div>
          <button
            onClick={() => setShowSubmitModal(true)}
            disabled={submitting}
            className="px-5 py-2 bg-white text-[#7A1F2E] font-semibold rounded-md hover:bg-gray-100 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Submit Exam
          </button>
        </div>
      </header>

      {/* Zero-trust warning toast (center-top). Presentation only — driven by
          the existing `warning` string. key={warning} remounts it so the
          slide-in + progress bar replay on each new violation. */}
      {warning && (
        <div key={warning} className="fixed left-1/2 top-20 z-[60] w-[min(92vw,440px)] -translate-x-1/2">
          <div
            className={`exam-warn-toast overflow-hidden rounded-xl border-l-4 bg-white shadow-2xl ring-1 ring-black/5 ${warnTheme.border}`}
            role="alert"
            aria-live="assertive"
          >
            <div className="flex items-start gap-3 p-4">
              <div className={`mt-0.5 shrink-0 ${warnTheme.icon}`}>
                {isFullscreenWarn ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                    <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                    <path d="M3 3l18 18M10.6 5.1A9.8 9.8 0 0 1 12 5c5 0 9 4.5 9 7a12 12 0 0 1-2.2 3.2M6.6 6.6A12 12 0 0 0 3 12c0 2.5 4 7 9 7a9.5 9.5 0 0 0 4-.9M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                  </svg>
                )}
              </div>
              <div className="min-w-0">
                <p className={`font-semibold ${warnTheme.title}`}>{warnTitle}</p>
                <p className="text-sm text-gray-600">{warnSubtitle}</p>
                <p className="mt-0.5 text-xs text-gray-400">This action has been logged.</p>
                {isFullscreenWarn && (
                  <button
                    onClick={enterFullScreen}
                    className="mt-2 rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700"
                  >
                    Return to fullscreen
                  </button>
                )}
              </div>
            </div>
            {warnDurationMs > 0 && (
              <div className="h-1 w-full bg-gray-100">
                <div className={`exam-warn-bar h-full ${warnTheme.bar}`} style={{ animationDuration: `${warnDurationMs}ms` }} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content Areas */}
      <div className="flex-1 mt-16 flex flex-row overflow-hidden">
        {/* Left Sidebar - Question Grid */}
        <aside className="w-64 bg-white border-r border-gray-200 overflow-y-auto flex flex-col shadow-inner">
          <div className="p-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Questions</h2>
          </div>
          <div className="p-4 grid grid-cols-4 gap-2">
            {questions.map((q, idx) => {
              const isAnswered = !!answers[q.question_id];
              const isCurrent = idx === currentIndex;
              return (
                <button
                  key={q.question_id}
                  onClick={() => setCurrentIndex(idx)}
                  className={`
                    w-10 h-10 rounded-md flex items-center justify-center text-sm font-medium
                    ${isAnswered ? 'bg-green-100 text-green-800' : 'bg-white text-gray-600'}
                    border border-gray-200
                    ${isCurrent ? 'ring-2 ring-[#7A1F2E]' : ''}
                  `}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Main Panel - Question Content */}
        <main className="flex-1 overflow-y-auto bg-stone-50 p-8 flex flex-col">
          <div className="mb-4">
            <span className="text-sm font-semibold text-gray-500 uppercase">
              Question {currentIndex + 1} of {questions.length}
            </span>
          </div>
          
          <h3 className="text-xl font-medium text-gray-900 mb-6 whitespace-pre-wrap">
            {currentQuestion.question_text}
          </h3>

          <div className="space-y-4 max-w-3xl">
            {currentQuestion.question_type === 'mcq' && currentQuestion.options && (
              <div className="flex flex-col space-y-3">
                {(Array.isArray(currentQuestion.options) ? currentQuestion.options : JSON.parse(currentQuestion.options || '[]')).map((opt, optIdx) => (
                  <div
                    key={optIdx}
                    onClick={() => handleAnswerChange(currentQuestion.question_id, opt)}
                    className={`
                      p-4 border rounded-lg cursor-pointer flex items-center
                      ${answers[currentQuestion.question_id] === opt
                        ? 'border-[#7A1F2E] bg-[#FFF5F5] ring-1 ring-[#7A1F2E]'
                        : 'border-gray-300 bg-white'}
                    `}
                  >
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center mr-3 
                      ${answers[currentQuestion.question_id] === opt ? 'border-[#7A1F2E] bg-[#7A1F2E]' : 'border-gray-400'}`}>
                    </div>
                    <span className="text-base">{opt}</span>
                  </div>
                ))}
              </div>
            )}

            {currentQuestion.question_type === 'short_answer' && (
              <textarea
                rows={4}
                className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#7A1F2E] focus:border-[#7A1F2E] resize-none bg-white"
                placeholder="Type your short answer here..."
                value={answers[currentQuestion.question_id] || ''}
                onChange={(e) => handleAnswerChange(currentQuestion.question_id, e.target.value)}
              />
            )}

            {currentQuestion.question_type === 'essay' && (
              <textarea
                rows={8}
                className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#7A1F2E] focus:border-[#7A1F2E] bg-white"
                placeholder="Type your essay answer here..."
                value={answers[currentQuestion.question_id] || ''}
                onChange={(e) => handleAnswerChange(currentQuestion.question_id, e.target.value)}
              />
            )}
          </div>

          <div className="mt-8 flex justify-between items-center max-w-3xl">
            <button
              onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
              disabled={currentIndex === 0}
              className="px-6 py-2 border border-gray-800 text-gray-800 font-medium rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            {currentIndex === questions.length - 1 ? (
              <button
                onClick={() => setShowSubmitModal(true)}
                className="px-6 py-2 bg-green-600 text-white font-medium rounded hover:bg-green-700"
              >
                Submit Exam
              </button>
            ) : (
              <button
                onClick={() => setCurrentIndex(prev => Math.min(questions.length - 1, prev + 1))}
                className="px-6 py-2 bg-[#7A1F2E] text-white font-medium rounded hover:bg-[#601826]"
              >
                Next
              </button>
            )}
          </div>
        </main>
      </div>

      {/* Submit Confirmation Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex flex-col items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Submit Exam?</h2>
            
            <p className="text-gray-700 mb-4">
              You have answered {answeredCount} of {questions.length} questions. 
              You cannot return to the exam after submitting.
            </p>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowSubmitModal(false)}
                disabled={submitting}
                className="px-4 py-2 border border-gray-800 rounded text-gray-800 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Confirm Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExamRoom;
