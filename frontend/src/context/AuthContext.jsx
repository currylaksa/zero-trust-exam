import React, { useState } from 'react';
import AuthContext from './authContextStore';

/**
 * AuthContext
 * Provides global auth state and methods for managing authentication across the app.
 * - Syncs with localStorage ('exam_token' and 'exam_user')
 * - Enforces JWT and user object presence
 * - Provides login, logout, and role checking utilities
 */
const getStoredAuthState = () => {
  try {
    const storedToken = localStorage.getItem('exam_token');
    const storedUser = localStorage.getItem('exam_user');

    if (!storedToken || !storedUser) {
      return { token: null, user: null };
    }

    return {
      token: storedToken,
      user: JSON.parse(storedUser),
    };
  } catch (err) {
    console.error('Failed to parse stored user:', err);
    localStorage.removeItem('exam_token');
    localStorage.removeItem('exam_user');
    return { token: null, user: null };
  }
};

/**
 * AuthProvider Component
 * Wraps the app and provides auth context to all children.
 * Initializes state from localStorage on mount.
 */
export const AuthProvider = ({ children }) => {
  const [authState, setAuthState] = useState(() => getStoredAuthState());
  const { user, token } = authState;

  /**
   * Login: Save token and user to state and localStorage
   * @param {string} token - JWT token from backend
   * @param {object} userObject - User object with userId, email, role, etc.
   */
  const login = (authToken, userObject) => {
    setAuthState({ token: authToken, user: userObject });
    localStorage.setItem('exam_token', authToken);
    localStorage.setItem('exam_user', JSON.stringify(userObject));
  };

  /**
   * Logout: Clear token and user from state and localStorage, redirect to login
   */
  const logout = () => {
    setAuthState({ token: null, user: null });
    localStorage.removeItem('exam_token');
    localStorage.removeItem('exam_user');
    window.location.href = '/login';
  };

  /**
   * Is authenticated: Returns true if token exists
   */
  const isAuthenticated = !!token;

  /**
   * Check if current user has a specific role
   * @param {string} role - Role to check (e.g., 'student', 'admin', 'lecturer', 'staff')
   * @returns {boolean} True if user.role matches the given role
   */
  const isRole = (requestedRole) => {
    return user && user.role === requestedRole;
  };

  const value = {
    user,
    token,
    login,
    logout,
    isAuthenticated,
    isRole,
    isLoading: false,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

