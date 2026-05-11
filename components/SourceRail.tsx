'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Upload, RefreshCw } from 'lucide-react';
import { useSidebar, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH } from '@/contexts/SidebarContext';
import { useBook } from '@/contexts/BookContext';
import { useFilePreview } from '@/contexts/FilePreviewContext';
import { useEffect, useState, useCallback } from 'react';
import BookSelector from './BookSelector';
import FileCard from './source/FileCard';
import { SourceFile } from '@/types';
import { selectFiles, copyFileToBook, reindexFiles, getDocsFolder, deleteFile as deleteFileTauri } from '@/lib/tauri';

const springConfig = {
  type: 'spring' as const,
  stiffness: 200,
  damping: 25,
};

export default function SourceRail() {
  const { isCollapsed, setIsCollapsed, sidebarWidth, setExpandedWidth } = useSidebar();
  const { currentBook, addFileToBook, removeFileFromBook, getFilesForCurrentBook, refreshFiles, isTauri } = useBook();
  const { openPreview } = useFilePreview();
  const [isLoading, setIsLoading] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  // Drag-to-resize effect
  useEffect(() => {
    if (!isResizing) return;
    const onMouseMove = (e: MouseEvent) => {
      const clamped = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, e.clientX));
      setExpandedWidth(clamped);
    };
    const onMouseUp = () => setIsResizing(false);
    document.body.classList.add('no-transitions');
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.body.classList.remove('no-transitions');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [isResizing, setExpandedWidth]);

  // Listen for Tauri file-status-changed events
  useEffect(() => {
    if (!isTauri) return;
    let unlisten: (() => void) | undefined;

    import('@tauri-apps/api/event')
      .then(({ listen }) => {
        listen<{ file_id: number; book_id: number; status: string; error_message: string }>(
          'file-status-changed',
          () => {
            refreshFiles();
          }
        ).then((fn) => {
          unlisten = fn;
        });
      })
      .catch(() => {
        /* event API not available */
      });

    return () => {
      unlisten?.();
    };
  }, [isTauri, refreshFiles]);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
  }, []);

  // Browser file upload handler
  const handleBrowserUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !currentBook) return;

    setIsLoading(true);

    Array.from(files).forEach((file) => {
      const fileName = file.name;
      const extension = fileName.split('.').pop()?.toLowerCase() || '';

      const newFile: SourceFile = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        name: fileName,
        path: URL.createObjectURL(file),
        extension,
        bookId: currentBook.id,
        addedAt: Date.now(),
        file,
      };

      addFileToBook(currentBook.id, newFile);
    });

    setIsLoading(false);
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
      input.onchange = (e) => handleBrowserUpload(e as any);
      input.click();
      return;
    }

    try {
      setIsLoading(true);

      const selectedFiles: string[] = await selectFiles();

      if (selectedFiles.length === 0) {
        setIsLoading(false);
        return;
      }

      for (const filePath of selectedFiles) {
        try {
          const newPath: string = await copyFileToBook(filePath, currentBook.name);

          const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'unknown';
          const extension = fileName.split('.').pop()?.toLowerCase() || '';

          const newFile: SourceFile = {
            id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            name: fileName,
            path: newPath,
            extension,
            bookId: currentBook.id,
            addedAt: Date.now(),
          };

          addFileToBook(currentBook.id, newFile);
        } catch (error) {
          console.error(`Failed to upload file ${filePath}:`, error);
        }
      }

      // Reindex and refresh DB files
      await reindexFiles();
      await refreshFiles();

      setIsLoading(false);
    } catch (error) {
      console.error('Failed to upload files:', error);
      setIsLoading(false);
    }
  };

  const handleOpenFolder = async () => {
    if (!isTauri) {
      alert('This feature requires the Tauri desktop app. Files should be in ~/TraceDocs');
      return;
    }

    try {
      const folder = await getDocsFolder();
      const { openFile } = await import('@/lib/tauri');
      await openFile(folder);
    } catch (error) {
      console.error('Failed to open folder:', error);
    }
  };

  const handleFileClick = (file: SourceFile) => {
    openPreview(file);
  };

  const handleDeleteFile = async (file: SourceFile, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!currentBook) return;

    const confirmed = confirm(`Delete "${file.name}"?`);
    if (!confirmed) return;

    removeFileFromBook(currentBook.id, file.id);

    if (isTauri) {
      try {
        const fileId = Number(file.id);
        if (!isNaN(fileId)) {
          await deleteFileTauri(fileId);
        }
      } catch (error) {
        console.error('Failed to delete file from backend:', error);
      }
    }
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    await refreshFiles();
    setIsLoading(false);
  };

  const files = getFilesForCurrentBook();

  return (
    <>
      <motion.aside
        initial={{ x: -20, opacity: 0 }}
        animate={{
          x: 0,
          opacity: 1,
          width: `${sidebarWidth}px`,
        }}
        transition={springConfig}
        className="fixed left-0 top-12 bottom-0 bg-surface-light dark:bg-surface-dark border-r border-border-light dark:border-border-dark overflow-hidden z-40"
      >
        {/* Header */}
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

        {/* Book Selector */}
        <div className="p-4">
          <BookSelector isCollapsed={isCollapsed} />
        </div>

        {/* Action Buttons */}
        <div className="px-4 pb-4 space-y-2">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleUpload}
            disabled={isLoading || !currentBook}
            className={`w-full h-12 rounded-squircle bg-accent-primary text-white flex items-center gap-2 hover:bg-accent-primary/90 transition-colors shadow-ambient dark:shadow-ambient-dark disabled:opacity-50 disabled:cursor-not-allowed ${
              isCollapsed ? 'justify-center px-2' : 'justify-center px-4'
            }`}
          >
            <Upload className="w-5 h-5 flex-shrink-0" />
            {!isCollapsed && <span className="text-sm font-medium">Upload Files</span>}
          </motion.button>

          {isTauri && !isCollapsed && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleRefresh}
              className="w-full h-10 rounded-squircle bg-card-light dark:bg-card-dark text-text-secondary-light dark:text-text-secondary-dark flex items-center gap-2 hover:bg-background-light dark:hover:bg-background-dark transition-colors justify-center"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="text-xs font-medium">Sync Files</span>
            </motion.button>
          )}

          {isTauri && !isCollapsed && (
            <button
              onClick={handleOpenFolder}
              className="w-full h-8 rounded-lg text-xs text-text-tertiary-light dark:text-text-tertiary-dark hover:text-accent-warm transition-colors"
            >
              Open TraceDocs folder
            </button>
          )}
        </div>

        {/* File List */}
        <div className="px-4 pb-4 overflow-y-auto" style={{ height: 'calc(100% - 320px)' }}>
          {isLoading ? (
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
                {isCollapsed ? '...' : 'No files yet'}
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
                className={`${isCollapsed ? 'space-y-3' : 'flex flex-col gap-2'}`}
              >
                {files.map((file, index) => (
                  <FileCard
                    key={file.id}
                    file={file}
                    index={index}
                    isCollapsed={isCollapsed}
                    onFileClick={handleFileClick}
                    onDelete={handleDeleteFile}
                  />
                ))}
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        {/* Browser Mode Indicator */}
        {!isTauri && !isCollapsed && (
          <div className="absolute bottom-4 left-4 right-4">
            <div className="bg-amber-100 dark:bg-amber-900/30 border border-amber-400/60 dark:border-amber-600/40 rounded-lg px-3 py-2.5">
              <p className="text-xs text-amber-700 dark:text-amber-300 text-center font-medium">
                Browser UI Demo
              </p>
              <p className="text-[10px] text-amber-600 dark:text-amber-400 text-center mt-1 leading-relaxed">
                File upload, AI assist, and persistence require the Tauri desktop app.
              </p>
            </div>
          </div>
        )}
      </motion.aside>

      {/* Resize handle */}
      <div
        className="fixed top-12 bottom-0 w-1.5 cursor-ew-resize z-50 group"
        style={{ left: `${sidebarWidth - 3}px` }}
        onMouseDown={handleResizeMouseDown}
      >
        <div className="w-full h-full bg-transparent group-hover:bg-accent-warm/40 transition-colors" />
      </div>
    </>
  );
}
