'use client';

import { X, Minus, Square, Sun, Moon, Monitor } from 'lucide-react';
import { useTheme, type ThemeMode } from '@/contexts/ThemeContext';

const THEME_ICONS: Record<ThemeMode, React.ComponentType<{ className?: string }>> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

const THEME_LABELS: Record<ThemeMode, string> = {
  system: 'System theme',
  light: 'Light mode',
  dark: 'Dark mode',
};

export default function TitleBar() {
  const { theme, cycleTheme } = useTheme();
  const ThemeIcon = THEME_ICONS[theme];

  return (
    <div className="titlebar fixed top-0 left-0 right-0 h-12 flex items-center justify-between px-4 bg-card-light/80 dark:bg-card-dark/80 backdrop-blur-xl border-b border-border-light dark:border-border-dark z-50">
      {/* Left: App mark */}
      <div className="flex items-center gap-3">
        <div className="w-3 h-3 rounded-full bg-accent-warm" />
        <span className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark tracking-tighter">
          Trace
        </span>
      </div>

      {/* Center: drag region */}
      <div className="flex-1" />

      {/* Right: controls */}
      <div className="flex items-center gap-1">
        {/* Theme toggle */}
        <button
          onClick={cycleTheme}
          title={THEME_LABELS[theme]}
          className="w-8 h-8 rounded-lg hover:bg-surface-light dark:hover:bg-surface-dark transition-colors flex items-center justify-center"
          aria-label={THEME_LABELS[theme]}
        >
          <ThemeIcon className="w-4 h-4 text-text-secondary-light dark:text-text-secondary-dark" />
        </button>

        <div className="w-px h-4 bg-border-light dark:bg-border-dark mx-1" />

        {/* Window controls */}
        <button
          className="w-8 h-8 rounded-lg hover:bg-surface-light dark:hover:bg-surface-dark transition-colors flex items-center justify-center"
          aria-label="Minimize"
        >
          <Minus className="w-4 h-4 text-text-secondary-light dark:text-text-secondary-dark" />
        </button>
        <button
          className="w-8 h-8 rounded-lg hover:bg-surface-light dark:hover:bg-surface-dark transition-colors flex items-center justify-center"
          aria-label="Maximize"
        >
          <Square className="w-4 h-4 text-text-secondary-light dark:text-text-secondary-dark" />
        </button>
        <button
          className="w-8 h-8 rounded-lg hover:bg-red-500/10 transition-colors flex items-center justify-center group"
          aria-label="Close"
        >
          <X className="w-4 h-4 text-text-secondary-light dark:text-text-secondary-dark group-hover:text-red-500 transition-colors" />
        </button>
      </div>
    </div>
  );
}
