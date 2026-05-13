'use client';

import { X, Minus, Square } from 'lucide-react';

export default function TitleBar() {
  return (
    <div className="titlebar fixed top-0 left-0 right-0 h-12 flex items-center justify-between px-4 bg-card-light/80 dark:bg-card-dark/80 backdrop-blur-xl border-b border-border-light dark:border-border-dark z-50">
      {/* Left: App Title */}
      <div className="flex items-center gap-3">
        <div className="w-3 h-3 rounded-full bg-accent-warm"></div>
        <span className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark tracking-tighter">
          Trace
        </span>
      </div>

      {/* Center: Empty for drag region */}
      <div className="flex-1"></div>

      {/* Right: Window Controls */}
      <div className="flex items-center gap-2">
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
          className="w-8 h-8 rounded-lg hover:bg-red-500/10 hover:text-red-500 transition-colors flex items-center justify-center"
          aria-label="Close"
        >
          <X className="w-4 h-4 text-text-secondary-light dark:text-text-secondary-dark" />
        </button>
      </div>
    </div>
  );
}
