'use client';

import { motion, AnimatePresence } from 'framer-motion';
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Code2,
  Quote,
  Minus,
  Sparkles,
  FileText,
  GitCompare,
  ListTodo,
} from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { Editor } from '@tiptap/react';

interface SlashItem {
  key: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  category: 'block' | 'ai';
  action: (editor: Editor) => void;
}

const slashItems: SlashItem[] = [
  { key: 'h1', label: 'Heading 1', description: 'Large section heading', icon: Heading1, category: 'block',
    action: (e) => e.chain().focus().setHeading({ level: 1 }).run() },
  { key: 'h2', label: 'Heading 2', description: 'Medium section heading', icon: Heading2, category: 'block',
    action: (e) => e.chain().focus().setHeading({ level: 2 }).run() },
  { key: 'h3', label: 'Heading 3', description: 'Small section heading', icon: Heading3, category: 'block',
    action: (e) => e.chain().focus().setHeading({ level: 3 }).run() },
  { key: 'bullet', label: 'Bulleted list', description: 'Simple bullet list', icon: List, category: 'block',
    action: (e) => e.chain().focus().toggleBulletList().run() },
  { key: 'ordered', label: 'Numbered list', description: 'Ordered list with numbers', icon: ListOrdered, category: 'block',
    action: (e) => e.chain().focus().toggleOrderedList().run() },
  { key: 'code', label: 'Code block', description: 'Code snippet with syntax', icon: Code2, category: 'block',
    action: (e) => e.chain().focus().toggleCodeBlock().run() },
  { key: 'quote', label: 'Blockquote', description: 'Quoted text block', icon: Quote, category: 'block',
    action: (e) => e.chain().focus().toggleBlockquote().run() },
  { key: 'divider', label: 'Divider', description: 'Horizontal rule', icon: Minus, category: 'block',
    action: (e) => e.chain().focus().setHorizontalRule().run() },
  { key: 'summarize', label: 'Summarize document', description: 'AI summary of selected sources', icon: FileText, category: 'ai',
    action: () => {} },
  { key: 'compare', label: 'Compare documents', description: 'AI comparison of two sources', icon: GitCompare, category: 'ai',
    action: () => {} },
  { key: 'outline', label: 'Generate outline', description: 'AI outline based on sources', icon: ListTodo, category: 'ai',
    action: () => {} },
];

interface SlashMenuProps {
  editor: Editor;
  isOpen: boolean;
  onClose: () => void;
  onAIAction?: (action: string) => void;
}

export default function SlashMenu({ editor, isOpen, onClose, onAIAction }: SlashMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filter, setFilter] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const filteredItems = slashItems.filter(
    (item) =>
      !filter || item.label.toLowerCase().includes(filter.toLowerCase()),
  );

  const executeAction = useCallback((item: SlashItem) => {
    if (item.category === 'ai') {
      onAIAction?.(item.key);
    } else {
      // Delete the "/" character before transforming
      const { from } = editor.state.selection;
      const resolved = editor.state.doc.resolve(from);
      const nodeBefore = resolved.nodeBefore;
      if (nodeBefore && nodeBefore.text?.endsWith('/')) {
        editor.chain().focus().deleteRange({ from: from - 1, to: from }).run();
      }
      item.action(editor);
    }
    onClose();
  }, [editor, onClose, onAIAction]);

  // Update position based on cursor
  useEffect(() => {
    if (!isOpen) return;
    const { view } = editor;
    const { from } = view.state.selection;
    const coords = view.coordsAtPos(from);
    const editorElement = view.dom.closest('.editor-shell');
    if (editorElement) {
      const rect = editorElement.getBoundingClientRect();
      setPosition({
        top: coords.bottom - rect.top + 8,
        left: coords.left - rect.left,
      });
    } else {
      setPosition({ top: coords.bottom, left: coords.left });
    }
  }, [isOpen, editor]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, Math.max(0, filteredItems.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        executeAction(filteredItems[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, [isOpen, filteredItems, selectedIndex, executeAction, onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filter]);

  // Read current filter text
  useEffect(() => {
    if (!isOpen) {
      setFilter('');
      setSelectedIndex(0);
      return;
    }
    const { from } = editor.state.selection;
    const node = editor.state.doc.resolve(from).nodeBefore;
    const text = node?.text || '';
    const slashIdx = text.lastIndexOf('/');
    if (slashIdx >= 0) {
      setFilter(text.slice(slashIdx + 1));
    }
  }, [isOpen, editor.state]);

  // Listen for further typing
  useEffect(() => {
    if (!isOpen) return;
    const handler = () => {
      const { from } = editor.state.selection;
      const node = editor.state.doc.resolve(from).nodeBefore;
      const text = node?.text || '';
      const slashIdx = text.lastIndexOf('/');
      if (slashIdx >= 0) {
        setFilter(text.slice(slashIdx + 1));
      }
    };
    editor.on('update', handler);
    return () => { editor.off('update', handler); };
  }, [isOpen, editor]);

  const blockItems = filteredItems.filter((i) => i.category === 'block');
  const aiItems = filteredItems.filter((i) => i.category === 'ai');

  if (!isOpen || filteredItems.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="absolute z-[250] w-64"
      style={{ top: position.top, left: position.left }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: -8 }}
        transition={{ duration: 0.12 }}
        className="bg-card-light dark:bg-card-dark rounded-squircle-sm shadow-ambient-lg dark:shadow-ambient-lg-dark border border-border-light dark:border-border-dark overflow-hidden"
      >
        {filter && (
          <div className="px-3 py-2 border-b border-border-light dark:border-border-dark">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter commands..."
              autoFocus
              className="w-full bg-transparent border-none outline-none text-sm text-text-primary-light dark:text-text-primary-dark placeholder:text-text-tertiary-light"
            />
          </div>
        )}

        <div className="py-1 max-h-[320px] overflow-y-auto">
          {blockItems.length > 0 && (
            <>
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-text-tertiary-light dark:text-text-tertiary-dark">
                Blocks
              </div>
              {blockItems.map((item, idx) => {
                const globalIdx = filteredItems.indexOf(item);
                return (
                  <button
                    key={item.key}
                    className={`w-full text-left px-3 py-2 flex items-center gap-3 transition-colors ${
                      selectedIndex === globalIdx
                        ? 'bg-surface-light dark:bg-surface-dark'
                        : 'hover:bg-background-light/50 dark:hover:bg-background-dark/50'
                    }`}
                    onMouseEnter={() => setSelectedIndex(globalIdx)}
                    onClick={() => executeAction(item)}
                  >
                    <item.icon className="w-4 h-4 text-text-secondary-light dark:text-text-secondary-dark flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark truncate">
                        {item.label}
                      </p>
                      <p className="text-xs text-text-tertiary-light dark:text-text-tertiary-dark truncate">
                        {item.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </>
          )}

          {aiItems.length > 0 && blockItems.length > 0 && (
            <div className="my-1 border-t border-border-light dark:border-border-dark" />
          )}

          {aiItems.length > 0 && (
            <>
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-text-tertiary-light dark:text-text-tertiary-dark">
                AI Actions
              </div>
              {aiItems.map((item, idx) => {
                const globalIdx = filteredItems.indexOf(item);
                return (
                  <button
                    key={item.key}
                    className={`w-full text-left px-3 py-2 flex items-center gap-3 transition-colors ${
                      selectedIndex === globalIdx
                        ? 'bg-surface-light dark:bg-surface-dark'
                        : 'hover:bg-background-light/50 dark:hover:bg-background-dark/50'
                    }`}
                    onMouseEnter={() => setSelectedIndex(globalIdx)}
                    onClick={() => executeAction(item)}
                  >
                    <item.icon className="w-4 h-4 text-accent-warm flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark truncate">
                        {item.label}
                      </p>
                      <p className="text-xs text-text-tertiary-light dark:text-text-tertiary-dark truncate">
                        {item.description}
                      </p>
                    </div>
                    <Sparkles className="w-3 h-3 text-accent-warm ml-auto flex-shrink-0" />
                  </button>
                );
              })}
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
