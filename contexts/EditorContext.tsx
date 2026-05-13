'use client';

import { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from 'react';

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

interface EditorContextType {
  noteTitle: string;
  setNoteTitle: (title: string) => void;
  noteId: string | null;
  setNoteId: (id: string | null) => void;
  saveStatus: SaveStatus;
  setSaveStatus: (status: SaveStatus) => void;
  isAIPanelOpen: boolean;
  toggleAIPanel: () => void;
  setAIPanelOpen: (open: boolean) => void;
  insertReferenceBlock: (quote: string, source: string) => void;
  /** The callback is set by the editor; the preview panel calls it via context. */
  registerInsertHandler: (handler: ((quote: string, source: string) => void) | null) => void;
  lastSavedAt: number | null;
  markSaved: () => void;
}

const EditorContext = createContext<EditorContextType | undefined>(undefined);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [noteTitle, setNoteTitle] = useState('Untitled Note');
  const [noteId, setNoteId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [isAIPanelOpen, setAIPanelOpen] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const insertHandlerRef = useRef<((quote: string, source: string) => void) | null>(null);

  const toggleAIPanel = useCallback(() => setAIPanelOpen((v) => !v), []);

  const registerInsertHandler = useCallback((handler: ((quote: string, source: string) => void) | null) => {
    insertHandlerRef.current = handler;
  }, []);

  const insertReferenceBlock = useCallback((quote: string, source: string) => {
    insertHandlerRef.current?.(quote, source);
  }, []);

  const markSaved = useCallback(() => {
    setSaveStatus('saved');
    setLastSavedAt(Date.now());
  }, []);

  return (
    <EditorContext.Provider
      value={{
        noteTitle,
        setNoteTitle,
        noteId,
        setNoteId,
        saveStatus,
        setSaveStatus,
        isAIPanelOpen,
        toggleAIPanel,
        setAIPanelOpen,
        insertReferenceBlock,
        registerInsertHandler,
        lastSavedAt,
        markSaved,
      }}
    >
      {children}
    </EditorContext.Provider>
  );
}

export function useEditorContext() {
  const context = useContext(EditorContext);
  if (context === undefined) {
    throw new Error('useEditorContext must be used within an EditorProvider');
  }
  return context;
}
