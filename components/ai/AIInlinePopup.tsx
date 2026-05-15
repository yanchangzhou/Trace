'use client';

import { motion } from 'framer-motion';
import { X, Sparkles, Copy, Check, RotateCcw } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useEditorContext } from '@/contexts/EditorContext';
import { copyToClipboard } from '@/lib/clipboard';
import { generateAIStream } from '@/lib/tauri';
import type { ChatMessage } from '@/lib/tauri';

const ACTION_LABELS: Record<string, string> = {
  continue: '继续写作',
  improve: '改进写作',
  summarize: '摘要',
  outline: '生成大纲',
  translate: '翻译',
  ask: '询问 AI',
};

function buildSystemPrompt(action: string): string {
  switch (action) {
    case 'continue':
      return 'Continue writing from the provided text. Maintain the same tone, style, and voice. Do not repeat the text, just continue naturally from where it ends.';
    case 'improve':
      return 'Improve the provided text. Make it clearer, more engaging, and fix any grammar, style, or structure issues while preserving the original meaning.';
    case 'summarize':
      return 'Summarize the provided text concisely. Highlight the key points and main ideas.';
    case 'outline':
      return 'Generate a well-structured outline based on the provided text. Use hierarchical numbering.';
    case 'translate':
      return 'Translate the provided text to English. Preserve the original meaning and tone.';
    case 'ask':
      return 'Answer the user\'s question based on the provided context. Be helpful and thorough.';
    default:
      return 'Help the user with the provided text.';
  }
}

export default function AIInlinePopup() {
  const {
    aiInlineState,
    closeAIInline,
    insertGeneratedText,
    replaceSelection,
  } = useEditorContext();

  const [streamBuffer, setStreamBuffer] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [fullResponse, setFullResponse] = useState('');
  const [copied, setCopied] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const streamTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isOpen = aiInlineState !== null;
  const action = aiInlineState?.action ?? 'ask';
  const mode = aiInlineState?.mode ?? 'insert';

  // Calculate clamped position on open
  useEffect(() => {
    if (!aiInlineState) return;
    const popupWidth = 500;
    const popupHeight = 380;
    const gap = 12;

    let left = aiInlineState.position.x;
    let top = aiInlineState.position.y + gap;

    if (left + popupWidth > window.innerWidth - 16) {
      left = window.innerWidth - popupWidth - 16;
    }
    if (top + popupHeight > window.innerHeight - 16) {
      top = aiInlineState.position.y - popupHeight - gap;
    }
    left = Math.max(16, left);
    top = Math.max(16, top);

    setPosition({ top, left });
  }, [aiInlineState]);

  // Start real AI streaming
  useEffect(() => {
    if (!aiInlineState) return;
    setStreamBuffer('');
    setFullResponse('');
    setIsStreaming(true);

    const systemPrompt = buildSystemPrompt(action);
    const chatMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: aiInlineState.context || 'No context provided.' },
    ];

    let streamedText = '';

    generateAIStream(
      chatMessages,
      null,
      // onToken
      (token) => {
        streamedText += token;
        setStreamBuffer(streamedText);
      },
      // onDone
      (fullResponse) => {
        setFullResponse(fullResponse);
        setStreamBuffer('');
        setIsStreaming(false);
      },
      // onError
      (error) => {
        setFullResponse(`Error: ${error}`);
        setStreamBuffer('');
        setIsStreaming(false);
      },
    ).catch((err) => {
      setIsStreaming(false);
      setStreamBuffer('');
    });

    return () => {
      if (streamTimerRef.current) clearInterval(streamTimerRef.current);
    };
  }, [aiInlineState, action]);

  // Esc to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAIInline();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, closeAIInline]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        closeAIInline();
      }
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [isOpen, closeAIInline]);

  const handleInsert = useCallback(() => {
    const text = fullResponse || streamBuffer;
    if (!text) return;
    insertGeneratedText(text);
    closeAIInline();
  }, [fullResponse, streamBuffer, insertGeneratedText, closeAIInline]);

  const handleReplace = useCallback(() => {
    const text = fullResponse || streamBuffer;
    if (!text) return;
    replaceSelection(text);
    closeAIInline();
  }, [fullResponse, streamBuffer, replaceSelection, closeAIInline]);

  const handleCopy = useCallback(async () => {
    const text = fullResponse || streamBuffer;
    if (!text) return;
    await copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [fullResponse, streamBuffer]);

  const handleRetry = useCallback(() => {
    if (!aiInlineState) return;
    const systemPrompt = buildSystemPrompt(action);
    const chatMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: aiInlineState.context || 'No context provided.' },
    ];

    setStreamBuffer('');
    setFullResponse('');
    setIsStreaming(true);

    let streamedText = '';

    generateAIStream(
      chatMessages,
      null,
      (token) => {
        streamedText += token;
        setStreamBuffer(streamedText);
      },
      (fullResponse) => {
        setFullResponse(fullResponse);
        setStreamBuffer('');
        setIsStreaming(false);
      },
      (error) => {
        setFullResponse(`Error: ${error}`);
        setStreamBuffer('');
        setIsStreaming(false);
      },
    ).catch(() => {
      setIsStreaming(false);
      setStreamBuffer('');
    });
  }, [aiInlineState, action]);

  const displayText = isStreaming ? streamBuffer : fullResponse;

  if (!isOpen || !position) return null;

  return (
    <motion.div
      ref={popupRef}
      initial={{ opacity: 0, scale: 0.96, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="fixed z-[300] w-[500px] bg-card-light dark:bg-card-dark rounded-squircle-lg shadow-ambient-lg dark:shadow-ambient-lg-dark border border-border-light dark:border-border-dark overflow-hidden"
      style={{ top: position.top, left: position.left }}
    >
        {/* Header */}
        <div className="h-12 flex items-center justify-between px-4 border-b border-border-light dark:border-border-dark">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent-warm" />
            <span className="text-sm font-semibold text-text-primary-light dark:text-text-primary-dark">
              {ACTION_LABELS[action] || 'AI'}
            </span>
            {mode === 'replace' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-warm/10 text-accent-warm font-medium">
                替换
              </span>
            )}
          </div>
          <button
            onClick={closeAIInline}
            className="w-7 h-7 rounded-lg hover:bg-background-light dark:hover:bg-background-dark transition-colors flex items-center justify-center"
          >
            <X className="w-3.5 h-3.5 text-text-secondary-light dark:text-text-secondary-dark" />
          </button>
        </div>

        {/* Response area */}
        <div className="px-4 py-3 max-h-[240px] overflow-y-auto">
          {isStreaming && displayText === '' ? (
            <div className="flex items-center gap-1 py-2">
              <span className="w-2 h-2 rounded-full bg-accent-warm animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 rounded-full bg-accent-warm animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 rounded-full bg-accent-warm animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          ) : (
            <div className="text-sm text-text-primary-light dark:text-text-primary-dark whitespace-pre-wrap leading-relaxed">
              {displayText}
              {isStreaming && (
                <span className="inline-block w-0.5 h-4 bg-accent-warm ml-0.5 animate-pulse align-middle" />
              )}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="h-12 flex items-center gap-2 px-4 border-t border-border-light dark:border-border-dark">
          {mode === 'insert' ? (
            <button
              onClick={handleInsert}
              disabled={!fullResponse}
              className="h-8 px-3 rounded-lg bg-accent-warm text-white text-xs font-medium hover:bg-accent-warm/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              插入
            </button>
          ) : (
            <button
              onClick={handleReplace}
              disabled={!fullResponse}
              className="h-8 px-3 rounded-lg bg-accent-warm text-white text-xs font-medium hover:bg-accent-warm/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              替换选中
            </button>
          )}
          <button
            onClick={handleCopy}
            disabled={!fullResponse && !isStreaming}
            className="h-8 px-3 rounded-lg border border-border-light dark:border-border-dark text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark hover:bg-background-light dark:hover:bg-background-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? '已复制' : '复制'}
          </button>
          <div className="flex-1" />
          <button
            onClick={handleRetry}
            disabled={isStreaming}
            className="h-8 px-3 rounded-lg border border-border-light dark:border-border-dark text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark hover:bg-background-light dark:hover:bg-background-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            重试
          </button>
        </div>
    </motion.div>
  );
}
