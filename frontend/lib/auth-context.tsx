'use client';

import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { apiFetch } from './api';
import { clearAuthToken } from './auth-token';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  // 'super_admin' sees the system administration (docs/design/P2-2-workspaces.md §6b)
  platformRole?: 'user' | 'super_admin';
  // Set with a temp password: only the change-password screen works until changed
  mustChangePassword?: boolean;
  // Google-only accounts have no current password to type
  hasPassword?: boolean;
  // Personalization saved on the account (see lib/preferences.tsx)
  preferences?: {
    themeStyle: 'broadsheet' | 'organic' | 'classic';
    themeMode: 'light' | 'dark' | 'system';
    language: 'vi' | 'en';
  };
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (userData: User) => void;
  // Merge changes into the signed-in user (e.g. saved preferences)
  updateUser: (changes: Partial<User>) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refreshUser = async () => {
    try {
      const userData = await apiFetch('/auth/session', { silent: true });
      setUser(userData);
    } catch (error: any) {
      // An expired or revoked token is useless; drop it so we stop sending it
      if (error?.status === 401) clearAuthToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = (userData: User) => {
    setUser(userData);
  };

  const updateUser = useCallback((changes: Partial<User>) => {
    setUser(current => (current ? { ...current, ...changes } : current));
  }, []);

  const logout = async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      // Always forget the local token, even if the server call failed
      clearAuthToken();
      setUser(null);
      router.push('/login');
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, updateUser, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
