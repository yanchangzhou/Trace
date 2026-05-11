'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { Book, SourceFile } from '@/types';
import {
  listBooks,
  createBook as createBookTauri,
  renameBook as renameBookTauri,
  deleteBook as deleteBookTauri,
  listFilesByBook,
  listBookFiles,
  syncLibrary,
  type Book as TauriBook,
  type FileRecord,
} from '@/lib/tauri';

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
  refreshFiles: () => Promise<void>;
  isTauri: boolean;
  /** Map from frontend book id → backend i64 id */
  bookIdMap: Map<string, number>;
}

const BookContext = createContext<BookContextType | undefined>(undefined);

function generateId(): string {
  return `demo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/** Convert Tauri Book (i64 id) to frontend Book (string id) */
function tauriBookToBook(tb: TauriBook): Book {
  return {
    id: String(tb.id),
    name: tb.name,
    createdAt: new Date(tb.created_at).getTime(),
    files: [],
  };
}

/** Convert Tauri FileRecord to frontend SourceFile */
function fileRecordToSourceFile(fr: FileRecord): SourceFile {
  return {
    id: String(fr.id),
    name: fr.name,
    path: fr.path,
    extension: fr.extension,
    bookId: String(fr.book_id),
    addedAt: new Date(fr.created_at).getTime(),
    status: fr.status,
    error_message: fr.error_message,
  };
}

export function BookProvider({ children }: { children: ReactNode }) {
  const [books, setBooks] = useState<Book[]>([]);
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const [fileObjects, setFileObjects] = useState<Map<string, File>>(new Map());
  const [bookIdMap, setBookIdMap] = useState<Map<string, number>>(new Map());
  const [isTauri, setIsTauri] = useState(false);

  // Detect Tauri environment
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && (window as any).__TAURI__) {
        setIsTauri(true);
      }
    } catch {
      // browser mode
    }
  }, []);

  // Load books from Tauri backend or set up browser demo
  useEffect(() => {
    if (!isTauri) {
      // Browser mode: ephemeral in-memory demo book only
      const demoBook: Book = {
        id: generateId(),
        name: 'Demo Book',
        createdAt: Date.now(),
        files: [],
      };
      setBooks([demoBook]);
      setCurrentBook(demoBook);
      return;
    }

    const loadFromTauri = async () => {
      try {
        const tauriBooks = await listBooks();
        if (tauriBooks.length === 0) {
          const newId = await createBookTauri('My First Book');
          const frontendBook: Book = {
            id: String(newId),
            name: 'My First Book',
            createdAt: Date.now(),
            files: [],
          };
          setBooks([frontendBook]);
          setCurrentBook(frontendBook);
          setBookIdMap(new Map([[String(newId), newId]]));
          return;
        }

        const frontendBooks: Book[] = tauriBooks.map(tauriBookToBook);
        const idMap = new Map<string, number>();
        tauriBooks.forEach((tb) => idMap.set(String(tb.id), tb.id));

        setBooks(frontendBooks);
        setBookIdMap(idMap);
        setCurrentBook(frontendBooks[0]);

        // Load files for each book
        for (const book of frontendBooks) {
          const backendId = idMap.get(book.id);
          if (backendId != null) {
            try {
              const files = await listFilesByBook(backendId);
              book.files = files.map(fileRecordToSourceFile);
            } catch {
              // book might have no files
            }
          }
        }
        setBooks([...frontendBooks]);
      } catch (error) {
        console.error('Failed to load from Tauri backend:', error);
      }
    };

    loadFromTauri();
  }, [isTauri]);

  const createBook = useCallback(
    async (name: string) => {
      if (isTauri) {
        try {
          const newId = await createBookTauri(name);
          const newBook: Book = {
            id: String(newId),
            name,
            createdAt: Date.now(),
            files: [],
          };
          setBooks((prev) => [...prev, newBook]);
          setCurrentBook(newBook);
          setBookIdMap((prev) => new Map(prev).set(String(newId), newId));
        } catch (error) {
          console.error('Failed to create book via Tauri:', error);
        }
      } else {
        const newBook: Book = {
          id: generateId(),
          name,
          createdAt: Date.now(),
          files: [],
        };
        setBooks((prev) => [...prev, newBook]);
        setCurrentBook(newBook);
      }
    },
    [isTauri]
  );

  const selectBook = useCallback(
    (bookId: string) => {
      const book = books.find((b) => b.id === bookId);
      if (book) {
        setCurrentBook(book);
      }
    },
    [books]
  );

  const deleteBook = useCallback(
    async (bookId: string) => {
      if (books.length <= 1) return;

      const backendId = bookIdMap.get(bookId);
      if (isTauri && backendId != null) {
        try {
          await deleteBookTauri(backendId);
        } catch (error) {
          console.error('Failed to delete book via Tauri:', error);
        }
      }

      setBooks((prev) => prev.filter((b) => b.id !== bookId));

      if (currentBook?.id === bookId) {
        const remainingBooks = books.filter((b) => b.id !== bookId);
        setCurrentBook(remainingBooks[0] || null);
      }
    },
    [books, currentBook, isTauri, bookIdMap]
  );

  const renameBook = useCallback(
    async (bookId: string, newName: string) => {
      const backendId = bookIdMap.get(bookId);
      if (isTauri && backendId != null) {
        try {
          await renameBookTauri(backendId, newName);
        } catch (error) {
          console.error('Failed to rename book via Tauri:', error);
        }
      }

      setBooks((prev) =>
        prev.map((book) => {
          if (book.id === bookId) {
            return { ...book, name: newName };
          }
          return book;
        })
      );

      if (currentBook?.id === bookId) {
        setCurrentBook((prev) => (prev ? { ...prev, name: newName } : null));
      }
    },
    [currentBook, isTauri, bookIdMap]
  );

  const addFileToBook = useCallback(
    (bookId: string, file: SourceFile) => {
      if (file.file) {
        setFileObjects((prev) => {
          const newMap = new Map(prev);
          newMap.set(file.id, file.file!);
          return newMap;
        });
      }

      setBooks((prev) =>
        prev.map((book) => {
          if (book.id === bookId) {
            return { ...book, files: [...book.files, file] };
          }
          return book;
        })
      );

      if (currentBook?.id === bookId) {
        setCurrentBook((prev) =>
          prev ? { ...prev, files: [...prev.files, file] } : null
        );
      }
    },
    [currentBook]
  );

  const removeFileFromBook = useCallback(
    (bookId: string, fileId: string) => {
      setFileObjects((prev) => {
        const newMap = new Map(prev);
        newMap.delete(fileId);
        return newMap;
      });

      setBooks((prev) =>
        prev.map((book) => {
          if (book.id === bookId) {
            return { ...book, files: book.files.filter((f) => f.id !== fileId) };
          }
          return book;
        })
      );

      if (currentBook?.id === bookId) {
        setCurrentBook((prev) =>
          prev
            ? { ...prev, files: prev.files.filter((f) => f.id !== fileId) }
            : null
        );
      }
    },
    [currentBook]
  );

  const getFilesForCurrentBook = useCallback(() => {
    const files = currentBook?.files || [];
    return files.map((file) => ({
      ...file,
      file: fileObjects.get(file.id),
    }));
  }, [currentBook, fileObjects]);

  const refreshFiles = useCallback(async () => {
    if (!isTauri || !currentBook) return;
    const backendId = bookIdMap.get(currentBook.id);
    if (backendId == null) return;

    try {
      const files = await listFilesByBook(backendId);

      // Also try to sync the library if we have a path
      try {
        const { getDocsFolder } = await import('@/lib/tauri');
        const docsFolder = await getDocsFolder();
        const bookPath = `${docsFolder}/${currentBook.name}`;
        await syncLibrary(backendId, bookPath);
      } catch {
        // sync is best-effort
      }

      const sourceFiles = files.map(fileRecordToSourceFile);
      setBooks((prev) =>
        prev.map((book) => {
          if (book.id === currentBook.id) {
            return { ...book, files: sourceFiles };
          }
          return book;
        })
      );
      setCurrentBook((prev) => (prev ? { ...prev, files: sourceFiles } : null));
    } catch (error) {
      console.error('Failed to refresh files:', error);
    }
  }, [isTauri, currentBook, bookIdMap]);

  const contextValue = useMemo(
    () => ({
      books,
      currentBook,
      createBook,
      selectBook,
      deleteBook,
      renameBook,
      addFileToBook,
      removeFileFromBook,
      getFilesForCurrentBook,
      refreshFiles,
      isTauri,
      bookIdMap,
    }),
    [
      books,
      currentBook,
      createBook,
      selectBook,
      deleteBook,
      renameBook,
      addFileToBook,
      removeFileFromBook,
      getFilesForCurrentBook,
      refreshFiles,
      isTauri,
      bookIdMap,
    ]
  );

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
