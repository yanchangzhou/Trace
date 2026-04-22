// Browser-side document parsing utilities
// This module should only be imported in client components

export interface ParseResult {
  text: string;
  metadata: {
    pageCount?: number;
    slideCount?: number;
    wordCount: number;
    headings: string[];
  };
  previewUrl?: string; // For embedded preview
}

/**
 * Parse PDF file in browser - Extract text only
 */
export async function parsePDF(file: File): Promise<ParseResult> {
  // Browser mode: only provide Blob URL for preview.
  // Avoid extracting PDF text here to prevent pdfjs-dist bundling runtime issues.
  const previewUrl = URL.createObjectURL(file);
  return {
    text: '',
    metadata: {
      pageCount: undefined,
      wordCount: 0,
      headings: [],
    },
    previewUrl,
  };
}

/**
 * Parse DOCX file in browser using manual XML extraction
 */
async function parseDOCXManual(file: File): Promise<ParseResult> {
  const PizZipModule = await import('pizzip');
  const PizZip = PizZipModule.default;
  
  const arrayBuffer = await file.arrayBuffer();
  const zip = new PizZip(arrayBuffer);
  
  let fullText = '';
  const headings: string[] = [];
  
  // Extract text from document.xml
  const docXmlFile = zip.files['word/document.xml'];
  if (!docXmlFile) {
    throw new Error('Invalid DOCX file: word/document.xml not found');
  }
  
  const docXml = docXmlFile.asText();
  
  // Extract text from XML (simple regex approach)
  // DOCX uses <w:t> tags for text content
  const textMatches = docXml.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
  if (textMatches) {
    fullText = textMatches
      .map(match => match.replace(/<\/?w:t[^>]*>/g, ''))
      .join(' ');
    
    // Try to extract headings (paragraphs with style)
    const paraMatches = docXml.match(/<w:p[^>]*>[\s\S]*?<\/w:p>/g);
    if (paraMatches) {
      paraMatches.slice(0, 20).forEach(para => {
        const textMatch = para.match(/<w:t[^>]*>([^<]+)<\/w:t>/);
        const isHeading = para.includes('Heading') || para.includes('Title');
        if (textMatch && isHeading && headings.length < 10) {
          const text = textMatch[1].trim();
          if (text.length > 3 && text.length < 100) {
            headings.push(text);
          }
        }
      });
    }
  }
  
  const words = fullText.split(/\s+/).filter(Boolean);
  
  // Create blob URL for preview (browsers can't natively preview DOCX)
  const previewUrl = URL.createObjectURL(file);
  
  return {
    text: fullText,
    metadata: {
      wordCount: words.length,
      headings,
    },
    previewUrl,
  };
}

/**
 * Parse DOCX file in browser
 */
export async function parseDOCX(file: File): Promise<ParseResult> {
  // Use manual XML extraction directly (more reliable than mammoth in browser)
  return parseDOCXManual(file);
}

/**
 * Parse PPTX file in browser
 */
export async function parsePPTX(file: File): Promise<ParseResult> {
  // Dynamic import to avoid SSR issues
  const PizZipModule = await import('pizzip');
  const PizZip = PizZipModule.default;
  
  const arrayBuffer = await file.arrayBuffer();
  const zip = new PizZip(arrayBuffer);
  
  let fullText = '';
  let slideCount = 0;
  const headings: string[] = [];
  
  // Extract text from slides
  const slideFiles = Object.keys(zip.files).filter(name => 
    name.startsWith('ppt/slides/slide') && name.endsWith('.xml')
  );
  
  slideCount = slideFiles.length;
  
  for (const fileName of slideFiles) {
    const slideXml = zip.files[fileName].asText();
    
    // Extract text from XML (simple regex approach)
    const textMatches = slideXml.match(/<a:t>([^<]+)<\/a:t>/g);
    if (textMatches) {
      const slideText = textMatches
        .map(match => match.replace(/<\/?a:t>/g, ''))
        .join(' ');
      
      fullText += slideText + '\n\n';
      
      // First text item might be a heading
      if (textMatches.length > 0 && headings.length < 10) {
        const firstText = textMatches[0].replace(/<\/?a:t>/g, '');
        if (firstText.length < 100 && firstText.length > 3) {
          headings.push(firstText);
        }
      }
    }
  }
  
  const words = fullText.split(/\s+/).filter(Boolean);
  
  // Create blob URL for preview
  const previewUrl = URL.createObjectURL(file);
  
  return {
    text: fullText,
    metadata: {
      slideCount,
      wordCount: words.length,
      headings,
    },
    previewUrl,
  };
}

/**
 * Parse document based on file type
 */
export async function parseDocument(file: File): Promise<ParseResult> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  
  switch (extension) {
    case 'pdf':
      return parsePDF(file);
    case 'docx':
      return parseDOCX(file);
    case 'doc':
      // Old Word format (.doc) is a binary format that requires complex parsing
      // For now, show a message that it's not supported in browser mode
      throw new Error('Old Word format (.doc) is not supported in browser mode. Please convert to .docx or use the Tauri desktop app.');
    case 'pptx':
      return parsePPTX(file);
    case 'ppt':
      // Old PowerPoint format (.ppt) is also binary
      throw new Error('Old PowerPoint format (.ppt) is not supported in browser mode. Please convert to .pptx or use the Tauri desktop app.');
    case 'txt':
      const text = await file.text();
      const words = text.split(/\s+/).filter(Boolean);
      const previewUrl = URL.createObjectURL(file);
      return {
        text,
        metadata: {
          wordCount: words.length,
          headings: [],
        },
        previewUrl,
      };
    default:
      throw new Error(`Unsupported file type: ${extension}`);
  }
}
