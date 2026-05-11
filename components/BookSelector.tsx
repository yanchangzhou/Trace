'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, ChevronDown, Plus, MoreVertical, Trash2, Edit2 } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useBook } from '@/contexts/BookContext';
import CreateBookModal from './book/CreateBookModal';
import RenameBookModal from './book/RenameBookModal';
import DeleteConfirmModal from './book/DeleteConfirmModal';

interface BookSelectorProps {
  isCollapsed: boolean;
}

const springConfig = {
  type: 'spring' as const,
  stiffness: 260,
  damping: 20,
};

export default function BookSelector({ isCollapsed }: BookSelectorProps) {
  const { books, currentBook, selectBook, deleteBook, renameBook } = useBook();
  const [isOpen, setIsOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [menuBookId, setMenuBookId] = useState<string | null>(null);
  const [bookToEdit, setBookToEdit] = useState<{ id: string; name: string } | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const buttonRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});

  const handleDelete = (bookId: string) => {
    if (books.length > 1) {
      deleteBook(bookId);
      setShowDeleteConfirm(false);
      setMenuBookId(null);
    }
  };

  const handleMenuClick = (bookId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (menuBookId === bookId) {
      setMenuBookId(null);
      return;
    }

    const button = buttonRefs.current[bookId];
    if (button) {
      const rect = button.getBoundingClientRect();
      setMenuPosition({
        top: rect.top,
        left: rect.right + 8,
      });
    }
    
    setMenuBookId(bookId);
  };

  useEffect(() => {
    const handleClickOutside = () => {
      if (menuBookId) {
        setMenuBookId(null);
      }
    };

    if (menuBookId) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [menuBookId]);

  return (
    <>
      <div className="relative">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={(e) => {
            e.stopPropagation();
            if (isCollapsed) {
              setShowCreateModal(true);
            } else {
              setIsOpen(!isOpen);
            }
          }}
          className={`w-full h-12 rounded-squircle bg-card-light dark:bg-card-dark flex items-center justify-center hover:bg-background-light dark:hover:bg-background-dark transition-colors shadow-ambient dark:shadow-ambient-dark ${
            isCollapsed ? 'px-0' : 'px-4'
          }`}
        >
          {isCollapsed ? (
            <BookOpen className="w-5 h-5 text-accent-warm" />
          ) : (
            <div className="w-full flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <BookOpen className="w-5 h-5 text-accent-warm flex-shrink-0" />
                <span className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark truncate">
                  {currentBook?.name || 'Select Book'}
                </span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-text-secondary-light dark:text-text-secondary-dark transition-transform flex-shrink-0 ${
                  isOpen ? 'rotate-180' : ''
                }`}
              />
            </div>
          )}
        </motion.button>

        <AnimatePresence>
          {isOpen && !isCollapsed && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={springConfig}
              className="absolute top-full left-0 right-0 mt-2 bg-surface-light dark:bg-surface-dark rounded-squircle shadow-ambient-lg dark:shadow-ambient-lg-dark border border-border-light dark:border-border-dark overflow-hidden z-50"
            >
              <div className="max-h-64 overflow-y-auto">
                {books.map((book) => (
                  <div key={book.id} className="relative group">
                    <button
                      onClick={() => {
                        selectBook(book.id);
                        setIsOpen(false);
                      }}
                      className={`w-full px-4 py-3 pr-12 text-left text-sm hover:bg-background-light dark:hover:bg-background-dark transition-colors ${
                        currentBook?.id === book.id
                          ? 'bg-accent-warm/10 text-accent-warm font-medium'
                          : 'text-text-primary-light dark:text-text-primary-dark'
                      }`}
                    >
                      {book.name}
                    </button>
                    
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <motion.button
                        ref={(el) => { buttonRefs.current[book.id] = el; }}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={(e) => handleMenuClick(book.id, e)}
                        className="w-8 h-8 rounded-lg hover:bg-background-light dark:hover:bg-background-dark transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100"
                      >
                        <MoreVertical className="w-4 h-4 text-text-secondary-light dark:text-text-secondary-dark" />
                      </motion.button>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="border-t border-border-light dark:border-border-dark">
                <button
                  onClick={() => {
                    setShowCreateModal(true);
                    setIsOpen(false);
                  }}
                  className="w-full px-4 py-3 text-left text-sm text-accent-warm hover:bg-accent-warm/10 transition-colors flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Create New Book
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {menuBookId && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={springConfig}
            style={{
              position: 'fixed',
              top: `${menuPosition.top}px`,
              left: `${menuPosition.left}px`,
            }}
            className="w-40 bg-surface-light dark:bg-surface-dark rounded-squircle shadow-ambient-lg dark:shadow-ambient-lg-dark border border-border-light dark:border-border-dark overflow-hidden z-[100]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                const book = books.find(b => b.id === menuBookId);
                if (book) {
                  setBookToEdit({ id: book.id, name: book.name });
                  setShowRenameModal(true);
                  setMenuBookId(null);
                  setIsOpen(false);
                }
              }}
              className="w-full px-3 py-2 text-left text-sm text-text-primary-light dark:text-text-primary-dark hover:bg-background-light dark:hover:bg-background-dark transition-colors flex items-center gap-2"
            >
              <Edit2 className="w-3.5 h-3.5" />
              Rename
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                const book = books.find(b => b.id === menuBookId);
                if (book) {
                  setBookToEdit({ id: book.id, name: book.name });
                  setShowDeleteConfirm(true);
                  setMenuBookId(null);
                  setIsOpen(false);
                }
              }}
              disabled={books.length <= 1}
              className="w-full px-3 py-2 text-left text-sm text-red-500 hover:bg-red-500/10 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {showCreateModal && (
        <CreateBookModal onClose={() => setShowCreateModal(false)} />
      )}

      {showRenameModal && bookToEdit && (
        <RenameBookModal
          currentName={bookToEdit.name}
          onRename={(newName) => {
            renameBook(bookToEdit.id, newName);
            setShowRenameModal(false);
            setBookToEdit(null);
          }}
          onClose={() => {
            setShowRenameModal(false);
            setBookToEdit(null);
          }}
        />
      )}

      {showDeleteConfirm && bookToEdit && (
        <DeleteConfirmModal
          bookName={bookToEdit.name}
          onConfirm={() => {
            handleDelete(bookToEdit.id);
            setBookToEdit(null);
          }}
          onClose={() => {
            setShowDeleteConfirm(false);
            setBookToEdit(null);
          }}
        />
      )}
    </>
  );
}
