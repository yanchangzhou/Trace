export interface Book {
  id: string;
  name: string;
  createdAt: number;
  files: import('./file').SourceFile[];
}
