'use client';

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import type { Note } from '@/types';

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

/** Signals the editor to load a specific note. Cleared after the editor consumes it. */
interface PendingNoteLoad {
  id: string;
  title: string;
  contentJson: string;
}

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
  /** Set by the editor; called by any component that needs to inject a quote. */
  registerInsertHandler: (handler: ((quote: string, source: string) => void) | null) => void;
  lastSavedAt: number | null;
  markSaved: () => void;
  /** Signal the editor to load a specific note. */
  loadNoteIntoEditor: (note: Note) => void;
  /** Consumed by EditorShell once; cleared after use. */
  pendingNoteLoad: PendingNoteLoad | null;
  clearPendingNoteLoad: () => void;
  /** Create a fresh blank note (clears editor). */
  newNote: () => void;
  /** Insert generated text at cursor position. */
  insertGeneratedText: (text: string) => void;
  /** Replace currently selected text. */
  replaceSelection: (text: string) => void;
  /** Get the currently selected text. */
  getSelectedText: () => string;
  /** Register handlers for AI editor integration. */
  registerAIInsertHandler: (handler: ((text: string) => void) | null) => void;
  registerAIReplaceHandler: (handler: ((text: string) => void) | null) => void;
  registerAIGetSelectionHandler: (handler: (() => string) | null) => void;
}

const EditorContext = createContext<EditorContextType | undefined>(undefined);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [noteTitle, setNoteTitle] = useState('Untitled Note');
  const [noteId, setNoteId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [isAIPanelOpen, setAIPanelOpen] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [pendingNoteLoad, setPendingNoteLoad] = useState<PendingNoteLoad | null>(null);
  const insertHandlerRef = useRef<((quote: string, source: string) => void) | null>(null);

  const toggleAIPanel = useCallback(() => setAIPanelOpen((v) => !v), []);

  const registerInsertHandler = useCallback(
    (handler: ((quote: string, source: string) => void) | null) => {
      insertHandlerRef.current = handler;
    },
    [],
  );

  const insertReferenceBlock = useCallback((quote: string, source: string) => {
    insertHandlerRef.current?.(quote, source);
  }, []);

  // AI editor integration handlers
  const aiInsertRef = useRef<((text: string) => void) | null>(null);
  const aiReplaceRef = useRef<((text: string) => void) | null>(null);
  const aiGetSelectionRef = useRef<(() => string) | null>(null);

  const registerAIInsertHandler = useCallback(
    (handler: ((text: string) => void) | null) => { aiInsertRef.current = handler; },
    [],
  );
  const registerAIReplaceHandler = useCallback(
    (handler: ((text: string) => void) | null) => { aiReplaceRef.current = handler; },
    [],
  );
  const registerAIGetSelectionHandler = useCallback(
    (handler: (() => string) | null) => { aiGetSelectionRef.current = handler; },
    [],
  );

  const insertGeneratedText = useCallback((text: string) => {
    aiInsertRef.current?.(text);
  }, []);

  const replaceSelection = useCallback((text: string) => {
    aiReplaceRef.current?.(text);
  }, []);

  const getSelectedText = useCallback((): string => {
    return aiGetSelectionRef.current?.() ?? '';
  }, []);

  const markSaved = useCallback(() => {
    setSaveStatus('saved');
    setLastSavedAt(Date.now());
  }, []);

  const loadNoteIntoEditor = useCallback((note: Note) => {
    setPendingNoteLoad({
      id: note.id,
      title: note.title,
      contentJson: note.content_json,
    });
  }, []);

  const clearPendingNoteLoad = useCallback(() => {
    setPendingNoteLoad(null);
  }, []);

  const newNote = useCallback(() => {
    setPendingNoteLoad({ id: '', title: 'Untitled Note', contentJson: '' });
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
        loadNoteIntoEditor,
        pendingNoteLoad,
        clearPendingNoteLoad,
        newNote,
        insertGeneratedText,
        replaceSelection,
        getSelectedText,
        registerAIInsertHandler,
        registerAIReplaceHandler,
        registerAIGetSelectionHandler,
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
