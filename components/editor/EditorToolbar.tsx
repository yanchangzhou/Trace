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
  Heading1,
  Heading2,
  Heading3,
  ChevronDown,
  Check,
  Highlighter,
  Palette,
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import type { Editor } from '@tiptap/react';

const textColors = ['#2F3437', '#787774', '#9F6B53', '#7A5E3B', '#4F7A57', '#4D6461', '#5B6EAE', '#8B5CF6'];
const highlightColors = ['#FFF3BF', '#FFE3E3', '#D3F9D8', '#D0EBFF', '#E5DBFF', '#FFE8CC'];

interface EditorToolbarProps {
  editor: Editor | null;
}

export default function EditorToolbar({ editor }: EditorToolbarProps) {
  const [showColorPanel, setShowColorPanel] = useState(false);
  const [showHighlightPanel, setShowHighlightPanel] = useState(false);
  const [showHeadingMenu, setShowHeadingMenu] = useState(false);
  const bubbleRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!editor) return;
    const close = () => {
      setShowColorPanel(false);
      setShowHighlightPanel(false);
      setShowHeadingMenu(false);
    };
    editor.on('selectionUpdate', close);
    editor.on('blur', close);
    return () => {
      editor.off('selectionUpdate', close);
      editor.off('blur', close);
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

  if (!editor) return null;

  const buttonClass = (active = false) =>
    `w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
      active ? 'bg-accent-warm/20 text-text-primary-light' : 'hover:bg-black/5 text-text-secondary-light'
    }`;

  const keepSelectionOnMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const setBlockType = (type: 'paragraph' | 'h1' | 'h2' | 'h3' | 'bullet' | 'ordered' | 'codeBlock') => {
    const chain = editor.chain().focus();
    switch (type) {
      case 'paragraph': chain.clearNodes().setParagraph().run(); break;
      case 'h1': chain.clearNodes().setHeading({ level: 1 }).run(); break;
      case 'h2': chain.clearNodes().setHeading({ level: 2 }).run(); break;
      case 'h3': chain.clearNodes().setHeading({ level: 3 }).run(); break;
      case 'bullet': chain.toggleBulletList().run(); break;
      case 'ordered': chain.toggleOrderedList().run(); break;
      case 'codeBlock': chain.toggleCodeBlock().run(); break;
    }
    setShowHeadingMenu(false);
  };

  const applyLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link URL (https://...)', previous || 'https://');
    if (url === null) return;
    if (url.trim() === '') {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  const turnIntoLabel = editor.isActive('bulletList')
    ? 'Bulleted list'
    : editor.isActive('orderedList')
      ? 'Numbered list'
      : editor.isActive('codeBlock')
        ? 'Code block'
        : editor.isActive('heading', { level: 1 })
          ? 'H1'
          : editor.isActive('heading', { level: 2 })
            ? 'H2'
            : editor.isActive('heading', { level: 3 })
              ? 'H3'
              : 'Text';

  return (
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
        onClick={() => { setShowHeadingMenu((v) => !v); setShowColorPanel(false); setShowHighlightPanel(false); }}
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
          {(['paragraph', 'h1', 'h2', 'h3', 'bullet', 'ordered', 'codeBlock'] as const).map((type) => {
            const isActive =
              type === 'paragraph' ? editor.isActive('paragraph') && !editor.isActive('heading') :
              type === 'h1' ? editor.isActive('heading', { level: 1 }) :
              type === 'h2' ? editor.isActive('heading', { level: 2 }) :
              type === 'h3' ? editor.isActive('heading', { level: 3 }) :
              type === 'bullet' ? editor.isActive('bulletList') :
              type === 'ordered' ? editor.isActive('orderedList') :
              editor.isActive('codeBlock');
            const Icon =
              type === 'h1' ? Heading1 : type === 'h2' ? Heading2 : type === 'h3' ? Heading3 :
              type === 'bullet' ? List : type === 'ordered' ? ListOrdered : type === 'codeBlock' ? Code2 : null;
            const label =
              type === 'paragraph' ? 'Text' : type === 'h1' ? 'Heading 1' : type === 'h2' ? 'Heading 2' :
              type === 'h3' ? 'Heading 3' : type === 'bullet' ? 'Bulleted list' :
              type === 'ordered' ? 'Numbered list' : 'Code block';
            return (
              <button key={type} type="button" onMouseDown={keepSelectionOnMouseDown} onClick={() => setBlockType(type)}
                className="px-2 py-1.5 text-left text-xs rounded hover:bg-black/5 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  {Icon ? <Icon className="w-3.5 h-3.5" /> : <span className="w-3.5 text-center">T</span>}
                  {label}
                </span>
                {isActive && <Check className="w-3.5 h-3.5 text-accent-warm" />}
              </button>
            );
          })}
        </div>
      )}

      {showColorPanel && (
        <div className="absolute left-0 top-full mt-2 p-2 bg-white rounded-lg border border-border-light shadow-md flex items-center gap-1">
          {textColors.map((color) => (
            <button key={color} type="button" onMouseDown={keepSelectionOnMouseDown}
              onClick={() => { editor.chain().focus().setColor(color).run(); setShowColorPanel(false); }}
              className="w-5 h-5 rounded-full border border-black/10" style={{ backgroundColor: color }} />
          ))}
          <button type="button" onMouseDown={keepSelectionOnMouseDown}
            onClick={() => { editor.chain().focus().unsetColor().run(); setShowColorPanel(false); }}
            className="ml-1 px-1.5 py-0.5 text-[10px] rounded border border-border-light hover:bg-black/5">Clear</button>
        </div>
      )}

      {showHighlightPanel && (
        <div className="absolute left-10 top-full mt-2 p-2 bg-white rounded-lg border border-border-light shadow-md flex items-center gap-1">
          {highlightColors.map((color) => (
            <button key={color} type="button" onMouseDown={keepSelectionOnMouseDown}
              onClick={() => { editor.chain().focus().setHighlight({ color }).run(); setShowHighlightPanel(false); }}
              className="w-5 h-5 rounded-full border border-black/10" style={{ backgroundColor: color }} />
          ))}
          <button type="button" onMouseDown={keepSelectionOnMouseDown}
            onClick={() => { editor.chain().focus().unsetHighlight().run(); setShowHighlightPanel(false); }}
            className="ml-1 px-1.5 py-0.5 text-[10px] rounded border border-border-light hover:bg-black/5">Clear</button>
        </div>
      )}
    </motion.div>
  );
}
