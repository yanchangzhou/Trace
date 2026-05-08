'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Image, File, ChevronLeft, Upload, MoreVertical, Trash2, RefreshCw } from 'lucide-react';
import { useSidebar } from '@/contexts/SidebarContext';
import { useBook } from '@/contexts/BookContext';
import { useFilePreview } from '@/contexts/FilePreviewContext';
import { useEffect, useState } from 'react';
import BookSelector from './BookSelector';
import { SourceFile } from '@/types';
import { selectFiles, copyFileToBook, reindexFiles, getDocsFolder, deleteFile as deleteFileTauri } from '@/lib/tauri';

const springConfig = {
  type: 'spring' as const,
  stiffness: 200,
  damping: 25,
};

export default function SourceRail() {
  const { isCollapsed, setIsCollapsed } = useSidebar();
  const { currentBook, addFileToBook, removeFileFromBook, getFilesForCurrentBook, refreshFiles, isTauri } = useBook();
  const { openPreview } = useFilePreview();
  const [isLoading, setIsLoading] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

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
    setOpenMenuId(null);

    if (isTauri) {
      try {
        // Try to delete by DB id if it's a real DB record
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

  const getIcon = (extension: string) => {
    const iconClass = "w-6 h-6";

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

  const files = getFilesForCurrentBook();

  return (
    <motion.aside
      initial={{ x: -20, opacity: 0 }}
      animate={{
        x: 0,
        opacity: 1,
        width: isCollapsed ? '64px' : '280px',
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
                    </motion.div>
                  </motion.div>

                  {/* Three-dot menu */}
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
                            className="absolute mt-1 w-32 bg-card-light dark:bg-card-dark rounded-squircle-sm shadow-ambient-lg dark:shadow-ambient-lg-dark border border-border-light dark:border-border-dark overflow-hidden z-50"
                            style={{
                              top: '100%',
                              right: '0',
                            }}
                          >
                            <button
                              onClick={(e) => handleDeleteFile(file, e)}
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

      {/* Browser Mode Indicator */}
      {!isTauri && !isCollapsed && (
        <div className="absolute bottom-4 left-4 right-4">
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
