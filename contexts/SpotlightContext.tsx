'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

interface SpotlightContextType {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const SpotlightContext = createContext<SpotlightContextType | undefined>(undefined);

export function SpotlightProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggle();
      }
      if (e.key === 'Escape' && isOpen) {
        close();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, toggle, close]);

  return (
    <SpotlightContext.Provider value={{ isOpen, open, close, toggle }}>
      {children}
    </SpotlightContext.Provider>
  );
}

export function useSpotlightContext() {
  const context = useContext(SpotlightContext);
  if (context === undefined) {
    throw new Error('useSpotlightContext must be used within a SpotlightProvider');
  }
  return context;
}
