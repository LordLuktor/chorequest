import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { getItem, setItem } from '../lib/storage';

const THEME_STORAGE_KEY = 'chorequest_theme_mode';

export type ThemeMode = 'dark' | 'light' | 'system';

const DARK = {
  bg: '#0f0e1a', card: '#1a1830', border: '#312e5a', surface3: '#252244',
  primary: '#6366f1', primaryLight: '#818cf8',
  text: '#e0e7ff', textMuted: '#94a3b8', textDim: '#5c6278',
  success: '#22c55e', danger: '#ef4444', warning: '#f59e0b',
};

const LIGHT = {
  bg: '#f8fafc', card: '#ffffff', border: '#e2e8f0', surface3: '#f1f5f9',
  primary: '#6366f1', primaryLight: '#818cf8',
  text: '#1e293b', textMuted: '#64748b', textDim: '#94a3b8',
  success: '#16a34a', danger: '#dc2626', warning: '#d97706',
};

export type ThemeColors = typeof DARK;

interface ThemeContextType {
  colors: ThemeColors;
  isDark: boolean;
  mode: ThemeMode;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>('dark');
  const [loaded, setLoaded] = useState(false);

  // Load saved preference on mount
  useEffect(() => {
    (async () => {
      try {
        const saved = await getItem(THEME_STORAGE_KEY);
        if (saved === 'dark' || saved === 'light' || saved === 'system') {
          setMode(saved);
        }
      } catch {
        // Default to dark on failure
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const isDark = useMemo(() => {
    if (mode === 'system') {
      return systemScheme !== 'light';
    }
    return mode === 'dark';
  }, [mode, systemScheme]);

  const colors = useMemo(() => (isDark ? DARK : LIGHT), [isDark]);

  const setTheme = useCallback(async (newMode: ThemeMode) => {
    setMode(newMode);
    try {
      await setItem(THEME_STORAGE_KEY, newMode);
    } catch {
      // Storage write failed — preference won't persist but app still works
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const next = isDark ? 'light' : 'dark';
    setTheme(next);
  }, [isDark, setTheme]);

  const value = useMemo<ThemeContextType>(() => ({
    colors,
    isDark,
    mode,
    toggleTheme,
    setTheme,
  }), [colors, isDark, mode, toggleTheme, setTheme]);

  // Don't render children until we've loaded the saved preference
  // to avoid a flash of wrong theme
  if (!loaded) {
    return null;
  }

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
