import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/useAuth';
import RoleNavbar from '../components/RoleNavbar';
import { PageWrapper, PageMain, PageHeading } from '../components/ui';

const ExamSummary = () => {
  const { examId } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [examMeta, setExamMeta] = useState({
    title: '',
    duration: 0,
    course_code: null,
    enrolled_count: 0
  });

  const fetchSubmissions = useCallback(async () => {
    try {
      const res = await api.get(`/sessions/exam/${examId}/submissions`);
      const data = res.data;
      setSubmissions(data);

      if (data.length > 0) {
        setExamMeta({
          title: data[0].exam_title || 'Unknown Exam',
          duration: data[0].exam_duration || 0,
          course_code: data[0].course_code,
          enrolled_count: data[0].enrolled_count || 0
        });
      }
    } catch (err) {
      setError('Failed to load summary data.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  const handleExportCSV = () => {
    if (submissions.length === 0) return;
    
    const headers = ['Student Name', 'Matric No.', 'Submission Time', 'Score', 'Total Marks', 'Percentage', 'Status', 'Flagged Activities'];
    const rows = submissions.map(sub => {
      const percentage = sub.total_marks > 0 ? ((sub.earned_marks / sub.total_marks) * 100).toFixed(1) + '%' : '0%';
      return [
        `"${sub.username}"`,
        `"${sub.student_matric || 'N/A'}"`,
        `"${new Date(sub.start_time).toLocaleString()}"`,
        sub.earned_marks,
        sub.total_marks,
        `"${percentage}"`,
        `"${sub.status}"`,
        sub.tab_switch_count || 0
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('download', `Exam_${examId}_Summary.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const isLoading = loading;
  const loadError = error;

  // Calculate Metrics
  const totalSubmissions = submissions.length;
  const enrolled = examMeta.enrolled_count;
  
  let completionRate = 'N/A';
  if (enrolled > 0) {
    completionRate = Math.round((totalSubmissions / enrolled) * 100) + '%';
  } else if (totalSubmissions > 0) {
    completionRate = '100% (No course enrollments tracked)';
  }

  let totalScoreSum = 0;
  let highestPercentage = 0;
  let lowestPercentage = 100;
  let validScoresCount = 0;

  // Distribution bins
  const bins = {
    '0-20%': 0,
    '21-40%': 0,
    '41-60%': 0,
    '61-80%': 0,
    '81-100%': 0
  };

  submissions.forEach(sub => {
    if (sub.total_marks > 0) {
      validScoresCount++;
      const p = (sub.earned_marks / sub.total_marks) * 100;
      totalScoreSum += p;
      if (p > highestPercentage) highestPercentage = p;
      if (p < lowestPercentage) lowestPercentage = p;

      if (p <= 20) bins['0-20%']++;
      else if (p <= 40) bins['21-40%']++;
      else if (p <= 60) bins['41-60%']++;
      else if (p <= 80) bins['61-80%']++;
      else bins['81-100%']++;
    }
  });

  if (validScoresCount === 0) lowestPercentage = 0;

  const avgPercentage = validScoresCount > 0 ? (totalScoreSum / validScoresCount).toFixed(1) + '%' : 'N/A';
  const highestScoreStr = validScoresCount > 0 ? highestPercentage.toFixed(1) + '%' : 'N/A';
  const lowestScoreStr = validScoresCount > 0 ? lowestPercentage.toFixed(1) + '%' : 'N/A';

  const maxBinCount = Math.max(...Object.values(bins), 1);

  const homePath = user?.role === 'admin' ? '/admin/dashboard' : '/lecturer/dashboard';

  return (
    <PageWrapper>
      <RoleNavbar
        user={user}
        role={user?.role || 'lecturer'}
        homePath={homePath}
        links={[
          { key: 'summary-dashboard', label: 'Dashboard', to: homePath },
          { key: 'summary-monitoring', label: 'Live Monitoring', to: '/manage/monitoring' },
          { key: 'summary-audit', label: 'Audit Logs', to: '/manage/audit-logs' },
          { key: 'summary-regulations', label: 'Regulations', to: '/regulations' }
        ]}
        onLogout={logout}
      />

      <PageMain className="space-y-6">
        {isLoading ? (
          <div className="py-20 text-center text-gray-600">Loading summary...</div>
        ) : loadError ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">{loadError}</div>
        ) : (
          <>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <PageHeading className="mb-0">
              {examMeta.title} - Summary
            </PageHeading>
            <p className="text-sm text-gray-500 mt-1">
              {examMeta.course_code ? `${examMeta.course_code} | ` : ''}
              Duration: {examMeta.duration} min
              {submissions.length > 0 && ` | Total Marks: ${submissions[0].total_marks}`}
            </p>
          </div>
          <button
            onClick={() => navigate(homePath)}
            className="text-gray-600 hover:text-gray-900 border border-gray-300 rounded px-4 py-2 text-sm font-medium"
          >
            Back to Dashboard
          </button>
        </div>
        
        {/* Metric Cards Top Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-white p-4 lift rounded-lg shadow-sm hover:shadow-md border border-gray-100 border-l-4 border-l-[#7A1F2E]">
            <h3 className="text-xs font-semibold text-gray-500 uppercase">Enrolled</h3>
            <p className="mt-1 text-2xl font-bold text-gray-900">{enrolled > 0 ? enrolled : 'N/A'}</p>
          </div>
          <div className="bg-white p-4 lift rounded-lg shadow-sm hover:shadow-md border border-gray-100 border-l-4 border-l-[#7A1F2E]">
            <h3 className="text-xs font-semibold text-gray-500 uppercase">Submissions</h3>
            <p className="mt-1 text-2xl font-bold text-gray-900">{totalSubmissions}</p>
          </div>
          <div className="bg-white p-4 lift rounded-lg shadow-sm hover:shadow-md border border-gray-100 border-l-4 border-l-purple-500">
            <h3 className="text-xs font-semibold text-gray-500 uppercase">Completion Rate</h3>
            <p className="mt-1 text-2xl font-bold text-gray-900">{completionRate}</p>
          </div>
          <div className="bg-white p-4 lift rounded-lg shadow-sm hover:shadow-md border border-gray-100 border-l-4 border-l-yellow-500">
            <h3 className="text-xs font-semibold text-gray-500 uppercase">Average Score</h3>
            <p className="mt-1 text-2xl font-bold text-gray-900">{avgPercentage}</p>
          </div>
          <div className="bg-white p-4 lift rounded-lg shadow-sm hover:shadow-md border border-gray-100 border-l-4 border-l-green-500">
            <h3 className="text-xs font-semibold text-gray-500 uppercase">Highest Score</h3>
            <p className="mt-1 text-2xl font-bold text-gray-900">{highestScoreStr}</p>
          </div>
          <div className="bg-white p-4 lift rounded-lg shadow-sm hover:shadow-md border border-gray-100 border-l-4 border-l-red-500">
            <h3 className="text-xs font-semibold text-gray-500 uppercase">Lowest Score</h3>
            <p className="mt-1 text-2xl font-bold text-gray-900">{lowestScoreStr}</p>
          </div>
        </div>

        {/* Score Distribution Chart */}
        <div className="bg-white p-6 rounded-lg shadow-sm">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Score Distribution</h2>
          <div className="space-y-3">
            {Object.entries(bins).map(([label, count]) => {
              const widthPerc = Math.round((count / maxBinCount) * 100);
              return (
                <div key={label} className="flex items-center text-sm">
                  <div className="w-16 font-medium text-gray-600">{label}</div>
                  <div className="flex-1 ml-4 relative h-6 bg-gray-100 rounded">
                    <div 
                      className="absolute top-0 left-0 h-full bg-[#7A1F2E] rounded transition-all duration-500"
                      style={{ width: `${widthPerc}%` }}
                    ></div>
                    {count > 0 && (
                      <span className={`absolute top-0 h-full flex items-center text-xs font-bold px-2 ${widthPerc < 10 ? 'left-full text-gray-700' : 'right-0 text-white'}`}>
                        {count} student{count !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Results Table */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-stone-50">
            <h2 className="text-lg font-bold text-gray-800">Student Results</h2>
            <button 
              onClick={handleExportCSV}
              disabled={submissions.length === 0}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm flex items-center"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
              Export Results CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-white">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Matric No.</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Submitted</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Flagged Activities</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {submissions.map((sub) => {
                  const isFlagged = sub.status === 'flagged' || sub.tab_switch_count >= 5;
                  return (
                    <tr key={sub.session_id} className={`hover:bg-stone-50 ${isFlagged ? 'border-l-4 border-l-red-500' : ''}`}>
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
                        <span className="ml-2 text-xs text-gray-500">
                          ({sub.total_marks > 0 ? Math.round((sub.earned_marks / sub.total_marks) * 100) : 0}%)
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {sub.tab_switch_count > 0 ? (
                          <span className="text-red-600 font-bold">{sub.tab_switch_count} switches</span>
                        ) : (
                          'None'
                        )}
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
                            Pending Grading
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
                
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
        </div>
          </>
        )}
      </PageMain>
    </PageWrapper>
  );
};

export default ExamSummary;