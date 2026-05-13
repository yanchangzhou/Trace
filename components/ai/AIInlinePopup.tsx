'use client';

import { motion } from 'framer-motion';
import { X, Sparkles, Copy, Check, RotateCcw } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useEditorContext } from '@/contexts/EditorContext';
import { copyToClipboard } from '@/lib/clipboard';

const ACTION_LABELS: Record<string, string> = {
  continue: 'Continue Writing',
  improve: 'Improve Writing',
  summarize: 'Summarize',
  outline: 'Generate Outline',
  translate: 'Translate',
  ask: 'Ask AI',
};

function buildDemoResponse(action: string, context: string): string {
  switch (action) {
    case 'continue':
      return [
        'The next logical step in this argument would be to consider the broader implications of these findings. ',
        'When we examine the underlying patterns more closely, several key themes emerge that warrant further exploration.\n\n',
        'First, the relationship between structure and meaning becomes increasingly significant as we delve deeper into the subject matter. ',
        'This connection suggests that our initial framework, while useful, may need to be expanded to accommodate these new insights.\n\n',
        'Furthermore, the practical applications of this approach extend beyond the immediate context, ',
        'offering potential solutions to related challenges in the field.',
      ].join('');
    case 'improve': {
      const original = context.slice(0, 200) || 'your selected text';
      return [
        'Here is the improved version of your text:\n\n',
        '> The core ideas in your writing are strong, but the expression can be refined for greater clarity and impact. ',
        'I have restructured the sentences to improve flow, eliminated redundancy, and strengthened the vocabulary ',
        'while preserving your original voice and intent.\n\n',
        'The revised passage maintains the same key points while making them more accessible and engaging for readers. ',
        'Pay attention to how the transitions between paragraphs create a more cohesive narrative arc.',
      ].join('');
    }
    case 'summarize':
      return [
        '## Summary\n\n',
        'This document covers several interconnected topics that form a cohesive argument. ',
        'The main thesis revolves around the importance of structured thinking in complex problem-solving scenarios.\n\n',
        '**Key Points:**\n',
        '- The introduction establishes the foundational concepts and sets up the central question\n',
        '- The middle sections develop supporting arguments with relevant examples and evidence\n',
        '- The conclusion synthesizes the findings and proposes actionable next steps\n\n',
        'Overall, the document presents a well-reasoned perspective that balances theoretical depth with practical applicability.',
      ].join('');
    case 'outline':
      return [
        '## Structured Outline\n\n',
        '**1. Introduction**\n',
        '   - Background and context\n',
        '   - Problem statement\n',
        '   - Thesis / main argument\n\n',
        '**2. Core Analysis**\n',
        '   - 2.1 First key concept\n',
        '     - Supporting evidence\n',
        '     - Counter-arguments\n',
        '   - 2.2 Second key concept\n',
        '     - Case studies\n',
        '     - Implications\n\n',
        '**3. Synthesis & Recommendations**\n',
        '   - 3.1 Connecting the threads\n',
        '   - 3.2 Practical applications\n',
        '   - 3.3 Future directions\n\n',
        '**4. Conclusion**\n',
        '   - Summary of findings\n',
        '   - Call to action',
      ].join('');
    case 'translate':
      return [
        '## Translation\n\n',
        'Here is the English translation of your selected text:\n\n',
        '---\n\n',
        'The translated content preserves the original meaning while adapting idioms ',
        'and cultural references for an English-speaking audience. The tone and register ',
        'have been carefully maintained to match the source material.\n\n',
        '---\n\n',
        'Note: This is a simulated translation. In production, DeepSeek will provide ',
        'accurate translations with support for multiple language pairs.',
      ].join('');
    case 'ask':
      return [
        'Great question! Based on the context of your document, here is what I think:\n\n',
        'The approach you are taking aligns well with established best practices in this area. ',
        'The key consideration is to maintain consistency throughout the document while ',
        'allowing for flexibility in how individual sections are structured.\n\n',
        'Some specific suggestions:\n',
        '- Consider adding more concrete examples to support your abstract points\n',
        '- The transition between sections 2 and 3 could be smoother\n',
        '- Your conclusion effectively ties together the main themes\n\n',
        'Feel free to ask follow-up questions or request clarification on any of these points.',
      ].join('');
    default:
      return 'AI response for: ' + action;
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

  // Start demo streaming
  useEffect(() => {
    if (!aiInlineState) return;
    const demoResponse = buildDemoResponse(action, aiInlineState.context);
    setStreamBuffer('');
    setFullResponse('');
    setIsStreaming(true);

    let charIndex = 0;
    streamTimerRef.current = setInterval(() => {
      if (charIndex < demoResponse.length) {
        setStreamBuffer(demoResponse.slice(0, charIndex + 1));
        charIndex++;
      } else {
        if (streamTimerRef.current) clearInterval(streamTimerRef.current);
        setFullResponse(demoResponse);
        setStreamBuffer('');
        setIsStreaming(false);
      }
    }, 10);

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
    const demoResponse = buildDemoResponse(action, aiInlineState.context);
    setStreamBuffer('');
    setFullResponse('');
    setIsStreaming(true);
    let charIndex = 0;
    streamTimerRef.current = setInterval(() => {
      if (charIndex < demoResponse.length) {
        setStreamBuffer(demoResponse.slice(0, charIndex + 1));
        charIndex++;
      } else {
        if (streamTimerRef.current) clearInterval(streamTimerRef.current);
        setFullResponse(demoResponse);
        setStreamBuffer('');
        setIsStreaming(false);
      }
    }, 10);
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
                Replace
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
              Insert
            </button>
          ) : (
            <button
              onClick={handleReplace}
              disabled={!fullResponse}
              className="h-8 px-3 rounded-lg bg-accent-warm text-white text-xs font-medium hover:bg-accent-warm/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Replace Selection
            </button>
          )}
          <button
            onClick={handleCopy}
            disabled={!fullResponse && !isStreaming}
            className="h-8 px-3 rounded-lg border border-border-light dark:border-border-dark text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark hover:bg-background-light dark:hover:bg-background-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <div className="flex-1" />
          <button
            onClick={handleRetry}
            disabled={isStreaming}
            className="h-8 px-3 rounded-lg border border-border-light dark:border-border-dark text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark hover:bg-background-light dark:hover:bg-background-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
    </motion.div>
  );
}
