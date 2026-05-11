'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeContextType {
  theme: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  setTheme: (mode: ThemeMode) => void;
  cycleTheme: () => void;
}

const STORAGE_KEY = 'trace_theme';
const CYCLE_ORDER: ThemeMode[] = ['system', 'light', 'dark'];
const TRANSITION_ATTR = 'data-theme-transitioning';
const TRANSITION_DURATION_MS = 220;

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getSystemPreference(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(resolved: 'light' | 'dark') {
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Start with stable server-safe defaults to avoid hydration mismatch.
  // A useEffect below syncs to localStorage after the first paint.
  const [theme, setThemeState] = useState<ThemeMode>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');
  const [mounted, setMounted] = useState(false);

  // One-time mount: read stored preference and apply it.
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    const mode: ThemeMode =
      stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
    const resolved: 'light' | 'dark' =
      mode === 'system' ? getSystemPreference() : mode;

    setThemeState(mode);
    setResolvedTheme(resolved);
    applyTheme(resolved);
    setMounted(true);
  }, []);

  const setTheme = useCallback((mode: ThemeMode) => {
    const resolved: 'light' | 'dark' =
      mode === 'system' ? getSystemPreference() : mode;

    // Attach transition attribute so CSS applies smooth color transitions
    // only during the switch — avoids making every hover/focus sluggish.
    document.documentElement.setAttribute(TRANSITION_ATTR, '');
    applyTheme(resolved);
    setThemeState(mode);
    setResolvedTheme(resolved);
    localStorage.setItem(STORAGE_KEY, mode);

    // Remove after transitions complete
    const t = setTimeout(() => {
      document.documentElement.removeAttribute(TRANSITION_ATTR);
    }, TRANSITION_DURATION_MS);

    return () => clearTimeout(t);
  }, []);

  const cycleTheme = useCallback(() => {
    const next = CYCLE_ORDER[(CYCLE_ORDER.indexOf(theme) + 1) % CYCLE_ORDER.length];
    setTheme(next);
  }, [theme, setTheme]);

  // Follow system preference changes when mode = 'system'.
  useEffect(() => {
    if (!mounted || theme !== 'system') return;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      const resolved: 'light' | 'dark' = e.matches ? 'dark' : 'light';
      document.documentElement.setAttribute(TRANSITION_ATTR, '');
      applyTheme(resolved);
      setResolvedTheme(resolved);
      setTimeout(() => {
        document.documentElement.removeAttribute(TRANSITION_ATTR);
      }, TRANSITION_DURATION_MS);
    };

    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [mounted, theme]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, cycleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
