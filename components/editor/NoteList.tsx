'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Plus, FileEdit, Clock, ChevronRight } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useBook } from '@/contexts/BookContext';
import { useEditorContext } from '@/contexts/EditorContext';
import { listNotesByBook, isTauriEnvironment } from '@/lib/tauri';
import type { Note } from '@/types';

const springConfig = { type: 'spring' as const, stiffness: 200, damping: 25 };

function timeAgo(unixSecs: number): string {
  const diff = Date.now() / 1000 - unixSecs;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(unixSecs * 1000).toLocaleDateString();
}

interface NoteListProps {
  isCollapsed: boolean;
}

export default function NoteList({ isCollapsed }: NoteListProps) {
  const { currentBook } = useBook();
  const { loadNoteIntoEditor, newNote, noteId } = useEditorContext();
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const isTauri = isTauriEnvironment();

  const loadNotes = useCallback(async () => {
    if (!currentBook || !isTauri) return;
    setIsLoading(true);
    try {
      const fetched = await listNotesByBook(currentBook.id);
      setNotes(fetched);
    } catch (err) {
      console.error('Failed to load notes', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentBook, isTauri]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  if (!isTauri) {
    return (
      <div className="px-4 py-6 text-center">
        <p className="text-xs text-text-tertiary-light dark:text-text-tertiary-dark">
          Notes require the desktop app
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* New note button */}
      {!isCollapsed && (
        <div className="px-4 pb-3">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={newNote}
            className="w-full h-10 rounded-squircle bg-accent-primary text-white flex items-center justify-center gap-2 hover:bg-accent-primary/90 transition-colors shadow-ambient dark:shadow-ambient-dark text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            New Note
          </motion.button>
        </div>
      )}

      {isCollapsed && (
        <div className="px-3 pb-3">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={newNote}
            className="w-full h-10 rounded-squircle bg-accent-primary text-white flex items-center justify-center hover:bg-accent-primary/90 transition-colors"
            title="New note"
          >
            <Plus className="w-4 h-4" />
          </motion.button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1 pb-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="w-5 h-5 border-2 border-accent-warm border-t-transparent rounded-full"
            />
          </div>
        ) : notes.length === 0 ? (
          !isCollapsed && (
            <div className="text-center py-8 px-2">
              <FileEdit className="w-8 h-8 text-text-tertiary-light dark:text-text-tertiary-dark mx-auto mb-2 opacity-50" />
              <p className="text-xs text-text-tertiary-light dark:text-text-tertiary-dark">
                No notes yet
              </p>
              <p className="text-xs text-text-tertiary-light dark:text-text-tertiary-dark mt-1 opacity-70">
                Click "New Note" to start writing
              </p>
            </div>
          )
        ) : (
          <AnimatePresence initial={false}>
            {notes.map((note, index) => {
              const isActive = note.id === noteId;
              return (
                <motion.button
                  key={note.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ ...springConfig, delay: index * 0.03 }}
                  onClick={() => loadNoteIntoEditor(note)}
                  className={`w-full text-left rounded-squircle-sm transition-colors group ${
                    isCollapsed ? 'p-2' : 'px-3 py-2.5'
                  } ${
                    isActive
                      ? 'bg-accent-warm/10 border border-accent-warm/20'
                      : 'hover:bg-background-light dark:hover:bg-background-dark border border-transparent'
                  }`}
                  title={isCollapsed ? note.title : undefined}
                >
                  {isCollapsed ? (
                    <FileEdit
                      className={`w-5 h-5 mx-auto ${
                        isActive
                          ? 'text-accent-warm'
                          : 'text-text-tertiary-light dark:text-text-tertiary-dark'
                      }`}
                    />
                  ) : (
                    <div className="flex items-start gap-2">
                      <FileEdit
                        className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${
                          isActive ? 'text-accent-warm' : 'text-text-tertiary-light dark:text-text-tertiary-dark'
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm font-medium truncate tracking-tight ${
                            isActive
                              ? 'text-accent-warm'
                              : 'text-text-primary-light dark:text-text-primary-dark'
                          }`}
                        >
                          {note.title || 'Untitled Note'}
                        </p>
                        {note.plain_text && (
                          <p className="text-xs text-text-tertiary-light dark:text-text-tertiary-dark truncate mt-0.5">
                            {note.plain_text.slice(0, 60)}
                          </p>
                        )}
                        <div className="flex items-center gap-1 mt-1">
                          <Clock className="w-3 h-3 text-text-tertiary-light dark:text-text-tertiary-dark opacity-60" />
                          <span className="text-xs text-text-tertiary-light dark:text-text-tertiary-dark opacity-60">
                            {timeAgo(note.updated_at)}
                          </span>
                        </div>
                      </div>
                      <ChevronRight
                        className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 transition-opacity ${
                          isActive ? 'opacity-100 text-accent-warm' : 'opacity-0 group-hover:opacity-50'
                        }`}
                      />
                    </div>
                  )}
                </motion.button>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
