'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Search, File, FileText, Image, Video, Music, X, FileSearch } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import {
  searchLocalFiles,
  searchDocuments,
  openFile,
  formatFileSize,
  formatDate,
  type SearchResult,
  type DocumentSearchResult,
} from '@/lib/tauri';

const springConfig = {
  type: 'spring' as const,
  stiffness: 260,
  damping: 20,
};

type SearchTab = 'files' | 'content';

interface SpotlightSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onQuickLook?: (filePath: string) => void;
}

export default function SpotlightSearch({ isOpen, onClose, onQuickLook }: SpotlightSearchProps) {
  const [query, setQuery] = useState('');
  const [fileResults, setFileResults] = useState<SearchResult[]>([]);
  const [contentResults, setContentResults] = useState<DocumentSearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<SearchTab>('files');

  // Get icon based on file extension
  const getFileIcon = (extension: string) => {
    const ext = extension.toLowerCase();
    if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext)) {
      return <FileText className="w-5 h-5" />;
    }
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) {
      return <Image className="w-5 h-5" />;
    }
    if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) {
      return <Video className="w-5 h-5" />;
    }
    if (['mp3', 'wav', 'flac', 'm4a'].includes(ext)) {
      return <Music className="w-5 h-5" />;
    }
    return <File className="w-5 h-5" />;
  };

  // Get icon for content results (from file name)
  const getContentIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext)) {
      return <FileSearch className="w-5 h-5" />;
    }
    return <FileText className="w-5 h-5" />;
  };

  // Get total result count based on active tab
  const totalResults = activeTab === 'files' ? fileResults.length : contentResults.length;

  // Flat list of all results for keyboard navigation
  const allResults = activeTab === 'files'
    ? fileResults.map((r, i) => ({ type: 'file' as const, index: i, path: r.path }))
    : contentResults.map((r, i) => ({ type: 'content' as const, index: i, path: r.file_id }));

  // Search with debounce — both file names and content
  useEffect(() => {
    if (!query.trim()) {
      setFileResults([]);
      setContentResults([]);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const [fileRes, contentRes] = await Promise.all([
          searchLocalFiles(query).catch(() => [] as SearchResult[]),
          searchDocuments(query, undefined, 20).catch(() => [] as DocumentSearchResult[]),
        ]);
        setFileResults(fileRes);
        setContentResults(contentRes);
        setSelectedIndex(0);
        // Auto-switch to content tab if files are empty
        if (fileRes.length === 0 && contentRes.length > 0) {
          setActiveTab('content');
        }
      } catch (error) {
        console.error('Search error:', error);
        setFileResults([]);
        setContentResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [query]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, totalResults - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && totalResults > 0) {
        e.preventDefault();
        const result = allResults[selectedIndex];
        if (result) handleOpenFile(result.path);
      } else if (e.key === ' ' && totalResults > 0 && onQuickLook) {
        e.preventDefault();
        const result = allResults[selectedIndex];
        if (result) onQuickLook(result.path);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        setActiveTab((prev) => (prev === 'files' ? 'content' : 'files'));
        setSelectedIndex(0);
      }
    },
    [allResults, selectedIndex, totalResults, onClose, onQuickLook]
  );

  // Open file
  const handleOpenFile = async (path: string) => {
    try {
      await openFile(path);
      onClose();
    } catch (error) {
      console.error('Failed to open file:', error);
    }
  };

  // Reset state when closed
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setFileResults([]);
      setContentResults([]);
      setSelectedIndex(0);
      setHoveredIndex(null);
      setActiveTab('files');
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
          />

          {/* Search Modal */}
          <div className="fixed inset-0 flex items-start justify-center pt-[15vh] z-50 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              transition={springConfig}
              className="w-full max-w-2xl mx-4 pointer-events-auto"
            >
              <div className="bg-card-light dark:bg-card-dark rounded-squircle-lg shadow-ambient-lg dark:shadow-ambient-lg-dark overflow-hidden">
                {/* Search Input */}
                <div className="flex items-center gap-3 px-6 py-4 border-b border-border-light dark:border-border-dark">
                  <Search className="w-5 h-5 text-text-tertiary-light dark:text-text-tertiary-dark flex-shrink-0" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Search files in TraceDocs..."
                    autoFocus
                    className="flex-1 bg-transparent border-none outline-none text-text-primary-light dark:text-text-primary-dark placeholder:text-text-tertiary-light dark:placeholder:text-text-tertiary-dark text-lg tracking-tight"
                  />
                  {query && (
                    <button
                      onClick={() => setQuery('')}
                      className="p-1 hover:bg-surface-light dark:hover:bg-surface-dark rounded-lg transition-colors"
                    >
                      <X className="w-4 h-4 text-text-secondary-light dark:text-text-secondary-dark" />
                    </button>
                  )}
                </div>

                {/* Tab Bar */}
                {query && (
                  <div className="flex items-center gap-0 px-6 border-b border-border-light/50 dark:border-border-dark/50">
                    <button
                      onClick={() => { setActiveTab('files'); setSelectedIndex(0); }}
                      className={`px-4 py-2 text-xs font-medium tracking-tight border-b-2 transition-colors ${
                        activeTab === 'files'
                          ? 'border-accent-warm text-accent-warm'
                          : 'border-transparent text-text-tertiary-light dark:text-text-tertiary-dark hover:text-text-secondary-light dark:hover:text-text-secondary-dark'
                      }`}
                    >
                      Files ({fileResults.length})
                    </button>
                    <button
                      onClick={() => { setActiveTab('content'); setSelectedIndex(0); }}
                      className={`px-4 py-2 text-xs font-medium tracking-tight border-b-2 transition-colors ${
                        activeTab === 'content'
                          ? 'border-accent-warm text-accent-warm'
                          : 'border-transparent text-text-tertiary-light dark:text-text-tertiary-dark hover:text-text-secondary-light dark:hover:text-text-secondary-dark'
                      }`}
                    >
                      Content ({contentResults.length})
                    </button>
                  </div>
                )}

                {/* Results */}
                <div className="max-h-[60vh] overflow-y-auto">
                  {isSearching && (
                    <div className="px-6 py-8 text-center text-text-tertiary-light dark:text-text-tertiary-dark">
                      Searching...
                    </div>
                  )}

                  {!isSearching && query && totalResults === 0 && (
                    <div className="px-6 py-8 text-center text-text-tertiary-light dark:text-text-tertiary-dark">
                      No {activeTab === 'files' ? 'files' : 'content'} found for "{query}"
                    </div>
                  )}

                  {/* File Results */}
                  {!isSearching && activeTab === 'files' && fileResults.length > 0 && (
                    <div className="py-2">
                      {fileResults.map((result, index) => (
                        <motion.div
                          key={result.path}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.02 }}
                          onClick={() => handleOpenFile(result.path)}
                          onMouseEnter={() => {
                            setHoveredIndex(index);
                            setSelectedIndex(index);
                          }}
                          onMouseLeave={() => setHoveredIndex(null)}
                          className={`px-6 py-3 cursor-pointer transition-colors ${
                            selectedIndex === index
                              ? 'bg-surface-light dark:bg-surface-dark'
                              : 'hover:bg-surface-light/50 dark:hover:bg-surface-dark/50'
                          }`}
                        >
                          <div className="flex items-start gap-4">
                            <div className="mt-1 text-accent-warm flex-shrink-0">
                              {getFileIcon(result.extension)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-2">
                                <p className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark truncate tracking-tight">
                                  {result.name}
                                </p>
                                <span className="text-xs text-text-tertiary-light dark:text-text-tertiary-dark uppercase tracking-wider flex-shrink-0">
                                  {result.extension}
                                </span>
                              </div>
                              <AnimatePresence>
                                {hoveredIndex === index && (
                                  <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="mt-2 space-y-1"
                                  >
                                    <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark truncate">
                                      {result.path}
                                    </p>
                                    <div className="flex items-center gap-3 text-xs text-text-tertiary-light dark:text-text-tertiary-dark">
                                      <span>{formatFileSize(result.size)}</span>
                                      <span>&bull;</span>
                                      <span>{formatDate(result.last_modified)}</span>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}

                  {/* Content Results */}
                  {!isSearching && activeTab === 'content' && contentResults.length > 0 && (
                    <div className="py-2">
                      {contentResults.map((result, index) => (
                        <motion.div
                          key={`${result.file_id}-${result.chunk_id ?? index}`}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.02 }}
                          onClick={() => handleOpenFile(result.file_id)}
                          onMouseEnter={() => {
                            setHoveredIndex(index);
                            setSelectedIndex(index);
                          }}
                          onMouseLeave={() => setHoveredIndex(null)}
                          className={`px-6 py-3 cursor-pointer transition-colors ${
                            selectedIndex === index
                              ? 'bg-surface-light dark:bg-surface-dark'
                              : 'hover:bg-surface-light/50 dark:hover:bg-surface-dark/50'
                          }`}
                        >
                          <div className="flex items-start gap-4">
                            <div className="mt-1 text-accent-warm flex-shrink-0">
                              {getContentIcon(result.file_name)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-2">
                                <p className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark truncate tracking-tight">
                                  {result.file_name}
                                </p>
                                <span className="text-xs text-accent-warm font-medium flex-shrink-0">
                                  {result.score.toFixed(1)}
                                </span>
                              </div>
                              {result.snippet && (
                                <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark mt-1 line-clamp-3">
                                  {result.snippet.substring(0, 300)}
                                  {result.snippet.length > 300 ? '...' : ''}
                                </p>
                              )}
                              <AnimatePresence>
                                {hoveredIndex === index && result.matched_terms.length > 0 && (
                                  <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="mt-2"
                                  >
                                    <div className="flex items-center gap-1 flex-wrap">
                                      {result.matched_terms.map((term, i) => (
                                        <span
                                          key={i}
                                          className="px-2 py-0.5 bg-accent-warm/10 text-accent-warm text-xs rounded-full"
                                        >
                                          {term}
                                        </span>
                                      ))}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer */}
                {totalResults > 0 && (
                  <div className="px-6 py-3 border-t border-border-light dark:border-border-dark flex items-center justify-between text-xs text-text-tertiary-light dark:text-text-tertiary-dark">
                    <div className="flex items-center gap-4">
                      <span>{totalResults} result{totalResults !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <kbd className="px-2 py-1 bg-surface-light dark:bg-surface-dark rounded">Tab</kbd>
                      <span>Switch</span>
                      <kbd className="px-2 py-1 bg-surface-light dark:bg-surface-dark rounded ml-1">↑↓</kbd>
                      <span>Navigate</span>
                      <kbd className="px-2 py-1 bg-surface-light dark:bg-surface-dark rounded ml-1">↵</kbd>
                      <span>Open</span>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
