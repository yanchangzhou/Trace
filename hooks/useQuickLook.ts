'use client';

import { useState, useEffect } from 'react';

export function useQuickLook() {
  const [isOpen, setIsOpen] = useState(false);
  const [filePath, setFilePath] = useState<string | null>(null);

  const open = (path: string) => {
    setFilePath(path);
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
    // Keep filePath for exit animation
    setTimeout(() => setFilePath(null), 300);
  };

  // Listen for Spacebar key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isOpen && filePath) {
        e.preventDefault();
        open(filePath);
      } else if (e.code === 'Escape' && isOpen) {
        e.preventDefault();
        close();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filePath]);

  return {
    isOpen,
    filePath,
    open,
    close,
    setFilePath, // For highlighting files
  };
}
