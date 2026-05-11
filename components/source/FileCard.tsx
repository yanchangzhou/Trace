'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Image, File, MoreVertical, Trash2, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { SourceFile } from '@/types';

interface FileCardProps {
  file: SourceFile;
  index: number;
  isCollapsed: boolean;
  onFileClick: (file: SourceFile) => void;
  onDelete: (file: SourceFile, e: React.MouseEvent) => void;
}

const springConfig = {
  type: 'spring' as const,
  stiffness: 200,
  damping: 25,
};

function getIcon(extension: string) {
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
}

export default function FileCard({ file, index, isCollapsed, onFileClick, onDelete }: FileCardProps) {
  const [openMenuId, setOpenMenuId] = useState(false);

  return (
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
      whileHover={{ scale: 1.02, y: -1 }}
      onClick={(e) => {
        e.stopPropagation();
        onFileClick(file);
      }}
      className={`${
        isCollapsed ? 'w-full h-12' : 'w-full h-14'
      } bg-card-light dark:bg-card-dark rounded-squircle-sm cursor-pointer border border-border-light dark:border-border-dark hover:border-accent-warm/40 dark:hover:border-accent-warm/40 transition-colors duration-200 relative group flex-shrink-0`}
      title={file.name}
    >
      <motion.div layout className="flex items-center h-full w-full px-4 gap-3">
        <motion.div layout className="flex items-center justify-center text-accent-warm flex-shrink-0">
          {getIcon(file.extension)}
        </motion.div>

        <motion.div
          layout
          initial={false}
          animate={{
            opacity: isCollapsed ? 0 : 1,
            width: isCollapsed ? 0 : 'auto',
          }}
          transition={{
            type: 'spring',
            stiffness: 200,
            damping: 25,
            opacity: { duration: 0.2 },
          }}
          className="overflow-hidden flex-1 min-w-0"
        >
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-xs font-medium text-text-primary-light dark:text-text-primary-dark truncate tracking-tight flex-1 min-w-0">
              {file.name}
            </p>
            {file.status === 'importing' && (
              <span title="Importing..."><Loader2 className="w-3 h-3 text-accent-warm animate-spin flex-shrink-0" /></span>
            )}
            {file.status === 'ready' && (
              <span title="Ready"><CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" /></span>
            )}
            {file.status === 'failed' && (
              <span title={file.error_message || 'Failed'}><AlertCircle className="w-3 h-3 text-red-500 flex-shrink-0" /></span>
            )}
          </div>
        </motion.div>
      </motion.div>

      {/* Three-dot menu */}
      {!isCollapsed && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpenMenuId(!openMenuId);
            }}
            className="w-6 h-6 rounded-lg bg-surface-light dark:bg-surface-dark hover:bg-background-light dark:hover:bg-background-dark flex items-center justify-center"
          >
            <MoreVertical className="w-3 h-3 text-text-secondary-light dark:text-text-secondary-dark" />
          </button>

          <AnimatePresence>
            {openMenuId && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -5 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -5 }}
                transition={{ duration: 0.15 }}
                className="absolute mt-1 w-32 bg-card-light dark:bg-card-dark rounded-squircle-sm shadow-ambient-lg dark:shadow-ambient-lg-dark border border-border-light dark:border-border-dark overflow-hidden z-50"
                style={{ top: '100%', right: '0' }}
              >
                <button
                  onClick={(e) => {
                    onDelete(file, e);
                    setOpenMenuId(false);
                  }}
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
  );
}
