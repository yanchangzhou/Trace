'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Quote, FileText, FilePlus, Replace } from 'lucide-react';
import type { AIMessage } from '@/types';

interface StreamingComposerProps {
  messages: AIMessage[];
  isStreaming: boolean;
  streamBuffer: string;
  onRetry?: () => void;
  onInsert?: (text: string) => void;
  onReplace?: (text: string) => void;
}

export default function StreamingComposer({
  messages,
  isStreaming,
  streamBuffer,
  onRetry,
  onInsert,
  onReplace,
}: StreamingComposerProps) {
  return (
    <div className="flex-1 overflow-y-auto space-y-4 p-4">
      {messages.length === 0 && !isStreaming && (
        <div className="flex flex-col items-center justify-center h-full text-center py-12">
          <FileText className="w-12 h-12 text-text-tertiary-light dark:text-text-tertiary-dark mb-4" />
          <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark">
            Select an AI action to get started
          </p>
          <p className="text-xs text-text-tertiary-light dark:text-text-tertiary-dark mt-1">
            Summarize documents, compare sources, or generate outlines
          </p>
        </div>
      )}

      <AnimatePresence>
        {messages.map((message) => (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-squircle-sm p-4 ${
                message.role === 'user'
                  ? 'bg-accent-primary text-white shadow-ambient dark:shadow-ambient-dark'
                  : 'bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark shadow-ambient dark:shadow-ambient-dark'
              }`}
            >
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>

              {/* Source citations */}
              {message.sources && message.sources.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border-light dark:border-border-dark space-y-1.5">
                  <p className="text-xs font-medium text-text-tertiary-light dark:text-text-tertiary-dark">
                    Sources
                  </p>
                  {message.sources.map((source, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 text-xs text-text-secondary-light dark:text-text-secondary-dark"
                    >
                      <Quote className="w-3 h-3 mt-0.5 text-accent-warm flex-shrink-0" />
                      <span className="flex-1">{source.quote}</span>
                      <span className="text-text-tertiary-light dark:text-text-tertiary-dark flex-shrink-0">
                        {source.file_name}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {message.role === 'assistant' && (
                <div className="mt-2 pt-2 border-t border-border-light dark:border-border-dark flex items-center gap-2">
                  {onInsert && (
                    <button
                      onClick={() => onInsert(message.content)}
                      className="flex items-center gap-1 text-xs text-accent-warm hover:text-accent-warm/80 transition-colors"
                      title="Insert into editor at cursor"
                    >
                      <FilePlus className="w-3 h-3" />
                      Insert
                    </button>
                  )}
                  {onReplace && (
                    <button
                      onClick={() => onReplace(message.content)}
                      className="flex items-center gap-1 text-xs text-accent-cool hover:text-accent-cool/80 transition-colors"
                      title="Replace current selection"
                    >
                      <Replace className="w-3 h-3" />
                      Replace
                    </button>
                  )}
                  {onRetry && (
                    <button
                      onClick={onRetry}
                      className="text-xs text-text-tertiary-light dark:text-text-tertiary-dark hover:text-accent-warm/80 transition-colors ml-auto"
                    >
                      Retry
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        ))}

        {/* Streaming buffer */}
        {isStreaming && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start"
          >
            <div className="max-w-[85%] rounded-squircle-sm p-4 bg-card-light dark:bg-card-dark border border-accent-warm/30 shadow-ambient dark:shadow-ambient-dark">
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-text-primary-light dark:text-text-primary-dark">
                {streamBuffer || (
                  <span className="inline-flex gap-1">
                    <motion.span
                      animate={{ opacity: [0.2, 1, 0.2] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: 0 }}
                      className="w-2 h-2 rounded-full bg-accent-warm"
                    />
                    <motion.span
                      animate={{ opacity: [0.2, 1, 0.2] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }}
                      className="w-2 h-2 rounded-full bg-accent-warm"
                    />
                    <motion.span
                      animate={{ opacity: [0.2, 1, 0.2] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }}
                      className="w-2 h-2 rounded-full bg-accent-warm"
                    />
                  </span>
                )}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
