'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Link2,
  Code2,
  Sparkles,
  Heading1,
  Heading2,
  Heading3,
  ChevronDown,
  Check,
  Highlighter,
  Palette,
  Plus,
  FileText,
  X,
  Loader2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useSidebar } from '@/contexts/SidebarContext';
import { useFilePreview } from '@/contexts/FilePreviewContext';
import { useBook } from '@/contexts/BookContext';
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import BubbleMenuExtension from '@tiptap/extension-bubble-menu';
import {
  createNote,
  updateNote,
  getNote,
  listNotesByBook,
  buildAiContext,
  generateWithContext,
  type Note,
} from '@/lib/tauri';

const springConfig = {
  type: 'spring' as const,
  stiffness: 200,
  damping: 25,
};

export default function Canvas() {
  const [plainText, setPlainText] = useState('');
  const { sidebarWidth } = useSidebar();
  const { previewWidth } = useFilePreview();
  const { currentBook, isTauri } = useBook();
  const [showColorPanel, setShowColorPanel] = useState(false);
  const [showHighlightPanel, setShowHighlightPanel] = useState(false);
  const [showHeadingMenu, setShowHeadingMenu] = useState(false);
  const bubbleRef = useRef<HTMLDivElement | null>(null);

  // ── Note state ──
  const [notes, setNotes] = useState<Note[]>([]);
  const [currentNoteId, setCurrentNoteId] = useState<number | null>(null);
  const [currentNoteTitle, setCurrentNoteTitle] = useState('Untitled');
  const [showNoteList, setShowNoteList] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResult, setAiResult] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isNewNoteRef = useRef(false);

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
      BubbleMenuExtension.configure({
        shouldShow: ({ editor: e, state }) => {
          const { from, to, empty } = state.selection;
          const hasText = e.state.doc.textBetween(from, to, ' ').trim().length > 0;
          return e.isFocused && !empty && hasText;
        },
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class:
          'min-h-[500px] w-full bg-transparent outline-none text-lg leading-relaxed tracking-tight text-text-primary-light dark:text-text-primary-dark',
      },
    },
    onUpdate: ({ editor: e }) => {
      const text = e.getText();
      setPlainText(text);
      // Debounced auto-save
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveCurrentNote(e.getHTML(), text);
      }, 1500);
    },
  });

  // ── Load notes for current book ──
  useEffect(() => {
    if (!currentBook) return;
    const loadNotes = async () => {
      if (!isTauri) {
        // Browser mode: no persistence
        setNotes([]);
        setCurrentNoteId(null);
        return;
      }
      try {
        // Map frontend book id to backend book id
        const bookId = Number(currentBook.id);
        if (isNaN(bookId)) {
          setNotes([]);
          return;
        }
        const bookNotes = await listNotesByBook(bookId);
        setNotes(bookNotes);
        if (bookNotes.length > 0 && currentNoteId == null) {
          // Auto-select first note
          const note = bookNotes[0];
          setCurrentNoteId(note.id);
          setCurrentNoteTitle(note.title);
          editor?.commands.setContent(note.content_json);
        }
      } catch (error) {
        console.error('Failed to load notes:', error);
      }
    };
    loadNotes();
  }, [currentBook, isTauri]);

  // ── Save current note ──
  const saveCurrentNote = useCallback(
    async (html: string, text: string) => {
      if (!isTauri || !currentBook) return;

      const bookId = Number(currentBook.id);
      if (isNaN(bookId)) return;

      try {
        setIsSaving(true);
        if (currentNoteId != null && !isNewNoteRef.current) {
          // Update existing note
          const note: Note = {
            id: currentNoteId,
            book_id: bookId,
            title: currentNoteTitle,
            content_json: html,
            plain_text: text,
            created_at: '',
            updated_at: new Date().toISOString(),
          };
          await updateNote(note);
        } else if (currentNoteId != null && isNewNoteRef.current) {
          // Update the just-created note (use update instead of create again)
          isNewNoteRef.current = false;
          const note: Note = {
            id: currentNoteId,
            book_id: bookId,
            title: currentNoteTitle,
            content_json: html,
            plain_text: text,
            created_at: '',
            updated_at: new Date().toISOString(),
          };
          await updateNote(note);
        }
        setLastSaved(new Date().toLocaleTimeString());
      } catch (error) {
        console.error('Failed to save note:', error);
      } finally {
        setIsSaving(false);
      }
    },
    [isTauri, currentBook, currentNoteId, currentNoteTitle]
  );

  // ── Create new note ──
  const handleNewNote = async () => {
    if (!isTauri || !currentBook) return;

    const bookId = Number(currentBook.id);
    if (isNaN(bookId)) return;

    // Save current note first
    if (currentNoteId != null && editor) {
      const html = editor.getHTML();
      const text = editor.getText();
      await saveCurrentNote(html, text);
    }

    try {
      const title = `Note ${notes.length + 1}`;
      const now = new Date().toISOString();
      const newId = await createNote(bookId, title, '<p></p>', '');

      // Refresh note list
      const bookNotes = await listNotesByBook(bookId);
      setNotes(bookNotes);

      setCurrentNoteId(newId);
      setCurrentNoteTitle(title);
      isNewNoteRef.current = true;
      editor?.commands.setContent('<p></p>');
      setLastSaved(null);
    } catch (error) {
      console.error('Failed to create note:', error);
    }
  };

  // ── Select a note ──
  const handleSelectNote = async (noteId: number) => {
    // Save current note first
    if (currentNoteId != null && editor && !isNewNoteRef.current) {
      const html = editor.getHTML();
      const text = editor.getText();
      await saveCurrentNote(html, text);
    }

    if (isTauri) {
      try {
        const note = await getNote(noteId);
        setCurrentNoteId(note.id);
        setCurrentNoteTitle(note.title);
        isNewNoteRef.current = false;
        editor?.commands.setContent(note.content_json || '<p></p>');
        setLastSaved(null);
      } catch (error) {
        console.error('Failed to load note:', error);
      }
    }
    setShowNoteList(false);
  };

  // ── AI Assist ──
  const handleAiAssist = async () => {
    if (!isTauri) {
      alert('AI Assist requires the Tauri desktop app with notes and sources configured.');
      return;
    }
    if (!currentNoteId) {
      // Create a note first if none exists
      await handleNewNote();
    }

    setShowAiModal(true);
    setAiPrompt('');
    setAiResult('');

    // Pre-build context
    if (currentNoteId != null) {
      try {
        const context = await buildAiContext(currentNoteId);
        if (context.trim()) {
          setAiPrompt(`Use the following source materials:\n\n${context}`);
        }
      } catch {
        // no sources yet
      }
    }
  };

  const handleGenerate = async () => {
    if (!currentNoteId || !aiPrompt.trim() || !isTauri) return;

    setIsAiLoading(true);
    setAiResult('');

    try {
      const result = await generateWithContext(currentNoteId, aiPrompt);
      setAiResult(result);
    } catch (error) {
      console.error('AI generation failed:', error);
      setAiResult('Error: Failed to generate. Make sure sources are attached to this note.');
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleInsertAiResult = () => {
    if (editor && aiResult) {
      editor.commands.insertContent(aiResult);
      setShowAiModal(false);
      setAiResult('');
    }
  };

  const wordCount = useMemo(() => plainText.split(/\s+/).filter(Boolean).length, [plainText]);

  const setHeading = (level: 0 | 1 | 2 | 3) => {
    if (!editor) return;
    if (level === 0) {
      editor.chain().focus().setParagraph().run();
      return;
    }
    editor.chain().focus().toggleHeading({ level }).run();
    setShowHeadingMenu(false);
  };

  const applyLink = () => {
    if (!editor) return;
    const previous = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link URL (https://...)', previous || 'https://');
    if (url === null) return;
    if (url.trim() === '') {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  const textColors = ['#2F3437', '#787774', '#9F6B53', '#7A5E3B', '#4F7A57', '#4D6461', '#5B6EAE', '#8B5CF6'];
  const highlightColors = ['#FFF3BF', '#FFE3E3', '#D3F9D8', '#D0EBFF', '#E5DBFF', '#FFE8CC'];

  const turnIntoLabel = editor?.isActive('bulletList')
    ? 'Bulleted list'
    : editor?.isActive('orderedList')
      ? 'Numbered list'
      : editor?.isActive('codeBlock')
        ? 'Code block'
        : editor?.isActive('heading', { level: 1 })
          ? 'H1'
          : editor?.isActive('heading', { level: 2 })
            ? 'H2'
            : editor?.isActive('heading', { level: 3 })
              ? 'H3'
              : 'Text';

  const setBlockType = (type: 'paragraph' | 'h1' | 'h2' | 'h3' | 'bullet' | 'ordered' | 'codeBlock') => {
    if (!editor) return;
    const chain = editor.chain().focus();
    switch (type) {
      case 'paragraph':
        chain.clearNodes().setParagraph().run();
        break;
      case 'h1':
        chain.clearNodes().setHeading({ level: 1 }).run();
        break;
      case 'h2':
        chain.clearNodes().setHeading({ level: 2 }).run();
        break;
      case 'h3':
        chain.clearNodes().setHeading({ level: 3 }).run();
        break;
      case 'bullet':
        chain.toggleBulletList().run();
        break;
      case 'ordered':
        chain.toggleOrderedList().run();
        break;
      case 'codeBlock':
        chain.toggleCodeBlock().run();
        break;
    }
    setShowHeadingMenu(false);
  };

  useEffect(() => {
    if (!editor) return;
    const closePanels = () => {
      setShowColorPanel(false);
      setShowHighlightPanel(false);
      setShowHeadingMenu(false);
    };
    editor.on('selectionUpdate', closePanels);
    editor.on('blur', closePanels);
    return () => {
      editor.off('selectionUpdate', closePanels);
      editor.off('blur', closePanels);
    };
  }, [editor]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!bubbleRef.current) return;
      if (bubbleRef.current.contains(e.target as Node)) return;
      setShowColorPanel(false);
      setShowHighlightPanel(false);
      setShowHeadingMenu(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const buttonClass = (active = false) =>
    `w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
      active ? 'bg-accent-warm/20 text-text-primary-light' : 'hover:bg-black/5 text-text-secondary-light'
    }`;

  const keepSelectionOnMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
  };

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
        className="max-w-4xl mx-auto px-8 py-12"
      >
        {/* Note Tabs Bar */}
        {isTauri && (
          <div className="flex items-center gap-2 mb-6">
            <div className="flex-1 flex items-center gap-1 overflow-x-auto">
              {notes.map((note) => (
                <button
                  key={note.id}
                  onClick={() => handleSelectNote(note.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                    currentNoteId === note.id
                      ? 'bg-accent-warm/15 text-accent-warm font-medium'
                      : 'hover:bg-card-light dark:hover:bg-card-dark text-text-secondary-light dark:text-text-secondary-dark'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  {note.title}
                </button>
              ))}
            </div>
            <button
              onClick={handleNewNote}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-accent-warm/10 text-accent-warm hover:bg-accent-warm/20 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              New Note
            </button>
          </div>
        )}

        {/* Writing Area */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ ...springConfig, delay: 0.2 }}
          className="bg-card-light dark:bg-card-dark rounded-squircle-lg p-12 shadow-ambient dark:shadow-ambient-dark min-h-[600px]"
        >
          {editor && (
            <BubbleMenu
              editor={editor}
              options={{ placement: 'top' }}
              updateDelay={80}
              appendTo={() => document.body}
            >
              <AnimatePresence>
                <motion.div
                  ref={bubbleRef}
                  onMouseDown={keepSelectionOnMouseDown}
                  initial={{ opacity: 0, scale: 0.96, y: 6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: 6 }}
                  transition={{ duration: 0.14 }}
                  className="relative z-[200] flex items-center gap-1 p-1.5 rounded-lg border border-border-light/60 bg-[#FBFBFB] shadow-[0_10px_28px_rgba(15,23,42,0.16)]"
                >
                  <button type="button" onMouseDown={keepSelectionOnMouseDown} onClick={() => editor.chain().focus().toggleBold().run()} className={buttonClass(editor.isActive('bold'))}>
                    <Bold className="w-4 h-4" />
                  </button>
                  <button type="button" onMouseDown={keepSelectionOnMouseDown} onClick={() => editor.chain().focus().toggleItalic().run()} className={buttonClass(editor.isActive('italic'))}>
                    <Italic className="w-4 h-4" />
                  </button>
                  <button type="button" onMouseDown={keepSelectionOnMouseDown} onClick={() => editor.chain().focus().toggleUnderline().run()} className={buttonClass(editor.isActive('underline'))}>
                    <UnderlineIcon className="w-4 h-4" />
                  </button>
                  <button type="button" onMouseDown={keepSelectionOnMouseDown} onClick={() => editor.chain().focus().toggleStrike().run()} className={buttonClass(editor.isActive('strike'))}>
                    <Strikethrough className="w-4 h-4" />
                  </button>

                  <div className="w-px h-5 bg-border-light mx-1" />

                  <button
                    type="button"
                    onMouseDown={keepSelectionOnMouseDown}
                    onClick={() => {
                      setShowHeadingMenu((v) => !v);
                      setShowColorPanel(false);
                      setShowHighlightPanel(false);
                    }}
                    className="h-8 px-2 rounded-md flex items-center gap-1 hover:bg-black/5 text-xs font-medium min-w-[112px] justify-between"
                  >
                    <span className="truncate">{turnIntoLabel}</span>
                    <ChevronDown className="w-3 h-3" />
                  </button>

                  <div className="w-px h-5 bg-border-light mx-1" />

                  <button type="button" onMouseDown={keepSelectionOnMouseDown} onClick={() => editor.chain().focus().toggleBulletList().run()} className={buttonClass(editor.isActive('bulletList'))}>
                    <List className="w-4 h-4" />
                  </button>
                  <button type="button" onMouseDown={keepSelectionOnMouseDown} onClick={() => editor.chain().focus().toggleOrderedList().run()} className={buttonClass(editor.isActive('orderedList'))}>
                    <ListOrdered className="w-4 h-4" />
                  </button>
                  <button type="button" onMouseDown={keepSelectionOnMouseDown} onClick={() => editor.chain().focus().toggleCode().run()} className={buttonClass(editor.isActive('code'))}>
                    <Code2 className="w-4 h-4" />
                  </button>
                  <button type="button" onMouseDown={keepSelectionOnMouseDown} onClick={applyLink} className={buttonClass(editor.isActive('link'))}>
                    <Link2 className="w-4 h-4" />
                  </button>

                  <div className="w-px h-5 bg-border-light mx-1" />

                  <button type="button" onMouseDown={keepSelectionOnMouseDown} onClick={() => { setShowColorPanel((v) => !v); setShowHighlightPanel(false); setShowHeadingMenu(false); }} className={buttonClass(false)}>
                    <Palette className="w-4 h-4" />
                  </button>
                  <button type="button" onMouseDown={keepSelectionOnMouseDown} onClick={() => { setShowHighlightPanel((v) => !v); setShowColorPanel(false); setShowHeadingMenu(false); }} className={buttonClass(false)}>
                    <Highlighter className="w-4 h-4" />
                  </button>

                  {showHeadingMenu && (
                    <div className="absolute left-0 top-full mt-2 p-1.5 bg-white rounded-lg border border-border-light shadow-md flex flex-col min-w-[210px]">
                      <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-text-tertiary-light">Turn into</div>
                      <button type="button" onMouseDown={keepSelectionOnMouseDown} onClick={() => setBlockType('paragraph')} className="px-2 py-1.5 text-left text-xs rounded hover:bg-black/5 flex items-center justify-between gap-2"><span className="flex items-center gap-2"><span className="w-4 text-center">T</span>Text</span>{editor?.isActive('paragraph') && <Check className="w-3.5 h-3.5 text-accent-warm" />}</button>
                      <button type="button" onMouseDown={keepSelectionOnMouseDown} onClick={() => setBlockType('h1')} className="px-2 py-1.5 text-left text-xs rounded hover:bg-black/5 flex items-center justify-between gap-2"><span className="flex items-center gap-2"><Heading1 className="w-3.5 h-3.5" />Heading 1</span>{editor?.isActive('heading', { level: 1 }) && <Check className="w-3.5 h-3.5 text-accent-warm" />}</button>
                      <button type="button" onMouseDown={keepSelectionOnMouseDown} onClick={() => setBlockType('h2')} className="px-2 py-1.5 text-left text-xs rounded hover:bg-black/5 flex items-center justify-between gap-2"><span className="flex items-center gap-2"><Heading2 className="w-3.5 h-3.5" />Heading 2</span>{editor?.isActive('heading', { level: 2 }) && <Check className="w-3.5 h-3.5 text-accent-warm" />}</button>
                      <button type="button" onMouseDown={keepSelectionOnMouseDown} onClick={() => setBlockType('h3')} className="px-2 py-1.5 text-left text-xs rounded hover:bg-black/5 flex items-center justify-between gap-2"><span className="flex items-center gap-2"><Heading3 className="w-3.5 h-3.5" />Heading 3</span>{editor?.isActive('heading', { level: 3 }) && <Check className="w-3.5 h-3.5 text-accent-warm" />}</button>
                      <div className="my-1 border-t border-border-light" />
                      <button type="button" onMouseDown={keepSelectionOnMouseDown} onClick={() => setBlockType('bullet')} className="px-2 py-1.5 text-left text-xs rounded hover:bg-black/5 flex items-center justify-between gap-2"><span className="flex items-center gap-2"><List className="w-3.5 h-3.5" />Bulleted list</span>{editor?.isActive('bulletList') && <Check className="w-3.5 h-3.5 text-accent-warm" />}</button>
                      <button type="button" onMouseDown={keepSelectionOnMouseDown} onClick={() => setBlockType('ordered')} className="px-2 py-1.5 text-left text-xs rounded hover:bg-black/5 flex items-center justify-between gap-2"><span className="flex items-center gap-2"><ListOrdered className="w-3.5 h-3.5" />Numbered list</span>{editor?.isActive('orderedList') && <Check className="w-3.5 h-3.5 text-accent-warm" />}</button>
                      <button type="button" onMouseDown={keepSelectionOnMouseDown} onClick={() => setBlockType('codeBlock')} className="px-2 py-1.5 text-left text-xs rounded hover:bg-black/5 flex items-center justify-between gap-2"><span className="flex items-center gap-2"><Code2 className="w-3.5 h-3.5" />Code block</span>{editor?.isActive('codeBlock') && <Check className="w-3.5 h-3.5 text-accent-warm" />}</button>
                    </div>
                  )}

                  {showColorPanel && (
                    <div className="absolute left-0 top-full mt-2 p-2 bg-white rounded-lg border border-border-light shadow-md flex items-center gap-1">
                      {textColors.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onMouseDown={keepSelectionOnMouseDown}
                          onClick={() => {
                            editor.chain().focus().setColor(color).run();
                            setShowColorPanel(false);
                          }}
                          className="w-5 h-5 rounded-full border border-black/10"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                      <button
                        type="button"
                        onMouseDown={keepSelectionOnMouseDown}
                        onClick={() => {
                          editor.chain().focus().unsetColor().run();
                          setShowColorPanel(false);
                        }}
                        className="ml-1 px-1.5 py-0.5 text-[10px] rounded border border-border-light hover:bg-black/5"
                      >
                        Clear
                      </button>
                    </div>
                  )}

                  {showHighlightPanel && (
                    <div className="absolute left-10 top-full mt-2 p-2 bg-white rounded-lg border border-border-light shadow-md flex items-center gap-1">
                      {highlightColors.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onMouseDown={keepSelectionOnMouseDown}
                          onClick={() => {
                            editor.chain().focus().setHighlight({ color }).run();
                            setShowHighlightPanel(false);
                          }}
                          className="w-5 h-5 rounded-full border border-black/10"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                      <button
                        type="button"
                        onMouseDown={keepSelectionOnMouseDown}
                        onClick={() => {
                          editor.chain().focus().unsetHighlight().run();
                          setShowHighlightPanel(false);
                        }}
                        className="ml-1 px-1.5 py-0.5 text-[10px] rounded border border-border-light hover:bg-black/5"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </BubbleMenu>
          )}

          <EditorContent
            editor={editor}
            className="
              [&_.ProseMirror]:outline-none
              [&_.ProseMirror_p]:my-2
              [&_.ProseMirror_h1]:text-4xl [&_.ProseMirror_h1]:font-semibold [&_.ProseMirror_h1]:leading-tight [&_.ProseMirror_h1]:my-4
              [&_.ProseMirror_h2]:text-3xl [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h2]:leading-tight [&_.ProseMirror_h2]:my-3
              [&_.ProseMirror_h3]:text-2xl [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_h3]:leading-snug [&_.ProseMirror_h3]:my-3
              [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-6 [&_.ProseMirror_ul]:my-2
              [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-6 [&_.ProseMirror_ol]:my-2
              [&_.ProseMirror_li]:my-1
              [&_.ProseMirror_code]:px-1.5 [&_.ProseMirror_code]:py-0.5 [&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:bg-black/5
              [&_.ProseMirror_a]:text-blue-600 [&_.ProseMirror_a]:underline
            "
          />
        </motion.div>

        {/* Action Buttons */}
        <div className="flex justify-end mt-4 gap-3">
          {isTauri && currentNoteId && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              onClick={handleAiAssist}
              className="flex items-center gap-2 bg-gradient-to-r from-accent-warm to-accent-cool text-white px-6 py-2 rounded-squircle shadow-ambient-lg dark:shadow-ambient-lg-dark"
            >
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-medium tracking-tight">AI Assist</span>
            </motion.button>
          )}
          {!isTauri && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="flex items-center gap-2 bg-gradient-to-r from-accent-warm to-accent-cool text-white px-6 py-2 rounded-squircle shadow-ambient-lg dark:shadow-ambient-lg-dark"
            >
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-medium tracking-tight">AI Assist</span>
            </motion.button>
          )}
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
            <span>{plainText.length} characters</span>
            {isSaving && (
              <span className="text-accent-warm animate-pulse">Saving...</span>
            )}
          </div>
          <div>
            <span>
              {lastSaved ? `Last saved: ${lastSaved}` : '---'}
            </span>
          </div>
        </motion.div>
      </motion.div>

      {/* AI Assist Modal */}
      <AnimatePresence>
        {showAiModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100]"
            onClick={() => setShowAiModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-surface-light dark:bg-surface-dark rounded-squircle-lg p-8 w-full max-w-2xl mx-4 shadow-ambient-lg dark:shadow-ambient-lg-dark max-h-[80vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-text-primary-light dark:text-text-primary-dark flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-accent-warm" />
                  AI Writing Assistant
                </h2>
                <button
                  onClick={() => setShowAiModal(false)}
                  className="w-8 h-8 rounded-lg hover:bg-background-light dark:hover:bg-background-dark flex items-center justify-center"
                >
                  <X className="w-4 h-4 text-text-secondary-light dark:text-text-secondary-dark" />
                </button>
              </div>

              {/* Prompt Input */}
              <div className="mb-4">
                <label className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark mb-2 block">
                  What do you want to write about?
                </label>
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Describe what you want the AI to help with..."
                  rows={4}
                  className="w-full px-4 py-3 rounded-squircle bg-background-light dark:bg-background-dark text-text-primary-light dark:text-text-primary-dark placeholder-text-tertiary-light dark:placeholder-text-tertiary-dark border border-border-light dark:border-border-dark focus:outline-none focus:ring-2 focus:ring-accent-warm resize-none"
                />
              </div>

              {/* Generate Button */}
              <button
                onClick={handleGenerate}
                disabled={isAiLoading || !aiPrompt.trim()}
                className="w-full py-3 rounded-squircle bg-accent-warm text-white font-medium hover:bg-accent-warm/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isAiLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate
                  </>
                )}
              </button>

              {/* Result */}
              {aiResult && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-6"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-text-primary-light dark:text-text-primary-dark">
                      Generated Response
                    </h3>
                    <button
                      onClick={handleInsertAiResult}
                      className="px-3 py-1.5 rounded-lg bg-accent-warm/10 text-accent-warm text-sm font-medium hover:bg-accent-warm/20 transition-colors"
                    >
                      Insert into Editor
                    </button>
                  </div>
                  <div className="bg-card-light dark:bg-card-dark rounded-squircle p-4 text-sm text-text-primary-light dark:text-text-primary-dark leading-relaxed whitespace-pre-wrap">
                    {aiResult}
                  </div>
                </motion.div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
