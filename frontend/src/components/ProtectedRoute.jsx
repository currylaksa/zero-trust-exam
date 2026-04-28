import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

/**
 * ProtectedRoute Component
 * 
 * A route wrapper that enforces authentication and role-based access control.
 * 
 * Features:
 * - Checks if user is authenticated; redirects to /login if not
 * - Optionally checks if user's role is in allowed roles; redirects to /unauthorized if not
 * - Renders children via <Outlet /> if all checks pass
 * 
 * Usage:
 * <Route element={<ProtectedRoute roles={['admin', 'lecturer']} />}>
 *   <Route path="dashboard" element={<Dashboard />} />
 * </Route>
 * 
 * @param {Array<string>} roles - (Optional) Array of allowed roles. If not provided, 
 *                                 any authenticated user can access.
 * @returns {ReactElement} Either a Navigate component or the nested routes via Outlet
 */
const ProtectedRoute = ({ roles }) => {
  const { isAuthenticated, user, isLoading } = useAuth();

  // While loading auth state, don't render anything to avoid flashing
  if (isLoading) {
    return null;
  }

  // If not authenticated, redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // If roles are specified and user's role is not in the allowed list, redirect to unauthorized
  if (roles && roles.length > 0 && !roles.includes(user?.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  // All checks passed, render the nested routes
  return <Outlet />;
};

export default ProtectedRoute;
