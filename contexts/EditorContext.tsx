'use client';

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import type { AIInlineAction } from '@/types';

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

interface AIInlineState {
  isOpen: boolean;
  action: AIInlineAction;
  context: string;
  mode: 'insert' | 'replace';
  position: { x: number; y: number };
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
  registerInsertHandler: (handler: ((quote: string, source: string) => void) | null) => void;
  lastSavedAt: number | null;
  markSaved: () => void;
  // Inline AI
  aiInlineState: AIInlineState | null;
  openAIInline: (state: AIInlineState) => void;
  closeAIInline: () => void;
  insertGeneratedText: (text: string) => void;
  replaceSelection: (text: string) => void;
  registerInsertGeneratedText: (handler: ((text: string) => void) | null) => void;
  registerReplaceSelection: (handler: ((text: string) => void) | null) => void;
}

const EditorContext = createContext<EditorContextType | undefined>(undefined);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [noteTitle, setNoteTitle] = useState('Untitled Note');
  const [noteId, setNoteId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [isAIPanelOpen, setAIPanelOpen] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const insertHandlerRef = useRef<((quote: string, source: string) => void) | null>(null);
  const insertGeneratedTextRef = useRef<((text: string) => void) | null>(null);
  const replaceSelectionRef = useRef<((text: string) => void) | null>(null);

  const [aiInlineState, setAIInlineState] = useState<AIInlineState | null>(null);

  const toggleAIPanel = useCallback(() => setAIPanelOpen((v) => !v), []);

  const registerInsertHandler = useCallback((handler: ((quote: string, source: string) => void) | null) => {
    insertHandlerRef.current = handler;
  }, []);

  const insertReferenceBlock = useCallback((quote: string, source: string) => {
    insertHandlerRef.current?.(quote, source);
  }, []);

  const registerInsertGeneratedText = useCallback((handler: ((text: string) => void) | null) => {
    insertGeneratedTextRef.current = handler;
  }, []);

  const registerReplaceSelection = useCallback((handler: ((text: string) => void) | null) => {
    replaceSelectionRef.current = handler;
  }, []);

  const insertGeneratedText = useCallback((text: string) => {
    insertGeneratedTextRef.current?.(text);
  }, []);

  const replaceSelection = useCallback((text: string) => {
    replaceSelectionRef.current?.(text);
  }, []);

  const openAIInline = useCallback((state: AIInlineState) => {
    setAIInlineState(state);
  }, []);

  const closeAIInline = useCallback(() => {
    setAIInlineState(null);
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
        aiInlineState,
        openAIInline,
        closeAIInline,
        insertGeneratedText,
        replaceSelection,
        registerInsertGeneratedText,
        registerReplaceSelection,
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
