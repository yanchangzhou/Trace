'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { Book, SourceFile } from '@/types';

interface BookContextType {
  books: Book[];
  currentBook: Book | null;
  createBook: (name: string) => void;
  selectBook: (bookId: string) => void;
  deleteBook: (bookId: string) => void;
  renameBook: (bookId: string, newName: string) => void;
  addFileToBook: (bookId: string, file: SourceFile) => void;
  removeFileFromBook: (bookId: string, fileId: string) => void;
  getFilesForCurrentBook: () => SourceFile[];
}

const BookContext = createContext<BookContextType | undefined>(undefined);

const STORAGE_KEY = 'trace_books';
const CURRENT_BOOK_KEY = 'trace_current_book';

export function BookProvider({ children }: { children: ReactNode }) {
  const [books, setBooks] = useState<Book[]>([]);
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  // Store File objects separately (can't be serialized to localStorage)
  const [fileObjects, setFileObjects] = useState<Map<string, File>>(new Map());

  // Load books from localStorage on mount
  useEffect(() => {
    const loadBooks = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        const currentBookId = localStorage.getItem(CURRENT_BOOK_KEY);
        
        if (stored) {
          const loadedBooks: Book[] = JSON.parse(stored);
          setBooks(loadedBooks);
          
          // Set current book
          if (currentBookId) {
            const book = loadedBooks.find(b => b.id === currentBookId);
            setCurrentBook(book || loadedBooks[0] || null);
          } else {
            setCurrentBook(loadedBooks[0] || null);
          }
        } else {
          // Create default book for first-time users
          const defaultBook: Book = {
            id: generateId(),
            name: 'My First Book',
            createdAt: Date.now(),
            files: [],
          };
          setBooks([defaultBook]);
          setCurrentBook(defaultBook);
          localStorage.setItem(STORAGE_KEY, JSON.stringify([defaultBook]));
          localStorage.setItem(CURRENT_BOOK_KEY, defaultBook.id);
        }
      } catch (error) {
        console.error('Failed to load books:', error);
      }
    };

    loadBooks();
  }, []);

  // Save books to localStorage whenever they change
  useEffect(() => {
    if (books.length > 0) {
      // Remove File objects before saving to localStorage (they can't be serialized)
      const booksToSave = books.map(book => ({
        ...book,
        files: book.files.map(file => {
          const { file: _, ...fileWithoutBlob } = file;
          return fileWithoutBlob;
        }),
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(booksToSave));
    }
  }, [books]);

  // Save current book ID whenever it changes
  useEffect(() => {
    if (currentBook) {
      localStorage.setItem(CURRENT_BOOK_KEY, currentBook.id);
    }
  }, [currentBook]);

  const createBook = useCallback((name: string) => {
    const newBook: Book = {
      id: generateId(),
      name,
      createdAt: Date.now(),
      files: [],
    };
    
    setBooks(prev => [...prev, newBook]);
    setCurrentBook(newBook);
    
    // Create book folder via Tauri
    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      const { invoke } = (window as any).__TAURI__;
      invoke('create_book_folder', { bookId: newBook.id }).catch((error: any) => {
        console.error('Failed to create book folder:', error);
      });
    }
  }, []);

  const selectBook = useCallback((bookId: string) => {
    const book = books.find(b => b.id === bookId);
    if (book) {
      setCurrentBook(book);
    }
  }, [books]);

  const deleteBook = useCallback((bookId: string) => {
    // Don't allow deleting the last book
    if (books.length <= 1) {
      return;
    }
    
    setBooks(prev => prev.filter(b => b.id !== bookId));
    
    // If deleting current book, select another one
    if (currentBook?.id === bookId) {
      const remainingBooks = books.filter(b => b.id !== bookId);
      setCurrentBook(remainingBooks[0] || null);
    }
    
    // Delete book folder via Tauri
    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      const { invoke } = (window as any).__TAURI__;
      invoke('delete_book_folder', { bookId }).catch((error: any) => {
        console.error('Failed to delete book folder:', error);
      });
    }
  }, [books, currentBook]);

  const renameBook = useCallback((bookId: string, newName: string) => {
    setBooks(prev => prev.map(book => {
      if (book.id === bookId) {
        return { ...book, name: newName };
      }
      return book;
    }));
    
    // Update current book if it's the one being renamed
    if (currentBook?.id === bookId) {
      setCurrentBook(prev => prev ? { ...prev, name: newName } : null);
    }
  }, [currentBook]);

  const addFileToBook = useCallback((bookId: string, file: SourceFile) => {
    // Store File object separately if it exists
    if (file.file) {
      setFileObjects(prev => {
        const newMap = new Map(prev);
        newMap.set(file.id, file.file!);
        return newMap;
      });
    }
    
    setBooks(prev => prev.map(book => {
      if (book.id === bookId) {
        return {
          ...book,
          files: [...book.files, file],
        };
      }
      return book;
    }));
    
    // Update current book if it's the one being modified
    if (currentBook?.id === bookId) {
      setCurrentBook(prev => prev ? {
        ...prev,
        files: [...prev.files, file],
      } : null);
    }
  }, [currentBook]);

  const removeFileFromBook = useCallback((bookId: string, fileId: string) => {
    // Remove File object from map
    setFileObjects(prev => {
      const newMap = new Map(prev);
      newMap.delete(fileId);
      return newMap;
    });
    
    setBooks(prev => prev.map(book => {
      if (book.id === bookId) {
        return {
          ...book,
          files: book.files.filter(f => f.id !== fileId),
        };
      }
      return book;
    }));
    
    // Update current book if it's the one being modified
    if (currentBook?.id === bookId) {
      setCurrentBook(prev => prev ? {
        ...prev,
        files: prev.files.filter(f => f.id !== fileId),
      } : null);
    }
  }, [currentBook]);

  const getFilesForCurrentBook = useCallback(() => {
    const files = currentBook?.files || [];
    // Attach File objects from the map
    return files.map(file => ({
      ...file,
      file: fileObjects.get(file.id),
    }));
  }, [currentBook, fileObjects]);

  const contextValue = useMemo(() => ({
    books,
    currentBook,
    createBook,
    selectBook,
    deleteBook,
    renameBook,
    addFileToBook,
    removeFileFromBook,
    getFilesForCurrentBook,
  }), [books, currentBook, createBook, selectBook, deleteBook, renameBook, addFileToBook, removeFileFromBook, getFilesForCurrentBook]);

  return (
    <BookContext.Provider value={contextValue}>
      {children}
    </BookContext.Provider>
  );
}

export function useBook() {
  const context = useContext(BookContext);
  if (context === undefined) {
    throw new Error('useBook must be used within a BookProvider');
  }
  return context;
}

// Helper function to generate unique IDs
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
