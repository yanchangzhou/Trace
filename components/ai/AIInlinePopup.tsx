'use client';

import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Send,
  Copy,
  Check,
  RotateCcw,
  Pencil,
  FileText,
  ListTodo,
  Languages,
  MessageSquare,
  Lightbulb,
  Sparkles,
} from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useEditorContext } from '@/contexts/EditorContext';
import { useTheme } from '@/contexts/ThemeContext';
import type { AIRequest } from '@/types';
import type { Editor } from '@tiptap/react';
import type { AIActionType } from '@/lib/ai-trigger';
import { streamGenerate } from '@/lib/tauri';

interface AIInlinePopupProps {
  editor: Editor;
  initialAction: AIActionType;
  onClose: () => void;
}

const ACTION_CONFIG: Record<AIActionType, { label: string; icon: React.ComponentType<{ className?: string }>; placeholder: string; buildPrompt: (editor: Editor) => string }> = {
  continue: {
    label: 'Continue Writing',
    icon: Pencil,
    placeholder: 'Ask AI to continue writing...',
    buildPrompt: (editor) => {
      const text = editor.getText();
      const pos = editor.state.selection.from;
      const before = text.slice(Math.max(0, pos - 800), pos);
      return before
        ? `Continue writing naturally from where I left off. Match the tone and style.\n\nContext before cursor:\n"""\n${before}\n"""\n\nWrite the next part.`
        : 'Continue writing from the current position. Write naturally.';
    },
  },
  improve: {
    label: 'Improve Writing',
    icon: Sparkles,
    placeholder: 'Ask AI to improve writing...',
    buildPrompt: (editor) => {
      const sel = editor.state.selection;
      const text = sel.empty ? editor.getText() : editor.state.doc.textBetween(sel.from, sel.to, ' ');
      const scope = sel.empty ? 'entire document' : 'selected text';
      return `Improve the following ${scope}. Fix grammar, clarity, and flow while preserving the original meaning:\n"""\n${text}\n"""`;
    },
  },
  summarize: {
    label: 'Summarize',
    icon: FileText,
    placeholder: 'Ask AI to summarize...',
    buildPrompt: (editor) => {
      const text = editor.getText();
      return `Summarize the key points of the following document concisely:\n"""\n${text.slice(0, 3000)}\n"""`;
    },
  },
  outline: {
    label: 'Generate Outline',
    icon: ListTodo,
    placeholder: 'Ask AI to outline...',
    buildPrompt: (editor) => {
      const text = editor.getText();
      return text
        ? `Generate a structured outline based on the following content:\n"""\n${text.slice(0, 3000)}\n"""`
        : 'Generate a structured outline for a new document. Ask me about the topic if needed.';
    },
  },
  translate: {
    label: 'Translate',
    icon: Languages,
    placeholder: 'Ask AI to translate...',
    buildPrompt: (editor) => {
      const sel = editor.state.selection;
      const text = sel.empty ? editor.getText() : editor.state.doc.textBetween(sel.from, sel.to, ' ');
      return `Translate the following text to English:\n"""\n${text}\n"""`;
    },
  },
  ask: {
    label: 'Ask AI',
    icon: MessageSquare,
    placeholder: 'Ask AI anything...',
    buildPrompt: () => '',
  },
  explain: {
    label: 'Explain',
    icon: Lightbulb,
    placeholder: 'Ask AI to explain...',
    buildPrompt: (editor) => {
      const sel = editor.state.selection;
      const text = sel.empty ? editor.getText() : editor.state.doc.textBetween(sel.from, sel.to, ' ');
      return `Explain the following text in simpler, clearer terms:\n"""\n${text}\n"""`;
    },
  },
};

export default function AIInlinePopup({ editor, initialAction, onClose }: AIInlinePopupProps) {
  const { insertGeneratedText, replaceSelection, getSelectedText } = useEditorContext();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const [action] = useState<AIActionType>(initialAction);
  const [userInput, setUserInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState('');
  const [fullResponse, setFullResponse] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const responseRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const ActionIcon = ACTION_CONFIG[action].icon;

  useEffect(() => {
    try {
      const pos = editor.state.selection.from;
      const coords = editor.view.coordsAtPos(pos);
      const popupWidth = 380;
      const popupHeight = 52;
      const gap = 16;

      let top = coords.bottom + gap;
      let left = coords.left;

      if (top + popupHeight + 200 > window.innerHeight) {
        top = coords.top - popupHeight - gap;
      }
      if (left + popupWidth > window.innerWidth) {
        left = window.innerWidth - popupWidth - 16;
      }
      left = Math.max(16, left);
      top = Math.max(16, top);

      setPosition({ top, left });
    } catch {
      setPosition({ top: window.innerHeight / 2 - 100, left: window.innerWidth / 2 - 190 });
    }
  }, [editor]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    if (responseRef.current) {
      responseRef.current.scrollTop = responseRef.current.scrollHeight;
    }
  }, [streamBuffer]);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleSend = useCallback(async () => {
    const prompt = userInput.trim() || ACTION_CONFIG[action].buildPrompt(editor);
    if (!prompt.trim()) return;

    const request: AIRequest = {
      action: 'free',
      prompt,
      context_file_ids: [],
      style: 'default',
      output_mode: action === 'outline' ? 'outline' : 'draft',
    };

    setStreamBuffer('');
    setFullResponse('');
    setError('');
    setIsStreaming(true);

    await streamGenerate(
      request,
      (token) => setStreamBuffer((prev) => prev + token),
      () => {
        setIsStreaming(false);
        setFullResponse((prev) => prev || streamBuffer);
      },
      (msg) => {
        setIsStreaming(false);
        setError(msg);
      },
    );
  }, [userInput, action, editor]);

  useEffect(() => {
    if (!isStreaming && streamBuffer && !fullResponse) {
      setFullResponse(streamBuffer);
    }
  }, [isStreaming, streamBuffer, fullResponse]);

  const handleInsert = () => {
    const text = fullResponse || streamBuffer;
    if (text) {
      insertGeneratedText(text);
      onClose();
    }
  };

  const handleReplace = () => {
    const text = fullResponse || streamBuffer;
    if (text) {
      replaceSelection(text);
      onClose();
    }
  };

  const handleCopy = () => {
    const text = fullResponse || streamBuffer;
    if (text) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRetry = () => {
    setStreamBuffer('');
    setFullResponse('');
    setError('');
    handleSend();
  };

  if (!position) return null;

  const bgClass = isDark ? 'bg-card-dark border-border-dark' : 'bg-white border-border-light';
  const inputBgClass = isDark ? 'bg-surface-dark' : 'bg-[#F9F8F6]';
  const textClass = isDark ? 'text-text-primary-dark' : 'text-text-primary-light';
  const subtleTextClass = isDark ? 'text-text-secondary-dark' : 'text-[#9C958D]';
  const placeholderClass = isDark ? 'placeholder:text-text-tertiary-dark' : 'placeholder:text-[#B8B2A8]';

  return (
    <motion.div
      ref={popupRef}
      initial={{ opacity: 0, scale: 0.98, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, y: -4 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      className={`fixed z-[300] rounded-xl shadow-2xl border overflow-hidden ${bgClass} ${isDark ? 'shadow-ambient-lg-dark' : 'shadow-ambient-lg'}`}
      style={{ top: position.top, left: position.left, width: 380 }}
    >
      {/* Input bar */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="flex-shrink-0 text-accent-warm" title={ACTION_CONFIG[action].label}>
          <ActionIcon className="w-4 h-4" />
        </span>
        <input
          ref={inputRef}
          type="text"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !isStreaming) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={ACTION_CONFIG[action].placeholder}
          disabled={isStreaming}
          className={`flex-1 bg-transparent border-none outline-none text-sm ${textClass} ${placeholderClass} disabled:opacity-50 min-w-0`}
        />
        {isStreaming ? (
          <span className="flex-shrink-0 w-4 h-4 border-2 border-accent-warm/30 border-t-accent-warm rounded-full animate-spin" />
        ) : (
          <button
            onClick={handleSend}
            disabled={!userInput.trim() && action === 'ask'}
            className={`flex-shrink-0 p-1 rounded-md transition-colors ${
              !userInput.trim() && action === 'ask'
                ? isDark ? 'text-text-tertiary-dark cursor-default' : 'text-[#B8B2A8] cursor-default'
                : isDark ? 'text-accent-warm hover:bg-surface-dark' : 'text-accent-warm hover:bg-[#F5F3F0]'
            }`}
          >
            <Send className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={onClose}
          className={`flex-shrink-0 p-1 rounded-md transition-colors ${subtleTextClass} ${
            isDark ? 'hover:bg-surface-dark' : 'hover:bg-[#F5F3F0]'
          }`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Response area */}
      <AnimatePresence>
        {(streamBuffer || error) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={isDark ? 'border-t border-border-dark' : 'border-t border-border-light'}
          >
            <div
              ref={responseRef}
              className="px-3 py-3 max-h-[220px] overflow-y-auto"
            >
              {error ? (
                <div className={`text-sm rounded-lg p-3 ${isDark ? 'text-red-400 bg-red-900/20' : 'text-red-500 bg-red-50'}`}>
                  {error}
                </div>
              ) : (
                <div className={`text-sm leading-relaxed whitespace-pre-wrap ${textClass}`}>
                  {streamBuffer}
                  {isStreaming && <span className="inline-block w-1.5 h-4 bg-accent-warm ml-0.5 animate-pulse align-middle" />}
                </div>
              )}
            </div>

            {!isStreaming && (fullResponse || streamBuffer) && !error && (
              <div className="flex items-center gap-1 px-2 pb-2.5">
                <button
                  onClick={handleInsert}
                  className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    isDark ? 'text-text-primary-dark bg-[#333] hover:bg-[#444]' : 'text-white bg-[#2D2A27] hover:bg-[#1D1A17]'
                  }`}
                >
                  Insert
                </button>
                <button
                  onClick={handleReplace}
                  className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    isDark ? 'text-text-primary-dark bg-surface-dark hover:bg-[#333]' : 'text-[#2D2A27] bg-[#F5F3F0] hover:bg-[#EBE8E3]'
                  }`}
                >
                  Replace
                </button>
                <button
                  onClick={handleCopy}
                  className={`p-1.5 rounded-lg transition-colors ${subtleTextClass} ${
                    isDark ? 'hover:bg-surface-dark' : 'hover:bg-[#F5F3F0]'
                  }`}
                  title="Copy"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={handleRetry}
                  className={`p-1.5 rounded-lg transition-colors ${subtleTextClass} ${
                    isDark ? 'hover:bg-surface-dark' : 'hover:bg-[#F5F3F0]'
                  }`}
                  title="Retry"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
