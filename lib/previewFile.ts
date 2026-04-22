/** Build a browser File from Tauri `Vec<u8>` JSON (number[]) for preview pipelines. */
export function buildPreviewFileFromBytes(
  bytes: number[],
  name: string,
  extension: string
): File {
  const u8 = new Uint8Array(bytes);
  const type = mimeForExtension(extension);
  const blob = new Blob([u8], { type });
  return new File([blob], name, { type });
}

function mimeForExtension(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'pdf':
      return 'application/pdf';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'txt':
    case 'md':
      return 'text/plain;charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}
