import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }

    if (user.role === 'student') {
      navigate('/student/dashboard', { replace: true });
    } else if (user.role === 'lecturer') {
      navigate('/lecturer/dashboard', { replace: true });
    } else if (user.role === 'staff') {
      navigate('/staff/dashboard', { replace: true });
    } else if (user.role === 'admin') {
      navigate('/admin/dashboard', { replace: true });
    } else {
      navigate('/login', { replace: true });
    }
  }, [user, navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
}

export default Dashboard;
