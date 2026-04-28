import { useState, useEffect } from 'react';
import axiosInstance from '../api/axios';
import { useAuth } from '../context/useAuth';
import RoleNavbar from '../components/RoleNavbar';
import { PageWrapper, PageMain, MetricCard } from '../components/ui';

const AdminPanel = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('user-management');
  
  // User Management
  const [users, setUsers] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', email: '', password: '', role: 'student' });
  
  // System Overview
  const [stats, setStats] = useState({ students: 0, lecturers: 0, exams: 0, sessions: 0 });
  const [recentActivity, setRecentActivity] = useState([]);

  const fetchUsers = async () => {
    try {
      const response = await axiosInstance.get('/users');
      setUsers(response.data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchStatsAndActivity = async () => {
    try {
      const statsRes = await axiosInstance.get('/admin/stats');
      setStats(statsRes.data);
      const actsRes = await axiosInstance.get('/monitoring/audit-logs?limit=20');
      setRecentActivity(actsRes.data?.logs || actsRes.data?.data || (Array.isArray(actsRes.data) ? actsRes.data : []));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeTab === 'user-management') fetchUsers();
      else fetchStatsAndActivity();
    }, 0);

    return () => clearTimeout(timer);
  }, [activeTab]);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      const response = await axiosInstance.post('/users', newUser);
      setUsers([...users, response.data]);
      setShowCreateForm(false);
      setNewUser({ username: '', email: '', password: '', role: 'student' });
    } catch {
      alert('Error creating user');
    }
  };

  const handleRoleChange = async (id, newRole) => {
    try {
      await axiosInstance.put(`/users/${id}`, { role: newRole });
      setUsers(users.map(u => u.id === id ? { ...u, role: newRole } : u));
    } catch {
      alert('Failed to update role');
    }
  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm('Delete user?')) return;
    try {
      await axiosInstance.delete(`/users/${id}`);
      setUsers(users.filter(u => u.id !== id));
    } catch {
      alert('Failed to delete user');
    }
  };

  const getActivityTypeBadge = (type) => {
    switch (type) {
      case 'TAB_SWITCH':
      case 'FULLSCREEN_EXIT':
      case 'IP_MISMATCH': return 'bg-red-100 text-red-800';
      case 'LOGIN':
      case 'EXAM_SUBMIT': return 'bg-green-100 text-green-800';
      case 'EXAM_START': return 'bg-yellow-100 text-yellow-800';
      case 'LOGOUT': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <PageWrapper>
      <RoleNavbar
        user={user}
        role={user?.role || 'admin'}
        homePath="/admin/dashboard"
        links={[
          { key: 'admin-dashboard', label: 'Dashboard', to: '/admin/dashboard' },
          { key: 'admin-exams', label: 'Exams', to: '/lecturer/dashboard' },
          { key: 'admin-monitoring', label: 'Live Monitoring', to: '/manage/monitoring' },
          { key: 'admin-audit', label: 'Audit Logs', to: '/manage/audit-logs' },
          { key: 'admin-regulations', label: 'Regulations', to: '/regulations' }
        ]}
        onLogout={logout}
      />

      <PageMain>
        <div className="border-b border-gray-200 mb-8 flex space-x-8">
          <button
            onClick={() => setActiveTab('user-management')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'user-management' ? 'border-[#7A1F2E] text-[#7A1F2E]' : 'border-transparent text-gray-500'}`}
          >
            User Management
          </button>
          <button
            onClick={() => setActiveTab('system-overview')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'system-overview' ? 'border-[#7A1F2E] text-[#7A1F2E]' : 'border-transparent text-gray-500'}`}
          >
            System Overview
          </button>
        </div>

        {activeTab === 'user-management' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">User Management</h2>
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="px-4 py-2 bg-[#7A1F2E] text-white text-sm font-medium rounded-md hover:bg-[#601826] shadow-sm"
              >
                {showCreateForm ? 'Cancel' : 'Create User'}
              </button>
            </div>

            {showCreateForm && (
              <form onSubmit={handleCreateUser} className="bg-white p-6 rounded-lg shadow border mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
                <input required placeholder="Username" value={newUser.username} onChange={(e) => setNewUser({...newUser, username: e.target.value})} className="border rounded px-3 py-2"/>
                <input required type="email" placeholder="Email" value={newUser.email} onChange={(e) => setNewUser({...newUser, email: e.target.value})} className="border rounded px-3 py-2"/>
                <input required type="password" placeholder="Password" value={newUser.password} onChange={(e) => setNewUser({...newUser, password: e.target.value})} className="border rounded px-3 py-2"/>
                <select value={newUser.role} onChange={(e) => setNewUser({...newUser, role: e.target.value})} className="border rounded px-3 py-2">
                  <option value="student">Student</option>
                  <option value="lecturer">Lecturer</option>
                  <option value="admin">Admin</option>
                  <option value="staff">Staff</option>
                </select>
                <div className="md:col-span-4 flex justify-end space-x-2">
                  <button type="submit" className="px-4 py-2 bg-[#7A1F2E] text-white rounded">Save</button>
                </div>
              </form>
            )}

            <div className="bg-white shadow border rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Username</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">MFA Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {users.map(user => {
                    const badgeColor = user.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                                       user.role === 'lecturer' ? 'bg-blue-100 text-blue-800' :
                                       user.role === 'student' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';
                    return (
                    <tr key={user.id}>
                      <td className="px-6 py-4">{user.username}</td>
                      <td className="px-6 py-4 text-gray-500">{user.email}</td>
                      <td className="px-6 py-4"><span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${badgeColor}`}>{user.role}</span></td>
                      <td className="px-6 py-4">{user.mfaEnabled || user.mfa_enabled ? <span className="text-green-600">Enabled</span> : <span className="text-gray-400">Not set</span>}</td>
                      <td className="px-6 py-4 text-gray-500">{new Date(user.createdAt || user.created_at).toLocaleDateString()}</td>
                      <td className="px-6 py-4 space-x-2">
                        <select value={user.role} onChange={(e) => handleRoleChange(user.id, e.target.value)} className="border rounded px-2 py-1 text-sm">
                          <option value="student">Student</option>
                          <option value="lecturer">Lecturer</option>
                          <option value="admin">Admin</option>
                          <option value="staff">Staff</option>
                        </select>
                        <button onClick={() => handleDeleteUser(user.id)} className="text-sm font-medium text-red-600 bg-white border border-red-600 px-3 py-1 rounded">Delete</button>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'system-overview' && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">System Overview</h2>
            <div className="grid grid-cols-4 gap-6 mb-8">
              {Object.entries(stats).map(([k, v]) => (
                <MetricCard key={k} label={`Total ${k}`} value={v} accentColor="border-gray-400" />
              ))}
            </div>

            <h3 className="text-xl font-semibold mb-4">Recent Activity</h3>
            <div className="bg-white shadow border rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Activity</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {recentActivity.map((log, i) => (
                    <tr key={i}>
                      <td className="px-6 py-4 text-gray-500">{new Date(log.timestamp || log.created_at).toLocaleString()}</td>
                      <td className="px-6 py-4">{log.username || log.user_id}</td>
                      <td className="px-6 py-4"><span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getActivityTypeBadge(log.activity_type)}`}>{log.activity_type || 'UNKNOWN'}</span></td>
                      <td className="px-6 py-4 text-sm text-gray-500 truncate max-w-sm">{log.description || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </PageMain>
    </PageWrapper>
  );
};

export default AdminPanel;