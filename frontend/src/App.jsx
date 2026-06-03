import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

// Public Pages
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import MFAVerify from './pages/MFAVerify';
import Unauthorized from './pages/Unauthorized';
import ResumeVerify from './pages/ResumeVerify';
import Regulations from './pages/Regulations';

// Protected Pages - All Authenticated Users
import Dashboard from './pages/Dashboard';
import MFASetup from './pages/MFASetup';

// Protected Pages - Students Only
import StudentDashboard from './pages/StudentDashboard';
import ExamRoom from './pages/ExamRoom';
import Results from './pages/Results'; 

// Protected Pages - Lecturer and Admin
import LecturerDashboard from './pages/LecturerDashboard';
import ExamBuilder from './pages/ExamBuilder';
import MonitoringPanel from './pages/MonitoringPanel';
import AuditLogs from './pages/AuditLogs';
import GradingPanel from './pages/GradingPanel';
import ExamSummary from './pages/ExamSummary';

// Protected Pages - Staff Only
import StaffDashboard from './pages/StaffDashboard';

// Protected Pages - Admin Only
import AdminPanel from './pages/AdminPanel';

/**
 * App Component
 * 
 * Main application router using React Router v6.
 * Wraps all routes with AuthProvider for global auth state.
 * 
 * Route Structure:
 * - Public: /login, /unauthorized
 * - Protected (all authenticated): /dashboard
 * - Protected (students): /exam/:sessionId, /results/:sessionId
 * - Protected (lecturer): /manage/exams, /manage/monitoring, /manage/audit-logs
 * - Protected (admin only): /admin/users
 * - Default: / redirects to /dashboard
 */
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* ===== PUBLIC ROUTES ===== */}
          {/* Public marketing landing page — default entry point, no auth required */}
          <Route path="/" element={<LandingPage />} />
          {/* /setup-mfa is public because it authenticates via exam_setup_token */}
          {/* (in localStorage), not via a full JWT — the user has not yet */}
          {/* completed MFA enrollment and therefore holds no real session. */}
          <Route path="/login" element={<Login />} />
          <Route path="/verify-mfa" element={<MFAVerify />} />
          <Route path="/setup-mfa" element={<MFASetup />} />
          <Route path="/resume-verify" element={<ResumeVerify />} />
          <Route path="/unauthorized" element={<Unauthorized />} />
          <Route path="/regulations" element={<Regulations />} />

          {/* ===== PROTECTED ROUTES FOR ALL AUTHENTICATED USERS ===== */}
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<Dashboard />} />
          </Route>

          {/* ===== PROTECTED ROUTES FOR STUDENTS ===== */}
          <Route element={<ProtectedRoute roles={['student']} />}>
            <Route path="/student/dashboard" element={<StudentDashboard />} />
            <Route path="/exam/:sessionId" element={<ExamRoom />} />
            <Route path="/results/:sessionId" element={<Results />} />
          </Route>

          {/* ===== PROTECTED ROUTES FOR LECTURER + ADMIN ===== */}
          <Route element={<ProtectedRoute roles={['lecturer', 'admin']} />}>
            <Route path="/lecturer/dashboard" element={<LecturerDashboard />} />
            <Route path="/manage/exams/new" element={<ExamBuilder />} />
            <Route path="/manage/exams/:id" element={<ExamBuilder />} />
            <Route path="/manage/exams/:examId/summary" element={<ExamSummary />} />
            <Route path="/manage/grading/:examId" element={<GradingPanel />} />
            <Route path="/manage/monitoring" element={<MonitoringPanel />} />
            <Route path="/manage/audit-logs" element={<AuditLogs />} />
          </Route>

          {/* ===== PROTECTED ROUTES FOR ADMIN ONLY ===== */}
          <Route element={<ProtectedRoute roles={['admin']} />}>
            <Route path="/admin/dashboard" element={<AdminPanel />} />
            <Route path="/admin/users" element={<AdminPanel />} />
          </Route>

          {/* ===== PROTECTED ROUTES FOR STAFF ONLY ===== */}
          <Route element={<ProtectedRoute roles={['staff']} />}>
            <Route path="/staff/dashboard" element={<StaffDashboard />} />
          </Route>

          {/* ===== CATCH-ALL ===== */}
          {/* Undefined routes go to unauthorized */}
          <Route path="*" element={<Navigate to="/unauthorized" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;