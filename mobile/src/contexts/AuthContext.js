// Resolution Fitness App — Auth Context
// Provides authentication state and methods to the entire app.
// Handles: login, register, logout, token persistence, profile hydration.

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const appStateRef = useRef(AppState.currentState);

  // ── Check if user is already logged in (token stored) ──────────
  useEffect(() => {
    checkAuth();
  }, []);

  // ── Re-validate auth when app returns from background ─────────
  // When the app goes to standby and comes back (hours/days later),
  // the JWT token may have expired. We re-check auth so the user
  // gets prompted to log in again if needed, rather than silently
  // failing all API calls and showing empty data.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextState === 'active'
      ) {
        // App returned to foreground — re-validate token
        checkAuth();
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, []);

  const checkAuth = async () => {
    try {
      const token = await api.getToken();
      if (token) {
        const data = await api.getProfile();
        setUser(data.data?.user || data.data || data);
      }
    } catch (err) {
      // Only force logout on auth errors (expired/invalid token).
      // Transient network failures should NOT log the user out —
      // they'll see stale data briefly and the next API call will
      // either succeed or show an error.
      const msg = err?.message || '';
      if (
        msg.toLowerCase().includes('unauthorized') ||
        msg.includes('401') ||
        msg.toLowerCase().includes('invalid or expired token')
      ) {
        await api.removeToken();
        setUser(null);
      }
      // Otherwise: keep user logged in, screens will refetch when network returns
    } finally {
      setLoading(false);
    }
  };

  // ── Auth Actions ───────────────────────────────────────────────

  const login = async (email, password) => {
    const data = await api.login(email, password);
    setUser(data.user);
    return data;
  };

  const register = async (email, password) => {
    const data = await api.register(email, password);
    setUser(data.user);
    return data;
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
  };

  const updateUser = (userData) => {
    setUser(userData);
  };

  const refreshUser = async () => {
    try {
      const data = await api.getProfile();
      setUser(data.data?.user || data.data || data);
    } catch {
      // silent fail — user stays as-is
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        updateUser,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
