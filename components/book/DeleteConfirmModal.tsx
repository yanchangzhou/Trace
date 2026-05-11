'use client';

import { motion } from 'framer-motion';

interface DeleteConfirmModalProps {
  bookName: string;
  onConfirm: () => void;
  onClose: () => void;
}

export default function DeleteConfirmModal({ bookName, onConfirm, onClose }: DeleteConfirmModalProps) {
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
        <h2 className="text-lg font-semibold text-text-primary-light dark:text-text-primary-dark mb-2">
          Delete Book
        </h2>
        <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark mb-6">
          Are you sure you want to delete <span className="font-medium text-text-primary-light dark:text-text-primary-dark">&quot;{bookName}&quot;</span>? This will also delete all files in this book. This action cannot be undone.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-squircle bg-background-light dark:bg-background-dark text-text-secondary-light dark:text-text-secondary-dark hover:bg-card-light dark:hover:bg-card-dark transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 rounded-squircle bg-red-500 text-white hover:bg-red-600 transition-colors shadow-ambient dark:shadow-ambient-dark"
          >
            Delete
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
