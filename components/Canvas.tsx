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
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSidebar } from '@/contexts/SidebarContext';
import { useFilePreview } from '@/contexts/FilePreviewContext';
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import BubbleMenuExtension from '@tiptap/extension-bubble-menu';

const springConfig = {
  type: 'spring' as const,
  stiffness: 200,
  damping: 25,
};

export default function Canvas() {
  const [plainText, setPlainText] = useState('');
  const { sidebarWidth } = useSidebar();
  const { previewWidth } = useFilePreview();
  const [showColorPanel, setShowColorPanel] = useState(false);
  const [showHighlightPanel, setShowHighlightPanel] = useState(false);
  const [showHeadingMenu, setShowHeadingMenu] = useState(false);
  const bubbleRef = useRef<HTMLDivElement | null>(null);

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
    content: '<p></p>',
    editorProps: {
      attributes: {
        class:
          'min-h-[500px] w-full bg-transparent outline-none text-lg leading-relaxed tracking-tight text-text-primary-light dark:text-text-primary-dark',
      },
    },
    onUpdate: ({ editor: e }) => {
      setPlainText(e.getText());
    },
  });

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
    const url = window.prompt('输入链接地址 (https://...)', previous || 'https://');
    if (url === null) return;
    if (url.trim() === '') {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  const textColors = ['#2F3437', '#787774', '#9F6B53', '#7A5E3B', '#4F7A57', '#4D6461', '#5B6EAE', '#8B5CF6'];
  const highlightColors = ['#FFF3BF', '#FFE3E3', '#D3F9D8', '#D0EBFF', '#E5DBFF', '#FFE8CC'];
  const currentHeadingLabel = editor?.isActive('heading', { level: 1 })
    ? 'H1'
    : editor?.isActive('heading', { level: 2 })
      ? 'H2'
      : editor?.isActive('heading', { level: 3 })
        ? 'H3'
        : 'Text';

  const turnIntoLabel = editor?.isActive('bulletList')
    ? 'Bulleted list'
    : editor?.isActive('orderedList')
      ? 'Numbered list'
      : editor?.isActive('codeBlock')
        ? 'Code block'
        : currentHeadingLabel === 'Text'
          ? 'Text'
          : currentHeadingLabel;

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
      default:
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
    // Prevent editor blur when clicking bubble controls, otherwise selection is lost.
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
            placeholder="Start writing your thoughts..."
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

        <div className="flex justify-end mt-4">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
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
            <span>{plainText.length} characters</span>
          </div>
          <div>
            <span>Last saved: Just now</span>
          </div>
        </motion.div>
      </motion.div>
    </main>
  );
}
