'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Search, File, FileText, Image, Video, Music, X } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { searchLocalFiles, openFile, formatFileSize, formatDate, type SearchResult } from '@/lib/tauri';

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
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

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

  // Search with debounce
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const searchResults = await searchLocalFiles(query);
        setResults(searchResults);
        setSelectedIndex(0);
      } catch (error) {
        console.error('Search error:', error);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 150); // 150ms debounce

    return () => clearTimeout(timer);
  }, [query]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && results[selectedIndex]) {
        e.preventDefault();
        handleOpenFile(results[selectedIndex].path);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [results, selectedIndex, onClose]
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
      setResults([]);
      setSelectedIndex(0);
      setHoveredIndex(null);
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

                {/* Results */}
                <div className="max-h-[60vh] overflow-y-auto">
                  {isSearching && (
                    <div className="px-6 py-8 text-center text-text-tertiary-light dark:text-text-tertiary-dark">
                      Searching...
                    </div>
                  )}

                  {!isSearching && query && results.length === 0 && (
                    <div className="px-6 py-8 text-center text-text-tertiary-light dark:text-text-tertiary-dark">
                      No files found for "{query}"
                    </div>
                  )}

                  {!isSearching && results.length > 0 && (
                    <div className="py-2">
                      {results.map((result, index) => (
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
                            {/* Icon */}
                            <div className="mt-1 text-accent-warm flex-shrink-0">
                              {getFileIcon(result.extension)}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-2">
                                <p className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark truncate tracking-tight">
                                  {result.name}
                                </p>
                                <span className="text-xs text-text-tertiary-light dark:text-text-tertiary-dark uppercase tracking-wider flex-shrink-0">
                                  {result.extension}
                                </span>
                              </div>

                              {/* QuickLook on hover */}
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
                                      <span>•</span>
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
                </div>

                {/* Footer */}
                {results.length > 0 && (
                  <div className="px-6 py-3 border-t border-border-light dark:border-border-dark flex items-center justify-between text-xs text-text-tertiary-light dark:text-text-tertiary-dark">
                    <div className="flex items-center gap-4">
                      <span>{results.length} result{results.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <kbd className="px-2 py-1 bg-surface-light dark:bg-surface-dark rounded">↑↓</kbd>
                      <span>Navigate</span>
                      <kbd className="px-2 py-1 bg-surface-light dark:bg-surface-dark rounded ml-2">↵</kbd>
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
