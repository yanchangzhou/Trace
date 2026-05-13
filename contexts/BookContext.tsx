'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { Book, SourceFile } from '@/types';
import {
  createLibraryBook,
  deleteLibraryBook,
  deleteLibraryFile,
  getStoredCurrentBookId,
  isTauriEnvironment,
  listBooks,
  renameLibraryBook,
  storeCurrentBookId,
  syncLibrary,
} from '@/lib/tauri';

interface BookContextType {
  books: Book[];
  currentBook: Book | null;
  currentFiles: SourceFile[];
  isLoading: boolean;
  isTauri: boolean;
  error: string | null;
  refreshLibrary: () => Promise<void>;
  createBook: (name: string) => Promise<void>;
  selectBook: (bookId: string) => Promise<void>;
  deleteBook: (bookId: string) => Promise<void>;
  renameBook: (bookId: string, newName: string) => Promise<void>;
  addBrowserFilesToCurrentBook: (files: SourceFile[]) => void;
  removeFileFromCurrentBook: (file: SourceFile) => Promise<void>;
}

const BookContext = createContext<BookContextType | undefined>(undefined);
const BROWSER_STORAGE_KEY = 'trace_books';

function readBrowserBooks(): Book[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(BROWSER_STORAGE_KEY);
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored) as Book[];
    return parsed.map((book) => ({
      ...book,
      files: (book.files || []).map((file) => ({
        ...file,
        size: file.size,
        status: file.status,
      })),
    }));
  } catch (error) {
    console.error('Failed to read browser books', error);
    return [];
  }
}

function writeBrowserBooks(books: Book[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(books));
}

function createDefaultBrowserBook(): Book {
  return {
    id: `book-${Date.now().toString(36)}`,
    name: 'My First Book',
    createdAt: Date.now(),
    files: [],
  };
}

export function BookProvider({ children }: { children: ReactNode }) {
  const [books, setBooks] = useState<Book[]>([]);
  const [currentBookId, setCurrentBookId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTauri, setIsTauri] = useState(false);
  const [browserFileObjects, setBrowserFileObjects] = useState<Map<string, File>>(new Map());

  const currentBook = useMemo(
    () => books.find((book) => book.id === currentBookId) || null,
    [books, currentBookId],
  );

  const currentFiles = useMemo(
    () => (currentBook?.files || []).map((file) => ({ ...file, file: browserFileObjects.get(file.id) })),
    [browserFileObjects, currentBook],
  );

  const applyBooks = useCallback((nextBooks: Book[], preferredBookId?: string | null) => {
    setBooks(nextBooks);

    const selectedBookId = preferredBookId || currentBookId || getStoredCurrentBookId();
    const resolvedBook =
      nextBooks.find((book) => book.id === selectedBookId) ||
      nextBooks[0] ||
      null;

    const nextBookId = resolvedBook?.id || null;
    setCurrentBookId(nextBookId);
    storeCurrentBookId(nextBookId);
  }, [currentBookId]);

  const refreshLibrary = useCallback(async (preferredBookId?: string | null) => {
    setError(null);
    setIsLoading(true);

    try {
      if (isTauriEnvironment()) {
        setIsTauri(true);
        const nextBooks = await listBooks();
        applyBooks(nextBooks, preferredBookId);
      } else {
        setIsTauri(false);
        let nextBooks = readBrowserBooks();

        if (nextBooks.length === 0) {
          const defaultBook = createDefaultBrowserBook();
          nextBooks = [defaultBook];
          writeBrowserBooks(nextBooks);
        }

        applyBooks(nextBooks, preferredBookId);
      }
    } catch (loadError) {
      console.error('Failed to refresh library', loadError);
      setError(loadError instanceof Error ? loadError.message : 'Failed to refresh library');
    } finally {
      setIsLoading(false);
    }
  }, [applyBooks]);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  const createBook = useCallback(async (name: string) => {
    if (isTauriEnvironment()) {
      const { book: createdBook, persisted } = await createLibraryBook(name);
      if (persisted) {
        await refreshLibrary(createdBook.id);
      } else {
        applyBooks([...books, createdBook], createdBook.id);
      }
      return;
    }

    const newBook: Book = {
      id: `book-${Date.now().toString(36)}`,
      name,
      createdAt: Date.now(),
      files: [],
    };

    const nextBooks = [...books, newBook];
    writeBrowserBooks(nextBooks);
    applyBooks(nextBooks, newBook.id);
  }, [applyBooks, books, refreshLibrary]);

  const selectBook = useCallback(async (bookId: string) => {
    setCurrentBookId(bookId);
    storeCurrentBookId(bookId);
  }, []);

  const deleteBook = useCallback(async (bookId: string) => {
    if (books.length <= 1) {
      return;
    }

    if (isTauriEnvironment()) {
      await deleteLibraryBook(bookId);
      const fallbackBookId = books.find((book) => book.id !== bookId)?.id || null;
      await refreshLibrary(fallbackBookId);
      return;
    }

    const nextBooks = books.filter((book) => book.id !== bookId);
    writeBrowserBooks(nextBooks);
    applyBooks(nextBooks, nextBooks[0]?.id || null);
  }, [applyBooks, books, refreshLibrary]);

  const renameBook = useCallback(async (bookId: string, newName: string) => {
    if (isTauriEnvironment()) {
      const persisted = await renameLibraryBook(bookId, newName);
      if (persisted) {
        await refreshLibrary(bookId);
        return;
      }
    }

    const nextBooks = books.map((book) => (
      book.id === bookId ? { ...book, name: newName } : book
    ));

    if (!isTauriEnvironment()) {
      writeBrowserBooks(nextBooks);
    }

    applyBooks(nextBooks, bookId);
  }, [applyBooks, books, refreshLibrary]);

  const addBrowserFilesToCurrentBook = useCallback((files: SourceFile[]) => {
    if (!currentBook) {
      return;
    }

    setBrowserFileObjects((previous) => {
      const next = new Map(previous);
      for (const file of files) {
        if (file.file) {
          next.set(file.id, file.file);
        }
      }
      return next;
    });

    const nextBooks = books.map((book) => (
      book.id === currentBook.id
        ? { ...book, files: [...book.files, ...files] }
        : book
    ));

    writeBrowserBooks(nextBooks);
    applyBooks(nextBooks, currentBook.id);
  }, [applyBooks, books, currentBook]);

  const removeFileFromCurrentBook = useCallback(async (file: SourceFile) => {
    if (!currentBook) {
      return;
    }

    if (isTauriEnvironment()) {
      await deleteLibraryFile(file);
      await syncLibrary();
      await refreshLibrary(currentBook.id);
      return;
    }

    setBrowserFileObjects((previous) => {
      const next = new Map(previous);
      next.delete(file.id);
      return next;
    });

    const nextBooks = books.map((book) => (
      book.id === currentBook.id
        ? { ...book, files: book.files.filter((entry) => entry.id !== file.id) }
        : book
    ));

    writeBrowserBooks(nextBooks);
    applyBooks(nextBooks, currentBook.id);
  }, [applyBooks, books, currentBook, refreshLibrary]);

  const contextValue = useMemo(() => ({
    books,
    currentBook,
    currentFiles,
    isLoading,
    isTauri,
    error,
    refreshLibrary: () => refreshLibrary(currentBookId),
    createBook,
    selectBook,
    deleteBook,
    renameBook,
    addBrowserFilesToCurrentBook,
    removeFileFromCurrentBook,
  }), [
    addBrowserFilesToCurrentBook,
    books,
    createBook,
    currentBook,
    currentBookId,
    currentFiles,
    deleteBook,
    error,
    isLoading,
    isTauri,
    refreshLibrary,
    removeFileFromCurrentBook,
    renameBook,
    selectBook,
  ]);

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
