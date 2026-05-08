'use client';

import { X, Minus, Square, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useSpotlightContext } from '@/contexts/SpotlightContext';

export default function TitleBar() {
  const [isTauri, setIsTauri] = useState(false);
  const spotlight = useSpotlightContext();

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && (window as any).__TAURI__) {
        setIsTauri(true);
      }
    } catch {
      // browser mode
    }
  }, []);

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
