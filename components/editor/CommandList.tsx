'use client';

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { Editor } from '@tiptap/react';
import type { CommandItem } from './commands';

interface CommandListProps {
  editor?: Editor | null;
  items: CommandItem[];
  command: (item: CommandItem) => void;
  clientRect?: (() => DOMRect | null) | null;
}

export default function CommandList({
  editor,
  items,
  command,
  clientRect,
}: CommandListProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  // Reset selection when items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  // Calculate position from cursor
  useEffect(() => {
    if (!clientRect) return;
    const rect = clientRect();
    if (!rect) return;

    const menuHeight = 340;
    const menuWidth = 272;
    const gap = 8;

    let top = rect.bottom + gap;
    let left = rect.left;

    // Viewport boundary detection: flip above cursor if too close to bottom
    if (top + menuHeight > window.innerHeight) {
      top = rect.top - menuHeight - gap;
    }

    // Shift left if too close to right edge
    if (left + menuWidth > window.innerWidth) {
      left = window.innerWidth - menuWidth - 8;
    }

    // Clamp to viewport
    left = Math.max(8, left);
    top = Math.max(8, top);

    setPosition({ top, left });
  }, [clientRect, items]);

  // Keyboard navigation via capture-phase document listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) =>
          Math.min(prev + 1, Math.max(0, items.length - 1)),
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (items[selectedIndex]) {
          command(items[selectedIndex]);
        }
      }
      // Escape is intentionally not handled here; it bubbles to the
      // editor so the suggestion plugin can call onExit.
    };

    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [items, selectedIndex, command]);

  const blockItems = useMemo(
    () => items.filter((i) => i.category === 'block'),
    [items],
  );
  const aiItems = useMemo(
    () => items.filter((i) => i.category === 'ai'),
    [items],
  );

  if (!position) return null;

  return (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.96, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: -8 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="fixed z-[250] w-64 bg-white rounded-xl shadow-2xl border border-[#E8E5E1] overflow-hidden"
      style={{ top: position.top, left: position.left }}
    >
      <div className="py-1 max-h-[320px] overflow-y-auto">
        {blockItems.length > 0 && (
          <>
            <div className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-[#9C958D]">
              文本格式
            </div>
            {blockItems.map((item) => {
              const idx = items.indexOf(item);
              const isSelected = selectedIndex === idx;
              return (
                <button
                  key={item.key}
                  className={`w-full text-left px-3 py-2 flex items-center gap-3 text-sm transition-colors ${
                    isSelected
                      ? 'bg-[#F7F5F2] text-[#2D2A27]'
                      : 'text-[#6B625A] hover:bg-[#F7F5F2] hover:text-[#2D2A27]'
                  }`}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => command(item)}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-[#2D2A27] truncate">
                      {item.label}
                    </p>
                    <p className="text-xs text-[#9C958D] truncate">
                      {item.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </>
        )}

        {aiItems.length > 0 && blockItems.length > 0 && (
          <div className="my-1 border-t border-[#E8E5E1]" />
        )}

        {aiItems.length > 0 && (
          <>
            <div className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-[#9C958D]">
              AI 操作
            </div>
            {aiItems.map((item) => {
              const idx = items.indexOf(item);
              const isSelected = selectedIndex === idx;
              return (
                <button
                  key={item.key}
                  className={`w-full text-left px-3 py-2 flex items-center gap-3 text-sm transition-colors ${
                    isSelected
                      ? 'bg-[#F7F5F2] text-[#2D2A27]'
                      : 'text-[#6B625A] hover:bg-[#F7F5F2] hover:text-[#2D2A27]'
                  }`}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => command(item)}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0 text-[#C1843A]" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-[#2D2A27] truncate">
                      {item.label}
                    </p>
                    <p className="text-xs text-[#9C958D] truncate">
                      {item.description}
                    </p>
                  </div>
                  <Sparkles className="w-3 h-3 text-[#C1843A] ml-auto flex-shrink-0" />
                </button>
              );
            })}
          </>
        )}

        {items.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-[#9C958D]">
            无匹配命令
          </div>
        )}
      </div>
    </motion.div>
  );
}
