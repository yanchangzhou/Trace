'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { GripVertical, Plus, Trash2, Copy, ArrowUp, ArrowDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import type { Editor } from '@tiptap/react';

interface BlockMenuProps {
  editor?: Editor | null;
}

export default function BlockMenu({ editor }: BlockMenuProps) {
  const [activeBlockPos, setActiveBlockPos] = useState<number | null>(null);
  const [showActions, setShowActions] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      const { from } = editor.state.selection;
      const resolved = editor.state.doc.resolve(from);
      const blockDepth = resolved.depth;
      const blockPos = resolved.before(blockDepth + 1);
      setActiveBlockPos(blockPos > 0 ? blockPos : null);
    };

    editor.on('selectionUpdate', handler);
    return () => { editor.off('selectionUpdate', handler); };
  }, [editor]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(e.target as Node)) return;
      setShowActions(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const deleteBlock = () => {
    if (!editor || activeBlockPos === null) return;
    const node = editor.state.doc.nodeAt(activeBlockPos);
    if (!node) return;
    editor.chain().focus().deleteRange({ from: activeBlockPos, to: activeBlockPos + node.nodeSize }).run();
    setShowActions(false);
  };

  const duplicateBlock = () => {
    if (!editor || activeBlockPos === null) return;
    const node = editor.state.doc.nodeAt(activeBlockPos);
    if (!node) return;
    editor.chain().focus().insertContentAt(activeBlockPos + node.nodeSize, node.toJSON()).run();
    setShowActions(false);
  };

  const moveBlockUp = () => {
    if (!editor || activeBlockPos === null || activeBlockPos <= 1) return;
    const node = editor.state.doc.nodeAt(activeBlockPos);
    if (!node) return;
    const tr = editor.state.tr;
    tr.delete(activeBlockPos, activeBlockPos + node.nodeSize);
    const resolved = editor.state.doc.resolve(activeBlockPos);
    const prevPos = resolved.before(resolved.depth + 1);
    tr.insert(prevPos > 0 ? prevPos : 0, node);
    editor.view.dispatch(tr);
    setShowActions(false);
  };

  const moveBlockDown = () => {
    if (!editor || activeBlockPos === null) return;
    const node = editor.state.doc.nodeAt(activeBlockPos);
    if (!node) return;
    const tr = editor.state.tr;
    tr.delete(activeBlockPos, activeBlockPos + node.nodeSize);
    const nextPos = Math.min(activeBlockPos + node.nodeSize, editor.state.doc.content.size);
    tr.insert(nextPos, node);
    editor.view.dispatch(tr);
    setShowActions(false);
  };

  if (!editor || activeBlockPos === null) return null;

  const coords = editor.view.coordsAtPos(activeBlockPos);
  const editorRect = editor.view.dom.getBoundingClientRect();

  return (
    <div
      ref={menuRef}
      className="absolute z-30"
      style={{
        left: '-2.5rem',
        top: `${coords.top - editorRect.top + 6}px`,
      }}
    >
      <div className="flex items-center gap-0.5">
        <button
          className="block-drag-handle w-6 h-6 flex items-center justify-center rounded opacity-0 hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-text-tertiary-light dark:text-text-tertiary-dark hover:bg-black/5 dark:hover:bg-white/5"
          style={{ opacity: 1 }}
          draggable
        >
          <GripVertical className="w-4 h-4" />
        </button>

        <button
          onClick={() => setShowActions((v) => !v)}
          className="w-6 h-6 flex items-center justify-center rounded opacity-0 hover:opacity-100 transition-opacity text-text-tertiary-light dark:text-text-tertiary-dark hover:bg-black/5 dark:hover:bg-white/5"
          style={{ opacity: 1 }}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <AnimatePresence>
        {showActions && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute left-6 top-0 ml-2 p-1.5 bg-card-light dark:bg-card-dark rounded-squircle-sm shadow-ambient-lg dark:shadow-ambient-lg-dark border border-border-light dark:border-border-dark min-w-[160px]"
          >
            <button onClick={duplicateBlock} className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-background-light dark:hover:bg-background-dark transition-colors flex items-center gap-2 text-text-secondary-light dark:text-text-secondary-dark">
              <Copy className="w-3.5 h-3.5" /> Duplicate
            </button>
            <button onClick={moveBlockUp} className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-background-light dark:hover:bg-background-dark transition-colors flex items-center gap-2 text-text-secondary-light dark:text-text-secondary-dark">
              <ArrowUp className="w-3.5 h-3.5" /> Move up
            </button>
            <button onClick={moveBlockDown} className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-background-light dark:hover:bg-background-dark transition-colors flex items-center gap-2 text-text-secondary-light dark:text-text-secondary-dark">
              <ArrowDown className="w-3.5 h-3.5" /> Move down
            </button>
            <div className="my-1 border-t border-border-light dark:border-border-dark" />
            <button onClick={deleteBlock} className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-2 text-red-500">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
