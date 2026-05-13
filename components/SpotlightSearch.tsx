'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Search, File, FileText, Image, Video, Music, X, Quote, ArrowRight } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { searchLocalFiles, openFile, formatFileSize, formatDate, searchDocuments } from '@/lib/tauri';
import { useFilePreview } from '@/contexts/FilePreviewContext';
import { useBook } from '@/contexts/BookContext';
import type { SearchResult, ContentSearchResult } from '@/types';

const springConfig = {
  type: 'spring' as const,
  stiffness: 260,
  damping: 20,
};

interface SpotlightSearchProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SpotlightSearch({ isOpen, onClose }: SpotlightSearchProps) {
  const [query, setQuery] = useState('');
  const [fileResults, setFileResults] = useState<SearchResult[]>([]);
  const [contentResults, setContentResults] = useState<ContentSearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [searchMode, setSearchMode] = useState<'files' | 'content'>('files');
  const { openPreview } = useFilePreview();
  const { currentFiles } = useBook();

  const totalResults = searchMode === 'content' ? contentResults : fileResults;
  const results = totalResults;

  const getFileIcon = (extension: string) => {
    const ext = extension.toLowerCase();
    if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext)) return <FileText className="w-5 h-5" />;
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) return <Image className="w-5 h-5" />;
    if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) return <Video className="w-5 h-5" />;
    if (['mp3', 'wav', 'flac', 'm4a'].includes(ext)) return <Music className="w-5 h-5" />;
    return <File className="w-5 h-5" />;
  };

  // Highlight matching terms in text
  const highlightMatches = (text: string, terms?: string[]) => {
    if (!terms || terms.length === 0) return text;
    const pattern = terms
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    const regex = new RegExp(`(${pattern})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-accent-warm/30 dark:bg-accent-warm/40 text-inherit rounded-sm px-0.5">
          {part}
        </mark>
      ) : (
        part
      ),
    );
  };

  // Search with debounce
  useEffect(() => {
    if (!query.trim()) {
      setFileResults([]);
      setContentResults([]);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        // Try content search first, fall back to filename search
        try {
          const content = await searchDocuments(query);
          if (content && content.length > 0) {
            setContentResults(content);
            setFileResults([]);
            setSearchMode('content');
            setSelectedIndex(0);
            setIsSearching(false);
            return;
          }
        } catch {
          // Content search not available, use filename search
        }

        const fileSearch = await searchLocalFiles(query);
        setFileResults(fileSearch);
        setContentResults([]);
        setSearchMode('files');
        setSelectedIndex(0);
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

  // Handle result click: open preview panel or open file
  const handleResultClick = useCallback(
    (result: SearchResult | ContentSearchResult) => {
      if ('chunk_id' in result) {
        // Content search result - open in preview panel
        const sourceFile = currentFiles.find(
          (f) => f.path === result.path || f.id === result.file_id,
        );
        if (sourceFile) {
          openPreview(sourceFile);
          onClose();
          return;
        }
      }

      // Filename search - try preview first, fall back to OS open
      const sourceFile = currentFiles.find((f) => f.path === result.path);
      if (sourceFile) {
        openPreview(sourceFile);
      } else {
        handleOpenFile(result.path);
      }
      onClose();
    },
    [currentFiles, openPreview, onClose],
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, Math.max(0, results.length - 1)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && results[selectedIndex]) {
        e.preventDefault();
        handleResultClick(results[selectedIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [results, selectedIndex, onClose, handleResultClick],
  );

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
      setTimeout(() => {
        setQuery('');
        setFileResults([]);
        setContentResults([]);
        setSelectedIndex(0);
        setHoveredIndex(null);
      }, 200);
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
          />

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
                    placeholder="Search documents by content or filename..."
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

                {/* Results */}
                <div className="max-h-[60vh] overflow-y-auto">
                  {isSearching && (
                    <div className="px-6 py-8 text-center text-text-tertiary-light dark:text-text-tertiary-dark">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="w-5 h-5 border-2 border-accent-warm border-t-transparent rounded-full mx-auto mb-3"
                      />
                      Searching documents...
                    </div>
                  )}

                  {!isSearching && query && results.length === 0 && (
                    <div className="px-6 py-8 text-center text-text-tertiary-light dark:text-text-tertiary-dark">
                      No results found for &ldquo;{query}&rdquo;
                    </div>
                  )}

                  {!isSearching && results.length > 0 && (
                    <div className="py-2">
                      {searchMode === 'content' && (
                        <div className="px-6 py-1.5 text-xs text-text-tertiary-light dark:text-text-tertiary-dark uppercase tracking-wider">
                          Content matches
                        </div>
                      )}
                      {results.map((result, index) => {
                        const isContent = 'chunk_id' in result;
                        const contentResult = isContent ? (result as ContentSearchResult) : null;
                        const fileResult = !isContent ? (result as SearchResult) : null;
                        const ext = isContent
                          ? (contentResult!.file_name.split('.').pop() || '')
                          : (fileResult!.extension);

                        return (
                          <motion.div
                            key={isContent ? contentResult!.chunk_id : fileResult!.path}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.02 }}
                            onClick={() => handleResultClick(result)}
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
                                {getFileIcon(ext)}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-2">
                                  <p className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark truncate tracking-tight">
                                    {isContent ? contentResult!.file_name : fileResult!.name}
                                  </p>
                                  <span className="text-xs text-text-tertiary-light dark:text-text-tertiary-dark uppercase tracking-wider flex-shrink-0">
                                    {ext}
                                  </span>
                                </div>

                                {/* Content snippet for content search results */}
                                {isContent && contentResult!.snippet && (
                                  <div className="mt-1.5 text-xs text-text-secondary-light dark:text-text-secondary-dark leading-relaxed line-clamp-2">
                                    <Quote className="w-3 h-3 inline mr-1 text-text-tertiary-light dark:text-text-tertiary-dark" />
                                    {highlightMatches(contentResult!.snippet, contentResult!.matched_terms)}
                                  </div>
                                )}

                                {/* Hover detail */}
                                <AnimatePresence>
                                  {hoveredIndex === index && (
                                    <motion.div
                                      initial={{ opacity: 0, height: 0 }}
                                      animate={{ opacity: 1, height: 'auto' }}
                                      exit={{ opacity: 0, height: 0 }}
                                      className="mt-2 space-y-1"
                                    >
                                      {!isContent && fileResult && (
                                        <>
                                          <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark truncate">
                                            {fileResult.path}
                                          </p>
                                          <div className="flex items-center gap-3 text-xs text-text-tertiary-light dark:text-text-tertiary-dark">
                                            <span>{formatFileSize(fileResult.size)}</span>
                                            <span>&bull;</span>
                                            <span>{formatDate(fileResult.last_modified)}</span>
                                          </div>
                                        </>
                                      )}
                                      <div className="flex items-center gap-1 text-xs text-accent-warm">
                                        <ArrowRight className="w-3 h-3" />
                                        <span>Open in preview panel</span>
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Footer */}
                {results.length > 0 && (
                  <div className="px-6 py-3 border-t border-border-light dark:border-border-dark flex items-center justify-between text-xs text-text-tertiary-light dark:text-text-tertiary-dark">
                    <div className="flex items-center gap-4">
                      <span>
                        {results.length} result{results.length !== 1 ? 's' : ''}
                      </span>
                      {searchMode === 'content' && (
                        <span className="text-accent-warm">Content search</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <kbd className="px-2 py-1 bg-surface-light dark:bg-surface-dark rounded">&uarr;&darr;</kbd>
                      <span>Navigate</span>
                      <kbd className="px-2 py-1 bg-surface-light dark:bg-surface-dark rounded ml-2">&crarr;</kbd>
                      <span>Preview</span>
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
