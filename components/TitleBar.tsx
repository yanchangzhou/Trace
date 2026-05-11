'use client';

import { X, Minus, Square, Search, Sun, Moon, EyeOff, Check } from 'lucide-react';
import { useCallback, useEffect, useState, useRef } from 'react';
import { useSpotlightContext } from '@/contexts/SpotlightContext';
import { useTheme, type ThemeMode } from '@/contexts/ThemeContext';

export default function TitleBar() {
  const [isTauri, setIsTauri] = useState(false);
  const spotlight = useSpotlightContext();
  const { theme, setTheme } = useTheme();
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && (window as any).__TAURI__) {
        setIsTauri(true);
      }
    } catch {
      // browser mode
    }
  }, []);

  // Close theme menu on outside click
  useEffect(() => {
    if (!themeMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setThemeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [themeMenuOpen]);

  const themeIcon = theme === 'light' ? <Sun className="w-4 h-4" /> : theme === 'dark' ? <Moon className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />;

  const themeOptions: { mode: ThemeMode; icon: React.ReactNode; label: string }[] = [
    { mode: 'light', icon: <Sun className="w-4 h-4" />, label: 'Light' },
    { mode: 'dark', icon: <Moon className="w-4 h-4" />, label: 'Dark' },
    { mode: 'incognito', icon: <EyeOff className="w-4 h-4" />, label: 'Incognito' },
  ];

  const handleMinimize = useCallback(async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().minimize();
    } catch {
      // browser fallback
    }
  }, []);

  const handleMaximize = useCallback(async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().toggleMaximize();
    } catch {
      // browser fallback
    }
  }, []);

  const handleClose = useCallback(async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().close();
    } catch {
      window.close();
    }
  }, []);

  return (
    <div className="titlebar fixed top-0 left-0 right-0 h-12 flex items-center justify-between px-4 bg-card-light/80 dark:bg-card-dark/80 backdrop-blur-xl border-b border-border-light dark:border-border-dark z-50">
      {/* Left: App Title */}
      <div className="flex items-center gap-3" data-tauri-drag-region>
        <div className="w-3 h-3 rounded-full bg-accent-warm"></div>
        <span className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark tracking-tighter">
          Trace
        </span>
      </div>

      {/* Center: drag region */}
      <div className="flex-1" data-tauri-drag-region></div>

      {/* Right: Search + Window Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => spotlight.toggle()}
          className="flex items-center gap-2 px-3 h-8 rounded-lg hover:bg-surface-light dark:hover:bg-surface-dark transition-colors text-text-secondary-light dark:text-text-secondary-dark"
          aria-label="Search files"
          title="Search files (Ctrl+K)"
        >
          <Search className="w-4 h-4" />
          <span className="text-xs hidden sm:inline tracking-tight">Search</span>
          {isTauri && (
            <kbd className="hidden md:inline-flex items-center px-1.5 py-0.5 text-[10px] rounded bg-surface-light dark:bg-surface-dark text-text-tertiary-light dark:text-text-tertiary-dark">
              Ctrl+K
            </kbd>
          )}
        </button>

        {/* Theme selector dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setThemeMenuOpen(!themeMenuOpen)}
            className="w-8 h-8 rounded-lg hover:bg-surface-light dark:hover:bg-surface-dark transition-colors flex items-center justify-center"
            aria-label="Select theme"
            title={`Theme: ${theme}`}
          >
            {themeIcon}
          </button>

          {themeMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-36 bg-card-light dark:bg-card-dark rounded-lg shadow-ambient-lg dark:shadow-ambient-lg-dark border border-border-light dark:border-border-dark overflow-hidden z-50">
              {themeOptions.map((option) => (
                <button
                  key={option.mode}
                  onClick={() => {
                    setTheme(option.mode);
                    setThemeMenuOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-surface-light dark:hover:bg-surface-dark transition-colors ${
                    theme === option.mode
                      ? 'text-accent-warm'
                      : 'text-text-primary-light dark:text-text-primary-dark'
                  }`}
                >
                  {option.icon}
                  <span className="flex-1">{option.label}</span>
                  {theme === option.mode && <Check className="w-3.5 h-3.5" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {isTauri && (
          <>
            <button
              onClick={handleMinimize}
              className="w-8 h-8 rounded-lg hover:bg-surface-light dark:hover:bg-surface-dark transition-colors flex items-center justify-center"
              aria-label="Minimize"
            >
              <Minus className="w-4 h-4 text-text-secondary-light dark:text-text-secondary-dark" />
            </button>
            <button
              onClick={handleMaximize}
              className="w-8 h-8 rounded-lg hover:bg-surface-light dark:hover:bg-surface-dark transition-colors flex items-center justify-center"
              aria-label="Maximize"
            >
              <Square className="w-4 h-4 text-text-secondary-light dark:text-text-secondary-dark" />
            </button>
            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-lg hover:bg-red-500/10 hover:text-red-500 transition-colors flex items-center justify-center"
              aria-label="Close"
            >
              <X className="w-4 h-4 text-text-secondary-light dark:text-text-secondary-dark" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
