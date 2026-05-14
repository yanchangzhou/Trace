'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, FileText, File as FileIcon, List, Quote, Hash, Loader2 } from 'lucide-react';
import { useFilePreview } from '@/contexts/FilePreviewContext';
import { useSidebar } from '@/contexts/SidebarContext';
import { useEffect, useState, useCallback, useRef } from 'react';
import { ParsedDocument, DocumentChunk } from '@/types';
import { parseDocument } from '@/lib/documentParser';
import { buildPreviewFileFromBytes } from '@/lib/previewFile';
import DocumentRenderer from './DocumentRenderer';
import { invoke } from '@tauri-apps/api/core';
import { getDocumentChunks, isTauriEnvironment } from '@/lib/tauri';

const springConfig = {
  type: 'spring' as const,
  stiffness: 200,
  damping: 25,
};

const PREVIEWABLE = new Set(['pdf', 'docx', 'pptx', 'txt', 'md']);

export default function FilePreviewPanel() {
  const { isOpen, currentFile, closePreview, previewWidth, setPreviewWidth, highlightLocator, clearHighlightLocator } =
    useFilePreview();
  const { sidebarWidth } = useSidebar();
  const [parsedContent, setParsedContent] = useState<ParsedDocument | null>(null);
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTauri, setIsTauri] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [stableDocWidth, setStableDocWidth] = useState(600);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [activeTab, setActiveTab] = useState<'preview' | 'outline' | 'snippets'>('preview');
  const headingListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsTauri(isTauriEnvironment());
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
    const handleMouseUp = () => setIsResizing(false);
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
    [],
  );

  useEffect(() => {
    if (!currentFile || !isOpen) {
      setParsedContent(null);
      setPreviewFile(null);
      setChunks([]);
      return;
    }

    const parseFile = async () => {
      setIsLoading(true);
      setPreviewFile(null);
      setChunks([]);

      try {
        if (isTauri) {
          const parsed = await invoke<ParsedDocument>('parse_document', {
            filePath: currentFile.path,
          });
          setParsedContent(parsed);
          applyParsedForPreview(parsed, currentFile);

          // Try to load document chunks
          try {
            const docChunks = await getDocumentChunks(currentFile.id || currentFile.path);
            setChunks(docChunks);
          } catch {
            // Chunks not available yet
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
            setParsedContent({
              file_path: currentFile.name,
              file_type: currentFile.extension,
              summary: `${currentFile.extension.toUpperCase()} document (${((currentFile.file?.size || 0) / 1024).toFixed(2)} KB)`,
              metadata: { word_count: 0, has_images: false, headings: [] },
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

  // Scroll to highlighted locator when it changes
  useEffect(() => {
    if (highlightLocator && !isLoading) {
      clearHighlightLocator();
    }
  }, [highlightLocator, isLoading, clearHighlightLocator]);

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

  const tabs = [
    { key: 'preview' as const, label: 'Preview', icon: FileText },
    { key: 'outline' as const, label: 'Outline', icon: List },
    { key: 'snippets' as const, label: 'Snippets', icon: Quote },
  ];

  return (
    <AnimatePresence>
      {isOpen && currentFile && (
        <>
          {/* Resize handle */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed top-12 bottom-0 w-1 bg-transparent hover:bg-accent-warm/50 cursor-ew-resize z-40 group"
            style={{ left: `${sidebarWidth + previewWidth}px` }}
            onMouseDown={() => setIsResizing(true)}
          >
            <div className="absolute inset-y-0 -left-1 -right-1" />
          </motion.div>

          <motion.div
            initial={{ x: -previewWidth, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -previewWidth, opacity: 0 }}
            transition={springConfig}
            className="fixed top-12 bottom-0 bg-surface-light dark:bg-surface-dark border-r border-border-light dark:border-border-dark z-30 overflow-hidden flex flex-col"
            style={{ left: `${sidebarWidth}px`, width: `${previewWidth}px` }}
          >
            {/* Header */}
            <div className="h-16 flex items-center justify-between px-6 border-b border-border-light dark:border-border-dark flex-shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                {getIcon(currentFile.extension)}
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-text-primary-light dark:text-text-primary-dark tracking-tight truncate">
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
                className="w-8 h-8 rounded-lg hover:bg-background-light dark:hover:bg-background-dark transition-colors flex items-center justify-center flex-shrink-0"
              >
                <X className="w-4 h-4 text-text-secondary-light dark:text-text-secondary-dark" />
              </button>
            </div>

            {/* Tab bar */}
            <div className="flex border-b border-border-light dark:border-border-dark flex-shrink-0">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
                    activeTab === tab.key
                      ? 'text-accent-warm border-b-2 border-accent-warm'
                      : 'text-text-tertiary-light dark:text-text-tertiary-dark hover:text-text-secondary-light dark:hover:text-text-secondary-dark'
                  }`}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Content area */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-accent-warm animate-spin" />
                </div>
              ) : parsedContent ? (
                <div>
                  {/* Document Preview Tab */}
                  {activeTab === 'preview' && (
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

                      {/* Summary Card */}
                      <div className="px-6">
                        <h4 className="text-xs font-semibold text-text-secondary-light dark:text-text-secondary-dark uppercase tracking-wider mb-2">
                          Summary
                        </h4>
                        <div className="bg-card-light dark:bg-card-dark rounded-squircle p-4">
                          <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark leading-relaxed">
                            {parsedContent.summary}
                          </p>
                        </div>
                      </div>

                      {/* Document Info */}
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

                      {/* Key Topics */}
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
                  )}

                  {/* Outline Tab */}
                  {activeTab === 'outline' && (
                    <div className="px-6 py-6" ref={headingListRef}>
                      {parsedContent.metadata.headings.length > 0 ? (
                        <div className="space-y-1">
                          {parsedContent.metadata.headings.map((heading, index) => (
                            <motion.button
                              key={index}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: index * 0.03 }}
                              className="w-full text-left px-3 py-2 rounded-lg hover:bg-background-light dark:hover:bg-background-dark transition-colors flex items-center gap-2 group"
                            >
                              <Hash className="w-3.5 h-3.5 text-text-tertiary-light dark:text-text-tertiary-dark group-hover:text-accent-warm transition-colors flex-shrink-0" />
                              <span className="text-sm text-text-secondary-light dark:text-text-secondary-dark group-hover:text-text-primary-light dark:group-hover:text-text-primary-dark transition-colors truncate">
                                {heading}
                              </span>
                            </motion.button>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <p className="text-sm text-text-tertiary-light dark:text-text-tertiary-dark">
                            No headings found in this document
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Snippets Tab */}
                  {activeTab === 'snippets' && (
                    <div className="px-6 py-6">
                      {chunks.length > 0 ? (
                        <div className="space-y-3">
                          {chunks.slice(0, 10).map((chunk, index) => (
                            <motion.div
                              key={chunk.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: index * 0.05 }}
                              className="bg-card-light dark:bg-card-dark rounded-squircle-sm p-4 shadow-ambient dark:shadow-ambient-dark"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-text-tertiary-light dark:text-text-tertiary-dark">
                                  Chunk {chunk.chunk_index + 1} &middot; {chunk.token_count} tokens
                                </span>
                              </div>
                              <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark leading-relaxed line-clamp-4">
                                {chunk.text}
                              </p>
                            </motion.div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <p className="text-sm text-text-tertiary-light dark:text-text-tertiary-dark">
                            {isTauri
                              ? 'Content snippets will appear here once indexed'
                              : 'Content snippets are available in the Tauri desktop app'}
                          </p>
                        </div>
                      )}
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
