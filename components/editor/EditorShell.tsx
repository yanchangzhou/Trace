'use client';

import { motion } from 'framer-motion';
import { Sparkles, Save } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import { useSidebar } from '@/contexts/SidebarContext';
import { useFilePreview } from '@/contexts/FilePreviewContext';
import { useEditorContext } from '@/contexts/EditorContext';
import { useBook } from '@/contexts/BookContext';
import { createNote, updateNote, isTauriEnvironment } from '@/lib/tauri';
import EditorToolbar from './EditorToolbar';
import { SlashCommand } from './suggestion';
import { BlockDragExtension } from './BlockDragExtension';

const springConfig = {
  type: 'spring' as const,
  stiffness: 200,
  damping: 25,
};

export default function EditorShell() {
  const { sidebarWidth } = useSidebar();
  const { previewWidth } = useFilePreview();
  const { currentBook } = useBook();
  const {
    noteTitle,
    setNoteTitle,
    noteId,
    setNoteId,
    saveStatus,
    setSaveStatus,
    toggleAIPanel,
    registerInsertHandler,
    registerAIInsertHandler,
    registerAIReplaceHandler,
    registerAIGetSelectionHandler,
    lastSavedAt,
    markSaved,
    pendingNoteLoad,
    clearPendingNoteLoad,
  } = useEditorContext();

  const [plainText, setPlainText] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);
  // Track the last persisted note ID so title-change autosave only fires
  // after the note exists in the DB.
  const savedNoteIdRef = useRef<string | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
      }),
      Placeholder.configure({
        placeholder: 'Start writing your thoughts...',
      }),
      BlockDragExtension.configure({
        dragHandleSelector: '.block-drag-handle',
      }),
      SlashCommand,
    ],
    content: '<p></p>',
    editorProps: {
      attributes: {
        class:
          'min-h-[500px] w-full bg-transparent outline-none text-lg leading-relaxed tracking-tight text-text-primary-light dark:text-text-primary-dark',
      },
    },
    onUpdate: ({ editor: e }) => {
      const text = e.getText();
      setPlainText(text);
      setSaveStatus('unsaved');
    },
  });

  const wordCount = useMemo(() => plainText.split(/\s+/).filter(Boolean).length, [plainText]);
  const charCount = plainText.length;

  // Auto-save: debounce save after content or title changes.
  const doSave = useCallback(async () => {
    // Browser mode: no Tauri backend, silently mark as saved to prevent error state.
    if (!isTauriEnvironment()) {
      markSaved();
      return;
    }
    if (!editor) return;
    const contentJson = JSON.stringify(editor.getJSON());
    const text = editor.getText();
    // Read from refs so the closure always sees the latest values.
    const currentNoteId = noteId;
    const currentTitle = noteTitle;
    if (!text.trim() && !currentNoteId) return;

    setSaveStatus('saving');
    try {
      if (currentNoteId) {
        await updateNote(currentNoteId, currentTitle, contentJson, text);
        savedNoteIdRef.current = currentNoteId;
      } else if (currentBook) {
        const note = await createNote(currentBook.id, currentTitle, contentJson, text);
        setNoteId(note.id);
        savedNoteIdRef.current = note.id;
      }
      markSaved();
    } catch (error) {
      console.error('Failed to save note:', error);
      setSaveStatus('error');
    }
  }, [editor, noteId, noteTitle, currentBook, setNoteId, setSaveStatus, markSaved]);

  // Trigger autosave whenever content becomes "unsaved".
  useEffect(() => {
    if (saveStatus !== 'unsaved') return;
    const timer = setTimeout(() => void doSave(), 1500);
    return () => clearTimeout(timer);
  }, [saveStatus, doSave]);

  // Trigger autosave on title change — but only after the note already exists in the DB.
  useEffect(() => {
    if (!savedNoteIdRef.current) return;
    const timer = setTimeout(() => void doSave(), 1500);
    return () => clearTimeout(timer);
  }, [noteTitle, doSave]);

  // Load a note when EditorContext signals one (e.g. user clicked a note in the list).
  useEffect(() => {
    if (!pendingNoteLoad || !editor) return;

    const { id, title, contentJson } = pendingNoteLoad;

    setNoteId(id || null);
    savedNoteIdRef.current = id || null;
    setNoteTitle(title);

    try {
      const content = contentJson ? JSON.parse(contentJson) : null;
      editor.commands.setContent(content ?? '<p></p>');
    } catch {
      editor.commands.setContent('<p></p>');
    }

    setSaveStatus('saved');
    clearPendingNoteLoad();
  }, [pendingNoteLoad, editor, setNoteId, setNoteTitle, setSaveStatus, clearPendingNoteLoad]);

  // Register insert reference handler for preview panel
  useEffect(() => {
    if (!editor) return;
    registerInsertHandler((quote: string, source: string) => {
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'blockquote',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: quote }],
            },
            {
              type: 'paragraph',
              content: [{ type: 'text', marks: [{ type: 'italic' }], text: `— From: ${source}` }],
            },
          ],
        })
        .run();
    });
    return () => registerInsertHandler(null);
  }, [editor, registerInsertHandler]);

  // Register AI insert handler — inserts generated text at cursor
  useEffect(() => {
    if (!editor) return;
    registerAIInsertHandler((text: string) => {
      editor.chain().focus().insertContent(text).run();
    });
    return () => registerAIInsertHandler(null);
  }, [editor, registerAIInsertHandler]);

  // Register AI replace handler — replaces selected text
  useEffect(() => {
    if (!editor) return;
    registerAIReplaceHandler((text: string) => {
      editor.chain().focus().deleteSelection().insertContent(text).run();
    });
    return () => registerAIReplaceHandler(null);
  }, [editor, registerAIReplaceHandler]);

  // Register AI get selection handler
  useEffect(() => {
    registerAIGetSelectionHandler(() => {
      if (!editor) return '';
      const { from, to } = editor.state.selection;
      return editor.state.doc.textBetween(from, to, ' ');
    });
    return () => registerAIGetSelectionHandler(null);
  }, [editor, registerAIGetSelectionHandler]);

  const saveStatusLabel = saveStatus === 'saved'
    ? lastSavedAt ? `Saved ${new Date(lastSavedAt).toLocaleTimeString()}` : 'Saved'
    : saveStatus === 'saving' ? 'Saving...'
    : saveStatus === 'unsaved' ? 'Unsaved changes'
    : 'Save error';

  return (
    <main
      style={{
        paddingLeft: `${sidebarWidth + previewWidth}px`,
        transition: 'padding-left 0ms',
      }}
      className="fixed left-0 right-0 top-12 bottom-0 bg-background-light dark:bg-background-dark overflow-auto"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl mx-auto px-8 py-12 editor-shell"
      >
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ ...springConfig, delay: 0.2 }}
          className="bg-card-light dark:bg-card-dark rounded-squircle-lg p-12 shadow-ambient dark:shadow-ambient-dark min-h-[600px]"
        >
          {/* Note Title */}
          <div className="mb-8">
            <input
              ref={titleInputRef}
              type="text"
              value={noteTitle}
              onChange={(e) => {
                setNoteTitle(e.target.value);
                setSaveStatus('unsaved');
              }}
              placeholder="Untitled Note"
              className="w-full bg-transparent border-none outline-none text-3xl font-semibold text-text-primary-light dark:text-text-primary-dark placeholder:text-text-tertiary-light dark:placeholder:text-text-tertiary-dark tracking-tight"
            />
          </div>

          {/* Bubble Menu Toolbar */}
          {editor && (
            <BubbleMenu
              editor={editor}
              options={{ placement: 'top' }}
              shouldShow={({ editor: e, state }) => {
                if (!e?.isEditable || !e.isFocused || !state?.selection) return false;
                const { from, to, empty } = state.selection;
                return !empty && e.state.doc.textBetween(from, to, ' ').trim().length > 0;
              }}
              updateDelay={80}
              appendTo={() => document.body}
            >
              <EditorToolbar editor={editor} />
            </BubbleMenu>
          )}

          {/* Editor Content */}
          <EditorContent
            editor={editor}
            className="
              [&_.ProseMirror]:outline-none
              [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]
              [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-text-tertiary-light
              [&_.ProseMirror_p.is-editor-empty:first-child::before]:dark:text-text-tertiary-dark
              [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left
              [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none
              [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0
              [&_.ProseMirror_p]:my-2
              [&_.ProseMirror_h1]:text-4xl [&_.ProseMirror_h1]:font-semibold [&_.ProseMirror_h1]:leading-tight [&_.ProseMirror_h1]:my-4
              [&_.ProseMirror_h2]:text-3xl [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h2]:leading-tight [&_.ProseMirror_h2]:my-3
              [&_.ProseMirror_h3]:text-2xl [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_h3]:leading-snug [&_.ProseMirror_h3]:my-3
              [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-6 [&_.ProseMirror_ul]:my-2
              [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-6 [&_.ProseMirror_ol]:my-2
              [&_.ProseMirror_li]:my-1
              [&_.ProseMirror_code]:px-1.5 [&_.ProseMirror_code]:py-0.5 [&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:bg-black/5
              [&_.ProseMirror_a]:text-blue-600 [&_.ProseMirror_a]:underline
              [&_.ProseMirror_blockquote]:border-l-4 [&_.ProseMirror_blockquote]:border-accent-warm/40 [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:my-4 [&_.ProseMirror_blockquote]:text-text-secondary-light [&_.ProseMirror_blockquote]:dark:text-text-secondary-dark [&_.ProseMirror_blockquote]:italic
              [&_.ProseMirror_hr]:my-8 [&_.ProseMirror_hr]:border-border-light [&_.ProseMirror_hr]:dark:border-border-dark
            "
          />
        </motion.div>

        {/* Action Bar */}
        <div className="flex justify-end mt-4 gap-3">
          {/* Manual Save Button */}
          {saveStatus === 'unsaved' && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              onClick={doSave}
              className="flex items-center gap-2 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark text-text-secondary-light dark:text-text-secondary-dark px-6 py-2 rounded-squircle shadow-ambient dark:shadow-ambient-dark"
            >
              <Save className="w-4 h-4" />
              <span className="text-sm font-medium tracking-tight">Save</span>
            </motion.button>
          )}

          {/* AI Assist Button */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            onClick={toggleAIPanel}
            className="flex items-center gap-2 bg-gradient-to-r from-accent-warm to-accent-cool text-white px-6 py-2 rounded-squircle shadow-ambient-lg dark:shadow-ambient-lg-dark"
          >
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-medium tracking-tight">AI Assist</span>
          </motion.button>
        </div>

        {/* Stats Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-6 flex items-center justify-between text-xs text-text-tertiary-light dark:text-text-tertiary-dark"
        >
          <div className="flex items-center gap-4">
            <span>{wordCount} words</span>
            <span>{charCount} characters</span>
          </div>
          <div>
            <span className={saveStatus === 'error' ? 'text-red-500' : ''}>{saveStatusLabel}</span>
          </div>
        </motion.div>
      </motion.div>
    </main>
  );
}
