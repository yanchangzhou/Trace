'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, FileText, Image as ImageIcon, File } from 'lucide-react';
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface ParsedDocument {
  file_path: string;
  file_type: string;
  summary: string;
  metadata: {
    page_count?: number;
    slide_count?: number;
    word_count: number;
    has_images: boolean;
    headings: string[];
  };
  content_preview: string;
}

interface QuickLookProps {
  isOpen: boolean;
  filePath: string | null;
  onClose: () => void;
}

const springConfig = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30,
};

export default function QuickLook({ isOpen, filePath, onClose }: QuickLookProps) {
  const [parsedDoc, setParsedDoc] = useState<ParsedDocument | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && filePath) {
      loadDocument();
    }
  }, [isOpen, filePath]);

  const loadDocument = async () => {
    if (!filePath) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await invoke<ParsedDocument>('parse_document', {
        filePath: filePath,
      });
      setParsedDoc(result);
    } catch (err) {
      console.error('Failed to parse document:', err);
      setError(err as string);
    } finally {
      setIsLoading(false);
    }
  };

  const getFileIcon = (fileType: string) => {
    switch (fileType.toLowerCase()) {
      case 'pdf':
        return <FileText className="w-8 h-8 text-accent-warm" />;
      case 'pptx':
        return <File className="w-8 h-8 text-accent-warm" />;
      case 'docx':
        return <File className="w-8 h-8 text-accent-warm" />;
      case 'image':
        return <ImageIcon className="w-8 h-8 text-accent-warm" />;
      default:
        return <File className="w-8 h-8 text-accent-warm" />;
    }
  };

  const getFileName = () => {
    if (!filePath) return '';
    return filePath.split('/').pop() || filePath;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
            onClick={onClose}
          />

          {/* QuickLook Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={springConfig}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[70%] bg-background-light dark:bg-background-dark rounded-squircle-lg shadow-ambient-lg dark:shadow-ambient-lg-dark z-[101] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-8 py-6 border-b border-border-light dark:border-border-dark">
              <div className="flex items-center gap-4">
                {parsedDoc && getFileIcon(parsedDoc.file_type)}
                <div>
                  <h2 className="text-lg font-semibold text-text-primary-light dark:text-text-primary-dark tracking-tighter">
                    {getFileName()}
                  </h2>
                  {parsedDoc && (
                    <p className="text-sm text-text-tertiary-light dark:text-text-tertiary-dark mt-1">
                      {parsedDoc.file_type.toUpperCase()} • {parsedDoc.metadata.word_count} words
                      {parsedDoc.metadata.slide_count && ` • ${parsedDoc.metadata.slide_count} slides`}
                      {parsedDoc.metadata.page_count && ` • ${parsedDoc.metadata.page_count} pages`}
                    </p>
                  )}
                </div>
              </div>

              <button
                onClick={onClose}
                className="w-10 h-10 rounded-lg hover:bg-surface-light dark:hover:bg-surface-dark transition-colors flex items-center justify-center"
              >
                <X className="w-5 h-5 text-text-secondary-light dark:text-text-secondary-dark" />
              </button>
            </div>

            {/* Content */}
            <div className="px-8 py-6 overflow-auto h-[calc(100%-88px)]">
              {isLoading && (
                <div className="flex items-center justify-center h-full">
                  <motion.div
                    animate={{
                      scale: [1, 1.2, 1],
                      opacity: [0.5, 1, 0.5],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                    className="text-accent-warm"
                  >
                    <FileText className="w-12 h-12" />
                  </motion.div>
                </div>
              )}

              {error && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <p className="text-text-secondary-light dark:text-text-secondary-dark mb-2">
                      Unable to preview this file
                    </p>
                    <p className="text-sm text-text-tertiary-light dark:text-text-tertiary-dark">
                      {error}
                    </p>
                  </div>
                </div>
              )}

              {parsedDoc && !isLoading && !error && (
                <div className="space-y-6">
                  {/* Smart Summary */}
                  <div className="bg-card-light dark:bg-card-dark rounded-squircle p-6 shadow-ambient dark:shadow-ambient-dark">
                    <h3 className="text-sm font-semibold text-text-primary-light dark:text-text-primary-dark tracking-tighter mb-3">
                      Smart Summary
                    </h3>
                    <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark leading-relaxed">
                      {parsedDoc.summary}
                    </p>
                  </div>

                  {/* Headings */}
                  {parsedDoc.metadata.headings.length > 0 && (
                    <div className="bg-card-light dark:bg-card-dark rounded-squircle p-6 shadow-ambient dark:shadow-ambient-dark">
                      <h3 className="text-sm font-semibold text-text-primary-light dark:text-text-primary-dark tracking-tighter mb-3">
                        Key Topics
                      </h3>
                      <ul className="space-y-2">
                        {parsedDoc.metadata.headings.map((heading, index) => (
                          <li
                            key={index}
                            className="text-sm text-text-secondary-light dark:text-text-secondary-dark flex items-start gap-2"
                          >
                            <span className="text-accent-warm mt-1">•</span>
                            <span>{heading}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Content Preview */}
                  <div className="bg-card-light dark:bg-card-dark rounded-squircle p-6 shadow-ambient dark:shadow-ambient-dark">
                    <h3 className="text-sm font-semibold text-text-primary-light dark:text-text-primary-dark tracking-tighter mb-3">
                      Content Preview
                    </h3>
                    <div className="text-sm text-text-secondary-light dark:text-text-secondary-dark leading-relaxed whitespace-pre-wrap font-mono">
                      {parsedDoc.content_preview}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
