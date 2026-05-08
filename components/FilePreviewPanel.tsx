'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, FileText, File as FileIcon } from 'lucide-react';
import { useFilePreview } from '@/contexts/FilePreviewContext';
import { useSidebar } from '@/contexts/SidebarContext';
import { useEffect, useState, useCallback } from 'react';
import { ParsedDocument } from '@/types';
import { parseDocument } from '@/lib/documentParser';
import { buildPreviewFileFromBytes } from '@/lib/previewFile';
import { parseAndStoreDocument } from '@/lib/tauri';
import DocumentRenderer from './DocumentRenderer';
import { invoke } from '@tauri-apps/api/core';

const springConfig = {
  type: 'spring' as const,
  stiffness: 200,
  damping: 25,
};

const PREVIEWABLE = new Set(['pdf', 'docx', 'pptx', 'txt', 'md']);

export default function FilePreviewPanel() {
  const { isOpen, currentFile, closePreview, previewWidth, setPreviewWidth } = useFilePreview();
  const { sidebarWidth } = useSidebar();
  const [parsedContent, setParsedContent] = useState<ParsedDocument | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTauri, setIsTauri] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  /** Frozen layout width for DocumentRenderer — only updates when not dragging (anti-flicker). */
  const [stableDocWidth, setStableDocWidth] = useState(600);
  const [previewFile, setPreviewFile] = useState<File | null>(null);

  useEffect(() => {
    const checkTauri = () => {
      try {
        if (typeof window !== 'undefined' && (window as unknown as { __TAURI__?: unknown }).__TAURI__) {
          setIsTauri(true);
        }
      } catch {
        /* browser */
      }
    };
    checkTauri();
  }, []);

  useEffect(() => {
    if (!isOpen || isResizing) return;
    const w = Math.max(400, previewWidth);
    setStableDocWidth(w);
  }, [isOpen, previewWidth, isResizing]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const editorReservePx = 300;
      const maxViewer = Math.max(400, window.innerWidth - sidebarWidth - editorReservePx);
      const raw = e.clientX - sidebarWidth;
      const clamped = Math.max(400, Math.min(maxViewer, raw));
      setPreviewWidth(clamped);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, sidebarWidth, setPreviewWidth]);

  const applyParsedForPreview = useCallback(
    (parsed: ParsedDocument | null, file: typeof currentFile) => {
      if (!file) return;
      if (file.file) {
        setPreviewFile(file.file);
        return;
      }
      const bytes = parsed?.content_bytes;
      if (bytes && bytes.length > 0) {
        try {
          setPreviewFile(buildPreviewFileFromBytes(bytes, file.name, file.extension));
        } catch (e) {
          console.error('Failed to build preview file:', e);
          setPreviewFile(null);
        }
      } else {
        setPreviewFile(null);
      }
    },
    []
  );

  useEffect(() => {
    if (!currentFile || !isOpen) {
      setParsedContent(null);
      setPreviewFile(null);
      return;
    }

    const parseFile = async () => {
      setIsLoading(true);
      setPreviewFile(null);

      try {
        if (isTauri) {
          const parsed = await invoke<ParsedDocument>('parse_document', {
            filePath: currentFile.path,
          });
          setParsedContent(parsed);
          applyParsedForPreview(parsed, currentFile);

          // Also store document chunks in the DB
          const fileId = Number(currentFile.id);
          if (!isNaN(fileId)) {
            parseAndStoreDocument(fileId, currentFile.path).catch((err) =>
              console.error('Failed to store document data:', err)
            );
          }

          setIsLoading(false);
        } else {
          if (!currentFile.file) {
            setParsedContent(null);
            setPreviewFile(null);
            setIsLoading(false);
            return;
          }

          try {
            const result = await parseDocument(currentFile.file);
            const preview = result.text.substring(0, 2000) + (result.text.length > 2000 ? '...' : '');

            const parsed: ParsedDocument = {
              file_path: currentFile.name,
              file_type: currentFile.extension,
              summary: `${currentFile.extension.toUpperCase()} document with ${result.metadata.wordCount} words`,
              metadata: {
                page_count: result.metadata.pageCount,
                slide_count: result.metadata.slideCount,
                word_count: result.metadata.wordCount,
                has_images: false,
                headings: result.metadata.headings,
              },
              content_preview: preview,
            };
            setParsedContent(parsed);
            applyParsedForPreview(parsed, currentFile);
            setIsLoading(false);
          } catch (error) {
            console.error('Failed to parse document:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);

            const isOldFormat =
              currentFile.extension.toLowerCase() === 'doc' ||
              currentFile.extension.toLowerCase() === 'ppt';

            let userFriendlyMessage = errorMessage;
            if (isOldFormat) {
              userFriendlyMessage = `Old ${currentFile.extension.toUpperCase()} format is not supported in browser mode. Please save as .${currentFile.extension}x (newer format) or use the Tauri desktop app.`;
            }

            const fileSize = currentFile.file?.size || 0;
            const fileSizeKB = (fileSize / 1024).toFixed(2);
            setParsedContent({
              file_path: currentFile.name,
              file_type: currentFile.extension,
              summary: `${currentFile.extension.toUpperCase()} document (${fileSizeKB} KB)`,
              metadata: {
                word_count: 0,
                has_images: false,
                headings: [],
              },
              content_preview: userFriendlyMessage,
            });
            setPreviewFile(currentFile.file ?? null);
            setIsLoading(false);
          }
        }
      } catch (error) {
        console.error('Failed to parse file:', error);
        setParsedContent(null);
        setPreviewFile(null);
        setIsLoading(false);
      }
    };

    parseFile();
  }, [currentFile, isOpen, isTauri, applyParsedForPreview]);

  const getIcon = (extension: string) => {
    switch (extension.toLowerCase()) {
      case 'pdf':
        return <FileText className="w-8 h-8 text-accent-warm" />;
      default:
        return <FileIcon className="w-8 h-8 text-accent-warm" />;
    }
  };

  const showDocRenderer =
    !!previewFile && currentFile && PREVIEWABLE.has(currentFile.extension.toLowerCase());

  return (
    <AnimatePresence>
      {isOpen && currentFile && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed top-12 bottom-0 w-1 bg-transparent hover:bg-accent-warm/50 cursor-ew-resize z-40 group"
            style={{
              left: `${sidebarWidth + previewWidth}px`,
            }}
            onMouseDown={() => setIsResizing(true)}
          >
            <div className="absolute inset-y-0 -left-1 -right-1" />
          </motion.div>

          <motion.div
            initial={{ x: -previewWidth, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -previewWidth, opacity: 0 }}
            transition={springConfig}
            className="fixed top-12 bottom-0 bg-surface-light dark:bg-surface-dark border-r border-border-light dark:border-border-dark z-30 overflow-hidden"
            style={{
              left: `${sidebarWidth}px`,
              width: `${previewWidth}px`,
            }}
          >
            <div className="h-16 flex items-center justify-between px-6 border-b border-border-light dark:border-border-dark">
              <div className="flex items-center gap-3">
                {getIcon(currentFile.extension)}
                <div>
                  <h3 className="text-sm font-semibold text-text-primary-light dark:text-text-primary-dark tracking-tight">
                    {currentFile.name}
                  </h3>
                  <p className="text-xs text-text-tertiary-light dark:text-text-tertiary-dark">
                    {currentFile.extension.toUpperCase()}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closePreview}
                className="w-8 h-8 rounded-lg hover:bg-background-light dark:hover:bg-background-dark transition-colors flex items-center justify-center"
              >
                <X className="w-4 h-4 text-text-secondary-light dark:text-text-secondary-dark" />
              </button>
            </div>

            <div className="overflow-y-auto overflow-x-hidden" style={{ height: 'calc(100% - 64px)' }}>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-8 h-8 border-2 border-accent-warm border-t-transparent rounded-full"
                  />
                </div>
              ) : parsedContent ? (
                <div className="space-y-6">
                  {showDocRenderer && (
                    <div className="px-6 pt-6">
                      <h4 className="text-xs font-semibold text-text-secondary-light dark:text-text-secondary-dark uppercase tracking-wider mb-4">
                        Document Preview
                      </h4>
                      <div
                        className="bg-[#F7F5F2] dark:bg-gray-900 rounded-squircle p-6 shadow-inner w-full max-w-full overflow-x-hidden"
                        style={{ willChange: 'transform', contain: 'layout' }}
                      >
                        <DocumentRenderer
                          file={previewFile!}
                          fileType={currentFile.extension}
                          containerWidth={stableDocWidth}
                        />
                      </div>
                    </div>
                  )}

                  <div className="px-6">
                    <h4 className="text-xs font-semibold text-text-secondary-light dark:text-text-secondary-dark uppercase tracking-wider mb-2">
                      Document Info
                    </h4>
                    <div className="bg-card-light dark:bg-card-dark rounded-squircle p-4 space-y-2">
                      {parsedContent.metadata.page_count != null && (
                        <div className="flex justify-between text-sm">
                          <span className="text-text-tertiary-light dark:text-text-tertiary-dark">Pages</span>
                          <span className="text-text-primary-light dark:text-text-primary-dark font-medium">
                            {parsedContent.metadata.page_count}
                          </span>
                        </div>
                      )}
                      {parsedContent.metadata.slide_count != null && (
                        <div className="flex justify-between text-sm">
                          <span className="text-text-tertiary-light dark:text-text-tertiary-dark">Slides</span>
                          <span className="text-text-primary-light dark:text-text-primary-dark font-medium">
                            {parsedContent.metadata.slide_count}
                          </span>
                        </div>
                      )}
                      {parsedContent.metadata.word_count > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-text-tertiary-light dark:text-text-tertiary-dark">Words</span>
                          <span className="text-text-primary-light dark:text-text-primary-dark font-medium">
                            {parsedContent.metadata.word_count.toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {parsedContent.metadata.headings.length > 0 && (
                    <div className="px-6 pb-6">
                      <h4 className="text-xs font-semibold text-text-secondary-light dark:text-text-secondary-dark uppercase tracking-wider mb-2">
                        Key Topics
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {parsedContent.metadata.headings.slice(0, 10).map((heading, index) => (
                          <span
                            key={index}
                            className="px-3 py-1 bg-accent-warm/10 text-accent-warm text-xs rounded-full"
                          >
                            {heading}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center py-12">
                  <p className="text-sm text-text-tertiary-light dark:text-text-tertiary-dark">
                    Failed to load preview
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
