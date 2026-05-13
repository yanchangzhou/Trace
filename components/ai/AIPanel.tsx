'use client';

import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  FileText,
  GitCompare,
  ListTodo,
  MessageSquare,
  Send,
  Sparkles,
  Copy,
  ChevronDown,
  Check,
  Palette,
  BookOpen,
  Microscope,
  Zap,
  User,
} from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useEditorContext } from '@/contexts/EditorContext';
import { useBook } from '@/contexts/BookContext';
import type { AIMessage, AIStreamEvent, WritingStyle, StyleProfile } from '@/types';
import StreamingComposer from './StreamingComposer';
import { copyToClipboard } from '@/lib/clipboard';

const springConfig = {
  type: 'spring' as const,
  stiffness: 200,
  damping: 25,
};

const STYLE_OPTIONS: { key: WritingStyle; label: string; icon: React.ComponentType<{ className?: string }>; description: string }[] = [
  { key: 'default', label: 'Default', icon: Sparkles, description: 'Balanced and helpful' },
  { key: 'academic', label: 'Academic', icon: BookOpen, description: 'Formal, precise, well-structured' },
  { key: 'analytical', label: 'Analytical', icon: Microscope, description: 'Data-driven and objective' },
  { key: 'concise', label: 'Concise', icon: Zap, description: 'Brief and to the point' },
  { key: 'my_style', label: 'My Style', icon: User, description: 'Based on your writing patterns' },
];

const ACTIONS = [
  { key: 'summarize', label: 'Summarize', description: 'Summarize selected documents', icon: FileText },
  { key: 'compare', label: 'Compare', description: 'Compare two documents', icon: GitCompare },
  { key: 'outline', label: 'Outline', description: 'Generate writing outline', icon: ListTodo },
  { key: 'free', label: 'Chat', description: 'Free-form AI chat', icon: MessageSquare },
];

export default function AIPanel() {
  const { isAIPanelOpen, setAIPanelOpen } = useEditorContext();
  const { currentFiles } = useBook();

  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState('');
  const [activeAction, setActiveAction] = useState<string>('free');
  const [selectedStyle, setSelectedStyle] = useState<WritingStyle>('default');
  const [styleProfile, setStyleProfile] = useState<StyleProfile | null>(null);
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [showStyleConstraints, setShowStyleConstraints] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamBuffer]);

  const currentStyle = STYLE_OPTIONS.find((s) => s.key === selectedStyle) || STYLE_OPTIONS[0];
  const StyleIcon = currentStyle.icon;

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isStreaming) return;

    const userMessage: AIMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setIsStreaming(true);
    setStreamBuffer('');

    // Simulate streaming AI response (will be replaced by real Tauri command)
    // This is a UI demonstration that shows the streaming pattern
    const demoResponse = `This is a simulated AI response. In the full implementation, this would connect to the \`generate_with_context\` Tauri command which streams tokens and source citations in real-time.\n\nThe selected style is: **${currentStyle.label}**\n\nWhen the backend is ready, this panel will:\n1. Package selected files as context\n2. Stream tokens with real-time rendering\n3. Cite sources inline with clickable references\n4. Support retry and regeneration`;

    let charIndex = 0;
    const interval = setInterval(() => {
      if (charIndex < demoResponse.length) {
        setStreamBuffer(demoResponse.slice(0, charIndex + 1));
        charIndex++;
      } else {
        clearInterval(interval);
        const assistantMessage: AIMessage = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: demoResponse,
          timestamp: Date.now(),
          sources: [
            { file_id: 'demo', file_name: 'example.pdf', quote: 'Sample citation from the document' },
          ],
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setStreamBuffer('');
        setIsStreaming(false);
      }
    }, 15);
  }, [inputText, isStreaming, currentStyle]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setStreamBuffer('');
    setIsStreaming(false);
  };

  const copyLastResponse = () => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    if (lastAssistant) {
      copyToClipboard(lastAssistant.content);
    }
  };

  return (
    <AnimatePresence>
      {isAIPanelOpen && (
        <motion.div
          initial={{ x: 400, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 400, opacity: 0 }}
          transition={springConfig}
          className="fixed right-0 top-12 bottom-0 w-[420px] bg-surface-light dark:bg-surface-dark border-l border-border-light dark:border-border-dark z-40 flex flex-col shadow-ambient-lg dark:shadow-ambient-lg-dark"
        >
          {/* Header */}
          <div className="h-16 flex items-center justify-between px-6 border-b border-border-light dark:border-border-dark flex-shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-accent-warm" />
              <h2 className="text-sm font-semibold text-text-primary-light dark:text-text-primary-dark tracking-tight">
                AI Assistant
              </h2>
            </div>
            <button
              onClick={() => setAIPanelOpen(false)}
              className="w-8 h-8 rounded-lg hover:bg-background-light dark:hover:bg-background-dark transition-colors flex items-center justify-center"
            >
              <X className="w-4 h-4 text-text-secondary-light dark:text-text-secondary-dark" />
            </button>
          </div>

          {/* Action Selector */}
          <div className="flex border-b border-border-light dark:border-border-dark flex-shrink-0">
            {ACTIONS.map((action) => (
              <button
                key={action.key}
                onClick={() => setActiveAction(action.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
                  activeAction === action.key
                    ? 'text-accent-warm border-b-2 border-accent-warm'
                    : 'text-text-tertiary-light dark:text-text-tertiary-dark hover:text-text-secondary-light dark:hover:text-text-secondary-dark'
                }`}
              >
                <action.icon className="w-3.5 h-3.5" />
                {action.label}
              </button>
            ))}
          </div>

          {/* Messages Area */}
          <StreamingComposer
            messages={messages}
            isStreaming={isStreaming}
            streamBuffer={streamBuffer}
            onRetry={undefined}
          />
          <div ref={messagesEndRef} />

          {/* Style Constraints Display */}
          <AnimatePresence>
            {showStyleConstraints && styleProfile && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-t border-border-light dark:border-border-dark px-4 py-3 overflow-hidden"
              >
                <p className="text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark mb-2">
                  Active Style Constraints
                </p>
                <div className="space-y-1">
                  {styleProfile.constraints.map((c, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-text-tertiary-light dark:text-text-tertiary-dark">{c.name}</span>
                      <span className="text-text-primary-light dark:text-text-primary-dark">{c.value}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input Area */}
          <div className="border-t border-border-light dark:border-border-dark p-4 space-y-3 flex-shrink-0">
            {/* Style selector + controls row */}
            <div className="flex items-center gap-2">
              {/* Style dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowStyleMenu((v) => !v)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark text-xs text-text-secondary-light dark:text-text-secondary-dark hover:bg-background-light dark:hover:bg-background-dark transition-colors"
                >
                  <StyleIcon className="w-3.5 h-3.5" />
                  {currentStyle.label}
                  <ChevronDown className="w-3 h-3" />
                </button>

                <AnimatePresence>
                  {showStyleMenu && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.96, y: -5 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96, y: -5 }}
                      transition={{ duration: 0.12 }}
                      className="absolute bottom-full left-0 mb-2 w-52 bg-card-light dark:bg-card-dark rounded-squircle-sm shadow-ambient-lg dark:shadow-ambient-lg-dark border border-border-light dark:border-border-dark overflow-hidden z-50"
                    >
                      {STYLE_OPTIONS.map((option) => (
                        <button
                          key={option.key}
                          onClick={() => {
                            setSelectedStyle(option.key);
                            setShowStyleMenu(false);
                            if (option.key === 'my_style') {
                              setStyleProfile({
                                style: 'my_style',
                                label: 'My Style',
                                description: 'Based on your writing patterns',
                                constraints: [
                                  { name: 'Avg sentence length', value: '18 words', explanation: 'From your last 50 notes' },
                                  { name: 'Common phrases', value: '12 patterns', explanation: 'Frequently used expressions' },
                                  { name: 'Heading density', value: '1 per 200 words', explanation: 'Your typical structure' },
                                  { name: 'Tone', value: 'Professional-neutral', explanation: 'Detected from writing' },
                                ],
                              });
                              setShowStyleConstraints(true);
                            }
                          }}
                          className={`w-full text-left px-3 py-2 flex items-start gap-2.5 transition-colors ${
                            selectedStyle === option.key
                              ? 'bg-surface-light dark:bg-surface-dark'
                              : 'hover:bg-background-light/50 dark:hover:bg-background-dark/50'
                          }`}
                        >
                          <option.icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                            selectedStyle === option.key ? 'text-accent-warm' : 'text-text-secondary-light dark:text-text-secondary-dark'
                          }`} />
                          <div>
                            <p className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark">
                              {option.label}
                            </p>
                            <p className="text-xs text-text-tertiary-light dark:text-text-tertiary-dark">
                              {option.description}
                            </p>
                          </div>
                          {selectedStyle === option.key && (
                            <Check className="w-3.5 h-3.5 text-accent-warm ml-auto mt-0.5 flex-shrink-0" />
                          )}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex-1" />

              {/* Action buttons */}
              <button
                onClick={copyLastResponse}
                disabled={!messages.some((m) => m.role === 'assistant')}
                className="w-8 h-8 rounded-lg hover:bg-background-light dark:hover:bg-background-dark transition-colors flex items-center justify-center disabled:opacity-30"
                title="Copy last response"
              >
                <Copy className="w-3.5 h-3.5 text-text-tertiary-light dark:text-text-tertiary-dark" />
              </button>
              <button
                onClick={clearChat}
                disabled={messages.length === 0}
                className="w-8 h-8 rounded-lg hover:bg-background-light dark:hover:bg-background-dark transition-colors flex items-center justify-center disabled:opacity-30"
                title="Clear chat"
              >
                <X className="w-3.5 h-3.5 text-text-tertiary-light dark:text-text-tertiary-dark" />
              </button>
            </div>

            {/* Active constraints indicator */}
            {showStyleConstraints && styleProfile && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-accent-warm/5 border border-accent-warm/10">
                <Palette className="w-3.5 h-3.5 text-accent-warm" />
                <span className="text-xs text-accent-warm flex-1">
                  {styleProfile.constraints.length} style constraints active
                </span>
                <button
                  onClick={() => setShowStyleConstraints(false)}
                  className="text-xs text-text-tertiary-light dark:text-text-tertiary-dark hover:text-text-secondary-light"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Text input */}
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  activeAction === 'summarize' ? 'Ask AI to summarize selected documents...' :
                  activeAction === 'compare' ? 'Select two documents to compare...' :
                  activeAction === 'outline' ? 'Describe the outline you need...' :
                  'Ask anything about your documents...'
                }
                rows={2}
                className="flex-1 bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark rounded-squircle-sm px-4 py-2.5 text-sm text-text-primary-light dark:text-text-primary-dark placeholder:text-text-tertiary-light dark:placeholder:text-text-tertiary-dark outline-none focus:border-accent-warm/50 resize-none transition-colors"
              />
              <button
                onClick={handleSend}
                disabled={!inputText.trim() || isStreaming}
                className="w-10 h-10 rounded-squircle-sm bg-accent-warm text-white flex items-center justify-center hover:bg-accent-warm/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>

            {/* Context info */}
            {currentFiles.length > 0 && (
              <p className="text-xs text-text-tertiary-light dark:text-text-tertiary-dark">
                {currentFiles.length} file{currentFiles.length !== 1 ? 's' : ''} available as context
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
