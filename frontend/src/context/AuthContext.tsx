import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User, AuthResponse } from '../types/auth';
import { apiRequest } from '../lib/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  register: (email: string, pass: string, fullName: string, orgName?: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<{ message: string; reset_token?: string }>;
  verifyResetToken: (token: string) => Promise<{ valid: boolean; email?: string; message?: string }>;
  resetPassword: (token: string, newPassword: string) => Promise<{ message: string }>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('opspilot_token'));
  const [loading, setLoading] = useState<boolean>(true);

  const refreshUser = async () => {
    try {
      const userData = await apiRequest<User>('/auth/me');
      setUser(userData);
      if (userData.org_id) {
        localStorage.setItem('opspilot_org_id', userData.org_id);
      }
    } catch (err) {
      console.warn('Failed to fetch user context:', err);
      // If unauthorized, clean up
      localStorage.removeItem('opspilot_token');
      localStorage.removeItem('opspilot_org_id');
      setUser(null);
      setToken(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      refreshUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  const login = async (email: string, pass: string) => {
    setLoading(true);
    try {
      const data = await apiRequest<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password: pass }),
      });
      localStorage.setItem('opspilot_token', data.access_token);
      if (data.org_id) {
        localStorage.setItem('opspilot_org_id', data.org_id);
      }
      setToken(data.access_token);
      await refreshUser();
    } finally {
      setLoading(false);
    }
  };

  const register = async (email: string, pass: string, fullName: string, orgName?: string) => {
    setLoading(true);
    try {
      const data = await apiRequest<AuthResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password: pass,
          full_name: fullName,
          org_name: orgName,
        }),
      });
      localStorage.setItem('opspilot_token', data.access_token);
      if (data.org_id) {
        localStorage.setItem('opspilot_org_id', data.org_id);
      }
      setToken(data.access_token);
      await refreshUser();
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('opspilot_token');
    localStorage.removeItem('opspilot_org_id');
    setToken(null);
    setUser(null);
  };

  const forgotPassword = async (email: string) => {
    return await apiRequest<{ message: string; reset_token?: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  };

  const verifyResetToken = async (token: string) => {
    return await apiRequest<{ valid: boolean; email?: string; message?: string }>(
      '/auth/verify-reset-token',
      {
        method: 'POST',
        body: JSON.stringify({ token }),
      }
    );
  };

  const resetPassword = async (token: string, newPassword: string) => {
    return await apiRequest<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, new_password: newPassword }),
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        register,
        forgotPassword,
        verifyResetToken,
        resetPassword,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
