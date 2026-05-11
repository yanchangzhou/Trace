'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Image, File, ChevronLeft, Upload, MoreVertical, Trash2, RefreshCw, AlertCircle, FileEdit, Layers } from 'lucide-react';
import { useSidebar } from '@/contexts/SidebarContext';
import { useBook } from '@/contexts/BookContext';
import { useFilePreview } from '@/contexts/FilePreviewContext';
import { useState, useEffect, useCallback } from 'react';
import BookSelector from './BookSelector';
import NoteList from './editor/NoteList';
import { SourceFile } from '@/types';
import {
  copyFileToBook,
  createStyleProfileFromSamples,
  getIndexStats,
  retryFileParse,
  selectFiles,
  updateLibraryFileRole,
} from '@/lib/tauri';

type RailTab = 'sources' | 'notes';

const springConfig = {
  type: 'spring' as const,
  stiffness: 200,
  damping: 25,
};

export default function SourceRail() {
  const { isCollapsed, setIsCollapsed } = useSidebar();
  const {
    currentBook,
    currentFiles,
    addBrowserFilesToCurrentBook,
    removeFileFromCurrentBook,
    refreshLibrary,
    isLoading: isLibraryLoading,
    isTauri,
    error,
  } = useBook();
  const { openPreview } = useFilePreview();
  const [activeTab, setActiveTab] = useState<RailTab>('sources');
  const [isUploading, setIsUploading] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreatingStyle, setIsCreatingStyle] = useState(false);
  const [indexStats, setIndexStats] = useState<{
    total_documents: number;
    total_chunks: number;
    index_size_bytes: number;
    last_indexed_at: number;
  } | null>(null);

  const loadIndexStats = useCallback(async () => {
    if (!isTauri) return;
    try {
      const stats = await getIndexStats();
      setIndexStats(stats);
    } catch {
      setIndexStats(null);
    }
  }, [isTauri]);

  useEffect(() => {
    loadIndexStats();
  }, [loadIndexStats, currentFiles]);

  const handleBrowserUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !currentBook) return;

    const nextFiles: SourceFile[] = Array.from(files).map((file) => {
      const fileName = file.name;
      const extension = fileName.split('.').pop()?.toLowerCase() || '';

      return {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        name: fileName,
        path: URL.createObjectURL(file),
        extension,
        bookId: currentBook.id,
        addedAt: Date.now(),
        file,
        status: 'ready',
        role: 'source',
        parseStatus: 'ready',
        parseError: null,
        size: file.size,
      };
    });

    addBrowserFilesToCurrentBook(nextFiles);
    event.target.value = '';
  };

  const handleUpload = async () => {
    if (!currentBook) {
      alert('Please select or create a book first');
      return;
    }

    if (!isTauri) {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = '.pdf,.docx,.pptx,.txt,.md';
      // Must be in the DOM for the file picker to work reliably across browsers.
      input.style.display = 'none';
      document.body.appendChild(input);
      input.onchange = (e) => {
        handleBrowserUpload(e as unknown as React.ChangeEvent<HTMLInputElement>);
        document.body.removeChild(input);
      };
      // Also clean up if the dialog is dismissed without selection.
      input.addEventListener('cancel', () => {
        if (document.body.contains(input)) document.body.removeChild(input);
      });
      input.click();
      return;
    }

    try {
      setIsUploading(true);

      const selectedFiles = await selectFiles();
      if (selectedFiles.length === 0) {
        return;
      }

      for (const filePath of selectedFiles) {
        try {
          await copyFileToBook(filePath, currentBook.id);
        } catch (uploadError) {
          console.error(`Failed to upload file ${filePath}:`, uploadError);
        }
      }

      await refreshLibrary();
    } catch (uploadError) {
      console.error('Failed to upload files:', uploadError);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileClick = (file: SourceFile) => {
    openPreview(file);
  };

  const handleDeleteFile = async (file: SourceFile, e: React.MouseEvent) => {
    e.stopPropagation();

    const confirmed = confirm(`Delete "${file.name}"?`);
    if (!confirmed) return;

    try {
      await removeFileFromCurrentBook(file);
      setOpenMenuId(null);
    } catch (deleteError) {
      console.error('Failed to delete file:', deleteError);
      alert(deleteError instanceof Error ? deleteError.message : 'Failed to delete file');
    }
  };

  const handleSetFileRole = async (file: SourceFile, role: 'source' | 'style_sample' | 'both', e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isTauri) {
      return;
    }

    try {
      await updateLibraryFileRole(file.id, role);
      await refreshLibrary();
      setOpenMenuId(null);
    } catch (roleError) {
      console.error('Failed to update file role:', roleError);
      alert(roleError instanceof Error ? roleError.message : 'Failed to update file role');
    }
  };

  const handleRetryParse = async (file: SourceFile, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isTauri) return;
    try {
      await retryFileParse(file.id, file.path);
      await refreshLibrary();
      setOpenMenuId(null);
    } catch (retryError) {
      console.error('Failed to retry file parsing:', retryError);
      alert(retryError instanceof Error ? retryError.message : 'Failed to retry file parsing');
    }
  };

  const handleCreateStyleProfile = async () => {
    const sampleFiles = files.filter((file) => file.role === 'style_sample' || file.role === 'both');
    if (sampleFiles.length === 0) {
      alert('Mark at least one file as a style sample first.');
      return;
    }

    const name = currentBook ? `${currentBook.name} Style` : 'Uploaded Sample Style';
    setIsCreatingStyle(true);
    try {
      const profile = await createStyleProfileFromSamples(name, sampleFiles.map((file) => file.id));
      if (!profile) {
        alert('Failed to create style profile. Make sure sample files have finished parsing.');
      } else {
        alert(`Created style profile "${profile.name}". Open AI Assist to use it.`);
      }
    } catch (styleError) {
      console.error('Failed to create style profile:', styleError);
      alert(styleError instanceof Error ? styleError.message : 'Failed to create style profile');
    } finally {
      setIsCreatingStyle(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshLibrary();
    } finally {
      setIsRefreshing(false);
    }
  };

  const getIcon = (extension: string) => {
    const iconClass = 'w-6 h-6';

    switch (extension.toLowerCase()) {
      case 'pdf':
        return <FileText className={iconClass} />;
      case 'pptx':
      case 'ppt':
        return <File className={iconClass} />;
      case 'docx':
      case 'doc':
        return <File className={iconClass} />;
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
        return <Image className={iconClass} />;
      default:
        return <File className={iconClass} />;
    }
  };

  const files = currentFiles;
  const railBusy = isLibraryLoading || isUploading;

  return (
    <motion.aside
      initial={{ x: -20, opacity: 0 }}
      animate={{
        x: 0,
        opacity: 1,
        width: isCollapsed ? '64px' : '280px',
      }}
      transition={springConfig}
      className="fixed left-0 top-12 bottom-0 flex flex-col bg-surface-light dark:bg-surface-dark border-r border-border-light dark:border-border-dark overflow-hidden z-40"
    >
      <div className="h-16 flex items-center justify-between px-4 border-b border-border-light dark:border-border-dark">
        {!isCollapsed && (
          <motion.h2
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm font-semibold text-text-primary-light dark:text-text-primary-dark tracking-tighter"
          >
            Sources
          </motion.h2>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="w-8 h-8 rounded-lg hover:bg-background-light dark:hover:bg-background-dark transition-colors flex items-center justify-center"
        >
          <ChevronLeft
            className={`w-4 h-4 text-text-secondary-light dark:text-text-secondary-dark transition-transform ${
              isCollapsed ? 'rotate-180' : ''
            }`}
          />
        </button>
      </div>

      <div className="p-4 pb-2">
        <BookSelector isCollapsed={isCollapsed} />
      </div>

      {/* Tab bar */}
      {!isCollapsed ? (
        <div className="flex mx-4 mb-1 rounded-lg bg-background-light dark:bg-background-dark p-0.5 gap-0.5">
          <button
            onClick={() => setActiveTab('sources')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'sources'
                ? 'bg-card-light dark:bg-card-dark text-text-primary-light dark:text-text-primary-dark shadow-sm'
                : 'text-text-tertiary-light dark:text-text-tertiary-dark hover:text-text-secondary-light dark:hover:text-text-secondary-dark'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Sources
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'notes'
                ? 'bg-card-light dark:bg-card-dark text-text-primary-light dark:text-text-primary-dark shadow-sm'
                : 'text-text-tertiary-light dark:text-text-tertiary-dark hover:text-text-secondary-light dark:hover:text-text-secondary-dark'
            }`}
          >
            <FileEdit className="w-3.5 h-3.5" />
            Notes
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1 px-3 mb-1">
          <button
            onClick={() => setActiveTab('sources')}
            className={`w-full h-8 rounded-lg flex items-center justify-center transition-colors ${
              activeTab === 'sources'
                ? 'bg-card-light dark:bg-card-dark text-accent-warm'
                : 'text-text-tertiary-light dark:text-text-tertiary-dark hover:bg-background-light dark:hover:bg-background-dark'
            }`}
            title="Sources"
          >
            <Layers className="w-4 h-4" />
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={`w-full h-8 rounded-lg flex items-center justify-center transition-colors ${
              activeTab === 'notes'
                ? 'bg-card-light dark:bg-card-dark text-accent-warm'
                : 'text-text-tertiary-light dark:text-text-tertiary-dark hover:bg-background-light dark:hover:bg-background-dark'
            }`}
            title="Notes"
          >
            <FileEdit className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tab content — single AnimatePresence to prevent dual-tree conflicts */}
      <AnimatePresence mode="wait" initial={false}>
        {activeTab === 'notes' ? (
          <motion.div
            key="notes"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            className="flex-1 overflow-hidden flex flex-col"
          >
            <NoteList isCollapsed={isCollapsed} />
          </motion.div>
        ) : (
          <motion.div
            key="sources"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            className="flex flex-col flex-1 overflow-hidden"
          >
            <div className="px-4 pb-3 space-y-2">
              <div className="flex gap-2">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => void handleUpload()}
                  disabled={railBusy || !currentBook}
                  className={`h-10 rounded-squircle bg-accent-primary text-white flex items-center gap-2 hover:bg-accent-primary/90 transition-colors shadow-ambient dark:shadow-ambient-dark disabled:opacity-50 disabled:cursor-not-allowed ${
                    isCollapsed ? 'w-full justify-center px-2' : 'flex-1 justify-center px-4'
                  }`}
                >
                  <Upload className="w-4 h-4 flex-shrink-0" />
                  {!isCollapsed && <span className="text-sm font-medium">Upload Files</span>}
                </motion.button>

                {!isCollapsed && (
                  <button
                    onClick={() => void handleRefresh()}
                    disabled={railBusy || isRefreshing}
                    className="w-10 h-10 rounded-squircle bg-card-light dark:bg-card-dark text-text-secondary-light dark:text-text-secondary-dark hover:bg-background-light dark:hover:bg-background-dark transition-colors shadow-ambient dark:shadow-ambient-dark disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    aria-label="Refresh library"
                  >
                    <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  </button>
                )}
              </div>

              {!isCollapsed && isTauri && files.some((file) => file.role === 'style_sample' || file.role === 'both') && (
                <button
                  onClick={() => void handleCreateStyleProfile()}
                  disabled={isCreatingStyle}
                  className="w-full h-9 rounded-squircle bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark hover:bg-background-light dark:hover:bg-background-dark transition-colors disabled:opacity-50"
                >
                  {isCreatingStyle ? 'Creating style profile...' : 'Create Style Profile from Samples'}
                </button>
              )}

              {!isCollapsed && error && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-red-500 leading-5">{error}</p>
                </div>
              )}
            </div>

            <div className="px-4 pb-4 overflow-y-auto flex-1">
              {railBusy ? (
                <div className="flex items-center justify-center py-8">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-6 h-6 border-2 border-accent-warm border-t-transparent rounded-full"
                  />
                </div>
              ) : files.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-text-tertiary-light dark:text-text-tertiary-dark">
                    {isCollapsed ? '📁' : 'No files yet'}
                  </p>
                  {!isCollapsed && (
                    <p className="text-xs text-text-tertiary-light dark:text-text-tertiary-dark mt-2">
                      Upload files to get started
                    </p>
                  )}
                </div>
              ) : (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentBook?.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={springConfig}
                    className={`${isCollapsed ? 'space-y-3' : 'grid grid-cols-2 gap-3'}`}
                  >
                    {files.map((file, index) => (
                      <motion.div
                        key={file.id}
                        layout
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{
                          layout: springConfig,
                          opacity: { duration: 0.3, delay: index * 0.05 },
                          y: { ...springConfig, delay: index * 0.05 },
                        }}
                        whileHover={{ scale: 1.03, y: -2 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFileClick(file);
                        }}
                        className={`${
                          isCollapsed ? 'w-full h-12' : 'aspect-square'
                        } bg-card-light dark:bg-card-dark rounded-squircle-sm cursor-pointer shadow-ambient dark:shadow-ambient-dark hover:shadow-ambient-lg dark:hover:shadow-ambient-lg-dark transition-shadow duration-200 relative group`}
                        title={file.name}
                      >
                        <motion.div
                          layout
                          className="flex flex-col items-center justify-center h-full w-full p-4"
                        >
                          <motion.div
                            layout
                            className="flex items-center justify-center text-accent-warm"
                          >
                            {getIcon(file.extension)}
                          </motion.div>

                          <motion.div
                            layout
                            initial={false}
                            animate={{
                              opacity: isCollapsed ? 0 : 1,
                              height: isCollapsed ? 0 : 'auto',
                              marginTop: isCollapsed ? 0 : 8,
                            }}
                            transition={{
                              type: 'spring',
                              stiffness: 200,
                              damping: 25,
                              opacity: { duration: 0.2 },
                            }}
                            className="overflow-hidden w-full"
                          >
                            <p className="text-xs font-medium text-text-primary-light dark:text-text-primary-dark truncate tracking-tight text-center">
                              {file.name}
                            </p>
                            {file.parseStatus && file.parseStatus !== 'ready' && (
                              <p
                                className={`mt-1 text-[10px] text-center truncate ${
                                  file.parseStatus === 'failed' ? 'text-red-500' : 'text-amber-500'
                                }`}
                                title={file.parseError || file.parseStatus}
                              >
                                {file.parseStatus === 'failed' ? 'parse failed' : file.parseStatus}
                              </p>
                            )}
                            {!isCollapsed && file.role && file.role !== 'source' && (
                              <p className="mt-1 text-[10px] text-accent-warm text-center truncate">
                                {file.role === 'both' ? 'source + style' : 'style sample'}
                              </p>
                            )}
                          </motion.div>
                        </motion.div>

                        {!isCollapsed && (
                          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(openMenuId === file.id ? null : file.id);
                              }}
                              className="w-6 h-6 rounded-lg bg-surface-light dark:bg-surface-dark hover:bg-background-light dark:hover:bg-background-dark flex items-center justify-center shadow-sm"
                            >
                              <MoreVertical className="w-3 h-3 text-text-secondary-light dark:text-text-secondary-dark" />
                            </button>

                            <AnimatePresence>
                              {openMenuId === file.id && (
                                <motion.div
                                  initial={{ opacity: 0, scale: 0.95, y: -5 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.95, y: -5 }}
                                  transition={{ duration: 0.15 }}
                                  className="absolute mt-1 w-40 bg-card-light dark:bg-card-dark rounded-squircle-sm shadow-ambient-lg dark:shadow-ambient-lg-dark border border-border-light dark:border-border-dark overflow-hidden z-50"
                                  style={{ top: '100%', right: '0' }}
                                >
                                  {isTauri && (
                                    <>
                                      <button
                                        onClick={(e) => void handleSetFileRole(file, 'source', e)}
                                        className="w-full px-3 py-2 text-left text-xs text-text-secondary-light dark:text-text-secondary-dark hover:bg-background-light dark:hover:bg-background-dark transition-colors"
                                      >
                                        Use as Source
                                      </button>
                                      <button
                                        onClick={(e) => void handleSetFileRole(file, 'style_sample', e)}
                                        className="w-full px-3 py-2 text-left text-xs text-text-secondary-light dark:text-text-secondary-dark hover:bg-background-light dark:hover:bg-background-dark transition-colors"
                                      >
                                        Style Sample
                                      </button>
                                      <button
                                        onClick={(e) => void handleSetFileRole(file, 'both', e)}
                                        className="w-full px-3 py-2 text-left text-xs text-text-secondary-light dark:text-text-secondary-dark hover:bg-background-light dark:hover:bg-background-dark transition-colors"
                                      >
                                        Source + Style
                                      </button>
                                    </>
                                  )}
                                  {isTauri && file.parseStatus === 'failed' && (
                                    <button
                                      onClick={(e) => void handleRetryParse(file, e)}
                                      className="w-full px-3 py-2 text-left text-xs text-amber-600 dark:text-amber-400 hover:bg-background-light dark:hover:bg-background-dark transition-colors"
                                    >
                                      Retry Parse
                                    </button>
                                  )}
                                  <button
                                    onClick={(e) => void handleDeleteFile(file, e)}
                                    className="w-full px-3 py-2 text-left text-sm text-red-500 hover:bg-background-light dark:hover:bg-background-dark transition-colors flex items-center gap-2"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    Delete
                                  </button>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </motion.div>
                </AnimatePresence>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isTauri && !isCollapsed && indexStats && activeTab === 'sources' && (
        <div className="px-4 pb-3">
          <div className="bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark rounded-lg px-3 py-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-tertiary-light dark:text-text-tertiary-dark">Indexed</span>
              <span className="text-text-primary-light dark:text-text-primary-dark font-medium">
                {indexStats.total_documents} docs / {indexStats.total_chunks} chunks
              </span>
            </div>
          </div>
        </div>
      )}

      {!isTauri && !isCollapsed && (
        <div className="px-4 pb-4">
          <div className="bg-accent-warm/10 border border-accent-warm/20 rounded-lg px-3 py-2">
            <p className="text-xs text-accent-warm text-center">
              Browser Preview Mode
            </p>
          </div>
        </div>
      )}
    </motion.aside>
  );
}
