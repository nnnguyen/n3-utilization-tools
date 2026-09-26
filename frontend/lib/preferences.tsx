'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch } from './api';
import { useAuth } from './auth-context';

export type ThemeStyle = 'broadsheet' | 'organic' | 'classic';
export type ThemeMode = 'light' | 'dark' | 'system';
export type Language = 'vi' | 'en';

export interface Preferences {
  themeStyle: ThemeStyle;
  themeMode: ThemeMode;
  language: Language;
  // Product analytics (P2-8): null until the account is asked
  analyticsConsent: boolean | null;
}

// Match the backend column defaults (User.themeStyle/themeMode/language)
export const DEFAULT_PREFERENCES: Preferences = { themeStyle: 'broadsheet', themeMode: 'light', language: 'vi', analyticsConsent: null };

// Copy of the account's preferences in this browser: lets the first paint (and
// pages without a session, like login or the audience join page) use them
// before /auth/session answers. The account is the source of truth.
const CACHE_KEY = 'n3_preferences';

function readCache(): Preferences {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) } : DEFAULT_PREFERENCES;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function writeCache(prefs: Preferences) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage unavailable: the account still keeps the preferences
  }
}

interface PreferencesContextType extends Preferences {
  // 'system' resolved against the OS setting
  resolvedMode: 'light' | 'dark';
  updatePreferences: (changes: Partial<Preferences>) => Promise<void>;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const { user, updateUser } = useAuth();
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [systemDark, setSystemDark] = useState(false);

  // Browser-only values after mount (server render uses the defaults)
  useEffect(() => {
    setPrefs(readCache());
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(media.matches);
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  // The signed-in account wins over the local cache
  useEffect(() => {
    if (user?.preferences) {
      const fromAccount = { ...DEFAULT_PREFERENCES, ...user.preferences };
      setPrefs(fromAccount);
      writeCache(fromAccount);
    }
  }, [user?.preferences]);

  const resolvedMode: 'light' | 'dark' =
    prefs.themeMode === 'system' ? (systemDark ? 'dark' : 'light') : prefs.themeMode;

  // Global CSS variables (globals.css) and <html lang> follow the preferences
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.themeStyle = prefs.themeStyle;
    root.dataset.themeMode = resolvedMode;
    root.style.colorScheme = resolvedMode;
    root.lang = prefs.language;
  }, [prefs.themeStyle, resolvedMode, prefs.language]);

  const updatePreferences = useCallback(
    async (changes: Partial<Preferences>) => {
      const previous = prefs;
      const next = { ...prefs, ...changes };
      setPrefs(next);
      writeCache(next);
      if (!user) return;
      try {
        const saved = await apiFetch('/auth/preferences', {
          method: 'PATCH',
          body: JSON.stringify(changes),
        });
        updateUser({ preferences: saved });
      } catch (error) {
        // Keep the UI in step with what the account actually stores
        setPrefs(previous);
        writeCache(previous);
        throw error;
      }
    },
    [prefs, user, updateUser],
  );

  const value = useMemo(
    () => ({ ...prefs, resolvedMode, updatePreferences }),
    [prefs, resolvedMode, updatePreferences],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error('usePreferences must be used within a PreferencesProvider');
  return context;
}
