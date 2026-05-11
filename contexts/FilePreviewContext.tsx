'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { SourceFile } from '@/types';
import { useSidebar } from '@/contexts/SidebarContext';

interface FilePreviewContextType {
  isOpen: boolean;
  currentFile: SourceFile | null;
  previewWidth: number;
  setPreviewWidth: (width: number) => void;
  openPreview: (file: SourceFile) => void;
  closePreview: () => void;
}

const FilePreviewContext = createContext<FilePreviewContextType | undefined>(undefined);

const MIN_WIDTH = 400;
const DEFAULT_WIDTH = 720;
const EDITOR_RESERVE_PX = 300;

export function FilePreviewProvider({ children }: { children: ReactNode }) {
  const { sidebarWidth } = useSidebar();
  const [isOpen, setIsOpen] = useState(false);
  const [currentFile, setCurrentFile] = useState<SourceFile | null>(null);
  const [previewWidth, setPreviewWidthState] = useState(DEFAULT_WIDTH);

  const getMaxPreviewWidth = useCallback(() => {
    if (typeof window === 'undefined') return 1200;
    return Math.max(MIN_WIDTH, window.innerWidth - sidebarWidth - EDITOR_RESERVE_PX);
  }, [sidebarWidth]);

  useEffect(() => {
    const maxW = getMaxPreviewWidth();
    setPreviewWidthState((w) => Math.min(w, maxW));
  }, [getMaxPreviewWidth]);

  useEffect(() => {
    const onResize = () => {
      const maxW = getMaxPreviewWidth();
      setPreviewWidthState((w) => Math.min(w, maxW));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [getMaxPreviewWidth]);

  const openPreview = (file: SourceFile) => {
    setCurrentFile(file);
    setIsOpen(true);
  };

  const closePreview = () => {
    setIsOpen(false);
    setTimeout(() => setCurrentFile(null), 300);
  };

  const setPreviewWidth = (width: number) => {
    const maxWidth = getMaxPreviewWidth();
    const clampedWidth = Math.max(MIN_WIDTH, Math.min(maxWidth, width));
    setPreviewWidthState(clampedWidth);
  };

  return (
    <FilePreviewContext.Provider
      value={{
        isOpen,
        currentFile,
        previewWidth: isOpen ? previewWidth : 0,
        setPreviewWidth,
        openPreview,
        closePreview,
      }}
    >
      {children}
    </FilePreviewContext.Provider>
  );
}

export function useFilePreview() {
  const context = useContext(FilePreviewContext);
  if (context === undefined) {
    throw new Error('useFilePreview must be used within a FilePreviewProvider');
  }
  return context;
}
