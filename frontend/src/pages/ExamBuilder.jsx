import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/useAuth';
import RoleNavbar from '../components/RoleNavbar';
import { PageWrapper, PageMain, PageHeading, ErrorAlert, SuccessAlert } from '../components/ui';

const formatToLocalDatetime = (dateString) => {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

function ExamBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const isNew = !id || id === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  // Exam Details
  const [exam, setExam] = useState({
    title: '',
    description: '',
    duration: '',
    start_time: '',
    end_time: '',
    status: 'draft',
    course_id: ''
  });

  // Courses
  const [availableCourses, setAvailableCourses] = useState([]);

  // Questions
  const [questions, setQuestions] = useState([]);
  
  // New Question Form
  const [qForm, setQForm] = useState({
    question_text: '',
    question_type: 'mcq', // MCQ, Short Answer, Essay
    marks: 1,
    options: { A: '', B: '', C: '', D: '' },
    correct_answer: 'A' // A, B, C, D
  });

  const fetchCourses = useCallback(async () => {
    try {
      const res = await api.get('/courses');
      setAvailableCourses(res.data);
    } catch (err) {
      console.error('Failed to fetch courses:', err);
    }
  }, []);

  const fetchExamData = useCallback(async () => {
    setLoading(true);
    try {
      const [examRes, questionsRes] = await Promise.all([
        api.get(`/exams/${id}`),
        api.get(`/exams/${id}/questions`)
      ]);

      const eData = examRes.data;
      setExam({
        title: eData.title || '',
        description: eData.description || '',
        duration: eData.duration || '',
        start_time: formatToLocalDatetime(eData.start_time),
        end_time: formatToLocalDatetime(eData.end_time),
        status: eData.status || 'draft',
        course_id: eData.course_id || ''
      });
      setQuestions(questionsRes.data || []);
      setError('');
    } catch (err) {
      console.error(err);
      setError('Failed to load exam data.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchCourses();
    if (!isNew) {
      fetchExamData();
    }
  }, [fetchCourses, fetchExamData, isNew]);

  const handleSaveExam = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const payload = {
        title: exam.title,
        description: exam.description,
        duration: Number(exam.duration),
        status: exam.status,
        course_id: exam.course_id || null,
        start_time: exam.start_time ? new Date(exam.start_time).toISOString() : null,
        end_time: exam.end_time ? new Date(exam.end_time).toISOString() : null
      };

      if (isNew) {
        const res = await api.post('/exams', payload);
        setSuccess('Exam created successfully!');
        if (res.data && res.data.exam_id) {
          setTimeout(() => navigate(`/manage/exams/${res.data.exam_id}`), 1000);
        }
      } else {
        await api.put(`/exams/${id}`, payload);
        setSuccess('Exam updated successfully!');
        setTimeout(() => setSuccess(''), 3000);
      }
      setError('');
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to save exam.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddQuestion = async (e) => {
    e.preventDefault();
    if (isNew) {
      setError('Please save the exam first before adding questions.');
      return;
    }

    try {
      const payload = {
        question_text: qForm.question_text,
        question_type: qForm.question_type,
        marks: Number(qForm.marks) || 1,
        options: null,
        correct_answer: null
      };

      if (qForm.question_type === 'mcq') {
        payload.options = [qForm.options.A, qForm.options.B, qForm.options.C, qForm.options.D];
        payload.correct_answer = qForm.correct_answer;
      }

      await api.post(`/exams/${id}/questions`, payload);
      setQForm({
        question_text: '',
        question_type: 'mcq',
        marks: 1,
        options: { A: '', B: '', C: '', D: '' },
        correct_answer: 'A'
      });
      fetchExamData();
      setSuccess('Question added successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to add question.');
    }
  };

  const handleDeleteQuestion = async (qId) => {
    if (!window.confirm('Are you sure you want to delete this question?')) return;
    try {
      await api.delete(`/exams/questions/${qId}`);
      setQuestions(questions.filter(q => q.question_id !== qId));
    } catch (err) {
      console.error(err);
      alert('Failed to delete question.');
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
          { key: 'builder-dashboard', label: 'Dashboard', to: homePath },
          { key: 'builder-monitoring', label: 'Live Monitoring', to: '/manage/monitoring' },
          { key: 'builder-audit', label: 'Audit Logs', to: '/manage/audit-logs' },
          { key: 'builder-regulations', label: 'Regulations', to: '/regulations' }
        ]}
        onLogout={logout}
      />

      <PageMain>
        {loading ? (
          <div className="py-20 text-center text-gray-500">Loading...</div>
        ) : (
          <>
        <div className="mb-6 flex items-center justify-between">
          <PageHeading className="mb-0">
            {isNew ? 'Create Exam' : 'Edit Exam'}
          </PageHeading>
          <button
            onClick={() => navigate(homePath)}
            className="text-gray-600 hover:text-gray-900 font-medium"
          >
            Back to Dashboard
          </button>
        </div>

        <ErrorAlert message={error} className="mb-4" />
        <SuccessAlert message={success} className="mb-4" />

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left Column: Exam Settings */}
          <div className="lg:w-1/3 space-y-6">
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Exam Settings</h2>
              <form onSubmit={handleSaveExam} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Title <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={exam.title}
                    onChange={(e) => setExam({...exam, title: e.target.value})}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-[#7A1F2E] focus:border-[#7A1F2E] bg-white"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Description</label>
                  <textarea
                    rows={3}
                    value={exam.description}
                    onChange={(e) => setExam({...exam, description: e.target.value})}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-[#7A1F2E] focus:border-[#7A1F2E] bg-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Course</label>
                  <select
                    value={exam.course_id}
                    onChange={(e) => setExam({...exam, course_id: e.target.value})}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-[#7A1F2E] focus:border-[#7A1F2E] bg-white"
                  >
                    <option value="">-- No Course (Open to all or unassigned) --</option>
                    {availableCourses.map(c => (
                      <option key={c.course_id} value={c.course_id}>
                        {c.course_code} - {c.course_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bg-[#FFF1F2] p-4 rounded-md space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[#601826]">Start Time (Exam Window Opens)</label>
                    <input
                      type="datetime-local"
                      value={exam.start_time}
                      onChange={(e) => setExam({...exam, start_time: e.target.value})}
                      className="mt-1 block w-full border border-[#7A1F2E]/30 rounded-md shadow-sm p-2 focus:ring-[#7A1F2E] focus:border-[#7A1F2E] bg-white"
                    />
                    <p className="mt-1 text-xs text-[#7A1F2E]/80">When students can begin taking the exam.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#601826]">End Time (Exam Window Closes)</label>
                    <input
                      type="datetime-local"
                      value={exam.end_time}
                      onChange={(e) => setExam({...exam, end_time: e.target.value})}
                      className="mt-1 block w-full border border-[#7A1F2E]/30 rounded-md shadow-sm p-2 focus:ring-[#7A1F2E] focus:border-[#7A1F2E] bg-white"
                    />
                    <p className="mt-1 text-xs text-[#7A1F2E]/80">The absolute latest time the exam will be accepted.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#601826]">Duration (Minutes) <span className="text-red-500">*</span></label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={exam.duration}
                      onChange={(e) => setExam({...exam, duration: e.target.value})}
                      className="mt-1 block w-full border border-[#7A1F2E]/30 rounded-md shadow-sm p-2 focus:ring-[#7A1F2E] focus:border-[#7A1F2E] bg-white"
                    />
                    <p className="mt-1 text-xs text-[#7A1F2E]/80">
                      Students will have this much time to complete the exam once they start, within the window above.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#601826]">Total Marks</label>
                    <input
                      type="text"
                      readOnly
                      value={questions.reduce((sum, q) => sum + (q.marks || 1), 0)}
                      className="mt-1 block w-full border border-gray-200 rounded-md shadow-sm p-2 bg-gray-100 text-gray-700 cursor-not-allowed font-semibold"
                    />
                    <p className="mt-1 text-xs text-[#7A1F2E]/80">
                      Automatically calculated from the questions in your list.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Status</label>
                  <select
                    value={exam.status}
                    onChange={(e) => setExam({...exam, status: e.target.value})}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-[#7A1F2E] focus:border-[#7A1F2E] bg-white"
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#7A1F2E] hover:bg-[#601826] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#7A1F2E] disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Exam'}
                </button>
              </form>
            </div>
          </div>

          {/* Right Column: Questions */}
          <div className="lg:w-2/3 space-y-6">
            {!isNew && (
              <div className="bg-white shadow rounded-lg p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-medium text-gray-900">Questions ({questions.length})</h2>
                </div>

                <div className="space-y-4 max-h-96 overflow-y-auto mb-6 pr-2">
                  {questions.length === 0 ? (
                    <p className="text-gray-500 text-sm italic">No questions added yet.</p>
                  ) : (
                    questions.map((q, idx) => (
                      <div key={q.question_id} className="border border-gray-200 rounded p-4 flex justify-between items-start hover:bg-stone-50">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">
                            <span className="text-gray-500 mr-2">{idx + 1}.</span>
                            {q.question_text.length > 60 ? q.question_text.substring(0, 60) + '...' : q.question_text}
                          </p>
                          <span className="inline-block mt-2 px-2 py-1 text-xs font-semibold rounded bg-gray-100 text-gray-600 uppercase">
                            {q.question_type}
                          </span>
                          <span className="inline-block mt-2 ml-2 px-2 py-1 text-xs font-semibold rounded bg-gray-200 text-gray-700">
                            {q.marks || 1} mark{(!q.marks || q.marks > 1) ? 's' : ''}
                          </span>
                        </div>
                        <button
                          onClick={() => handleDeleteQuestion(q.question_id)}
                          className="ml-4 text-red-500 hover:text-red-700"
                        >
                          <span className="text-sm font-medium">Delete</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="border-t border-gray-200 pt-6">
                  <h3 className="text-md font-medium text-gray-900 mb-4">Add Question</h3>
                  <form onSubmit={handleAddQuestion} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Question Text <span className="text-red-500">*</span></label>
                      <textarea
                        required
                        rows={3}
                        value={qForm.question_text}
                        onChange={(e) => setQForm({...qForm, question_text: e.target.value})}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-[#7A1F2E] focus:border-[#7A1F2E] bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">Question Type</label>
                      <select
                        value={qForm.question_type}
                        onChange={(e) => setQForm({...qForm, question_type: e.target.value})}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-[#7A1F2E] focus:border-[#7A1F2E] bg-white"
                      >
                        <option value="mcq">Multiple Choice (MCQ)</option>
                        <option value="short_answer">Short Answer</option>
                        <option value="essay">Essay</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">Marks</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        required
                        value={qForm.marks}
                        onChange={(e) => setQForm({...qForm, marks: e.target.value})}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-[#7A1F2E] focus:border-[#7A1F2E] bg-white"
                      />
                    </div>

                    {qForm.question_type === 'mcq' && (
                      <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-stone-50 space-y-3">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Options</label>
                        {['A', 'B', 'C', 'D'].map((letter) => (
                          <div key={letter} className="flex items-center">
                            <span className="w-8 text-sm font-bold text-gray-700">{letter}.</span>
                            <input
                              type="text"
                              required
                              value={qForm.options[letter]}
                              onChange={(e) => setQForm({
                                ...qForm,
                                options: { ...qForm.options, [letter]: e.target.value }
                              })}
                              className="ml-2 flex-1 border border-gray-300 rounded-md p-2 text-sm focus:ring-[#7A1F2E] focus:border-[#7A1F2E] bg-white"
                            />
                          </div>
                        ))}
                        
                        <div className="mt-4">
                          <label className="block text-sm font-medium text-gray-700">Correct Answer</label>
                          <select
                            value={qForm.correct_answer}
                            onChange={(e) => setQForm({...qForm, correct_answer: e.target.value})}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-[#7A1F2E] focus:border-[#7A1F2E] bg-white"
                          >
                            <option value="A">A</option>
                            <option value="B">B</option>
                            <option value="C">C</option>
                            <option value="D">D</option>
                          </select>
                        </div>
                      </div>
                    )}

                    <button
                      type="submit"
                      className="inline-flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                    >
                      Add Question
                    </button>
                  </form>
                </div>
              </div>
            )}
            
            {isNew && (
              <div className="bg-yellow-50 p-6 rounded-lg text-yellow-800 text-sm border border-yellow-200">
                Please save the exam settings on the left before you can add questions.
              </div>
            )}
          </div>
        </div>
          </>
        )}
      </PageMain>
    </PageWrapper>
  );
}

export default ExamBuilder;