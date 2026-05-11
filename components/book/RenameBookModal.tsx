'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';

interface RenameBookModalProps {
  currentName: string;
  onRename: (newName: string) => void;
  onClose: () => void;
}

export default function RenameBookModal({ currentName, onRename, onClose }: RenameBookModalProps) {
  const [bookName, setBookName] = useState(currentName);
  const [error, setError] = useState('');

  const handleRename = () => {
    if (!bookName.trim()) {
      setError('Please enter a book name');
      return;
    }
    onRename(bookName.trim());
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100]"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-light dark:bg-surface-dark rounded-squircle p-6 w-full max-w-md shadow-ambient-lg dark:shadow-ambient-lg-dark"
      >
        <h2 className="text-lg font-semibold text-text-primary-light dark:text-text-primary-dark mb-4">
          Rename Book
        </h2>
        <input
          type="text"
          value={bookName}
          onChange={(e) => {
            setBookName(e.target.value);
            setError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRename();
            if (e.key === 'Escape') onClose();
          }}
          placeholder="Enter new book name..."
          autoFocus
          className="w-full px-4 py-3 rounded-squircle bg-background-light dark:bg-background-dark text-text-primary-light dark:text-text-primary-dark placeholder-text-tertiary-light dark:placeholder-text-tertiary-dark border border-border-light dark:border-border-dark focus:outline-none focus:ring-2 focus:ring-accent-warm"
        />
        {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-squircle bg-background-light dark:bg-background-dark text-text-secondary-light dark:text-text-secondary-dark hover:bg-card-light dark:hover:bg-card-dark transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleRename}
            className="flex-1 px-4 py-2 rounded-squircle bg-accent-warm text-white hover:bg-accent-warm/90 transition-colors shadow-ambient dark:shadow-ambient-dark"
          >
            Rename
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
