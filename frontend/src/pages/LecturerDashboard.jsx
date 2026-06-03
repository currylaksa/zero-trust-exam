import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/useAuth';
import RoleNavbar from '../components/RoleNavbar';
import { PageWrapper, PageMain, PageHeading, ErrorAlert, EmptyState } from '../components/ui';

function LecturerDashboard() {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  useEffect(() => {
    fetchExams();
  }, []);

  const fetchExams = async () => {
    setLoading(true);
    try {
      const response = await api.get('/exams');
      setExams(response.data);
      setError('');
    } catch (err) {
      console.error(err);
      setError('Failed to load exams.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (examId) => {
    if (!window.confirm('Are you sure you want to delete this exam? This action cannot be undone.')) {
      return;
    }
    try {
      await api.delete(`/exams/${examId}`);
      setExams(exams.filter(e => e.exam_id !== examId));
    } catch (err) {
      console.error('Error deleting exam:', err);
      // alert('Failed to delete exam.'); // avoid global alerts to be reliable, could log or show inline error
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'published':
        return <span className="px-2 py-1 text-xs font-semibold rounded bg-green-100 text-green-800">Published</span>;
      case 'archived':
        return <span className="px-2 py-1 text-xs font-semibold rounded bg-gray-100 text-gray-800">Archived</span>;
      case 'draft':
      default:
        return <span className="px-2 py-1 text-xs font-semibold rounded bg-yellow-100 text-yellow-800">Draft</span>;
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
          { key: 'lecturer-dashboard', label: 'Dashboard', to: homePath },
          { key: 'lecturer-monitoring', label: 'Live Monitoring', to: '/manage/monitoring' },
          { key: 'lecturer-audit', label: 'Audit Logs', to: '/manage/audit-logs' },
          { key: 'lecturer-regulations', label: 'Regulations', to: '/regulations' }
        ]}
        onLogout={logout}
      />

      {/* Main Content */}
      <PageMain>
          <div className="flex justify-between items-center mb-6">
            <PageHeading className="mb-0">Exam Management</PageHeading>
            <button
              onClick={() => navigate('/manage/exams/new')}
              className="px-4 py-2 bg-[#7A1F2E] text-white text-sm font-medium rounded-md hover:bg-[#601826] shadow-sm"
            >
              + Create New Exam
            </button>
          </div>

          <ErrorAlert message={error} className="mb-4" />

          {loading ? (
            <div className="text-center py-10 text-gray-500">Loading exams...</div>
          ) : exams.length === 0 ? (
            <EmptyState title="No exams found" subtitle='Click "Create New Exam" to get started.' />
          ) : (
            <div className="bg-white shadow overflow-hidden border-b border-gray-200 sm:rounded-lg">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-stone-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {exams.map((exam) => (
                    <tr key={exam.exam_id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {exam.title}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(exam.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {exam.duration} mins
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(exam.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                        <button
                          onClick={() => navigate(`/manage/exams/${exam.exam_id}/summary`)}
                          className="text-sm font-medium text-[#7A1F2E] bg-white border border-[#7A1F2E] rounded px-3 py-1 hover:bg-[#FFF5F5] transition"
                        >
                          Summary
                        </button>
                        <button
                          onClick={() => navigate(`/manage/grading/${exam.exam_id}`)}
                          className="text-sm font-medium text-green-600 bg-white border border-green-600 rounded px-3 py-1 hover:bg-green-50 transition"
                        >
                          Grade
                        </button>
                        <button
                          onClick={() => navigate(`/manage/exams/${exam.exam_id}`)}
                          className="text-sm font-medium text-[#7A1F2E] bg-white border border-[#7A1F2E] rounded px-3 py-1 hover:bg-[#FFF5F5] transition"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(exam.exam_id)}
                          className="text-sm font-medium text-red-600 bg-white border border-red-600 rounded px-3 py-1 hover:bg-red-50 transition"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </PageMain>
    </PageWrapper>
  );
}

export default LecturerDashboard;
