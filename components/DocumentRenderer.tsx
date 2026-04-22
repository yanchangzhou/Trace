'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import PdfViewer from './PdfViewer';

interface DocumentRendererProps {
  file: File;
  fileType: string;
  /** Layout width used for fit-to-width math (frozen while parent resizes). */
  containerWidth: number;
}

export default function DocumentRenderer({ file, fileType, containerWidth }: DocumentRendererProps) {
  const [isClient, setIsClient] = useState(false);
  const [fileUrl, setFileUrl] = useState<string>('');

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient || !file) return;
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [isClient, file]);

  const handleOpenInNewTab = () => {
    if (fileUrl) window.open(fileUrl, '_blank');
  };

  if (!isClient) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-accent-warm border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const extension = fileType.toLowerCase();

  const heavyShellClass =
    'relative w-full rounded-lg overflow-x-hidden overflow-y-auto bg-[#F7F5F2]/80 dark:bg-gray-900/80';

  if (extension === 'pdf') {
    return (
      <div
        className={heavyShellClass}
        style={{ willChange: 'transform', contain: 'layout' }}
      >
        <PdfViewer fileUrl={fileUrl} containerWidth={containerWidth} onOpenInNewTab={handleOpenInNewTab} />
      </div>
    );
  }

  if (extension === 'docx' || extension === 'pptx') {
    return (
      <div
        className={`${heavyShellClass} space-y-4`}
        style={{ willChange: 'transform', contain: 'layout' }}
      >
        <DOCXPreview file={file} containerWidth={containerWidth} />
      </div>
    );
  }

  if (extension === 'txt' || extension === 'md') {
    return (
      <div style={{ willChange: 'transform', contain: 'layout' }}>
        <TXTRenderer file={file} />
      </div>
    );
  }

  return null;
}

function DOCXPreview({ file, containerWidth }: { file: File; containerWidth: number }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [zoomFactor, setZoomFactor] = useState(1.0);
  const [naturalWidth, setNaturalWidth] = useState(0);
  const [wrapperWidth, setWrapperWidth] = useState(0);

  const getFitScale = useCallback(() => {
    const availableWidth = wrapperWidth > 0 ? wrapperWidth - 32 : Math.max(64, containerWidth - 80);
    if (naturalWidth <= 0 || availableWidth <= 0) return 1;
    const fit = availableWidth / naturalWidth;
    return Math.min(1, Math.max(0.2, fit));
  }, [wrapperWidth, containerWidth, naturalWidth]);

  const effectiveScale = (() => {
    const fitScale = getFitScale();
    const value = fitScale * zoomFactor;
    if (!Number.isFinite(value) || value <= 0) return 1;
    return Math.max(0.2, Math.min(3, value));
  })();

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const updateWidth = () => setWrapperWidth(wrapper.clientWidth);
    updateWidth();
    const ro = new ResizeObserver(() => updateWidth());
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let isMounted = true;
    const renderDocx = async () => {
      if (!contentRef.current) return;
      try {
        const { renderAsync } = await import('docx-preview');
        const arrayBuffer = await file.arrayBuffer();
        if (!isMounted || !contentRef.current) return;
        const target = contentRef.current;
        target.innerHTML = '';
        await renderAsync(arrayBuffer, target, undefined, {
          className: 'docx-wrapper',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: false,
          ignoreLastRenderedPageBreak: false,
          experimental: true,
          trimXmlDeclaration: true,
          useBase64URL: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
        });
        if (!isMounted || !contentRef.current) return;
        setIsLoading(false);
        requestAnimationFrame(() => {
          if (!contentRef.current) return;
          // Use the rendered container's scrollWidth instead of firstChild;
          // firstChild can be a non-element node and produce NaN calculations.
          const width = contentRef.current.scrollWidth;
          if (Number.isFinite(width) && width > 0) {
            setNaturalWidth(width);
          } else {
            setNaturalWidth(1);
          }
          setZoomFactor(1);
        });
      } catch (error) {
        console.error('DOCX render error:', error);
        if (isMounted) setIsLoading(false);
      }
    };
    renderDocx();
    return () => {
      isMounted = false;
    };
  }, [file]);

  return (
    <div className="relative w-full max-w-full">
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-accent-warm border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {!isLoading && (
        <div className="sticky top-0 z-10 flex items-center gap-2 mb-4 bg-[#F7F5F2] dark:bg-background-dark py-2">
          <button
            type="button"
            onClick={() => setZoomFactor((prev) => Math.max(prev - 0.1, 0.5))}
            className="w-8 h-8 rounded-lg hover:bg-card-light dark:hover:bg-card-dark flex items-center justify-center transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4 text-text-secondary-light dark:text-text-secondary-dark" />
          </button>
          <span className="text-xs text-text-tertiary-light dark:text-text-tertiary-dark min-w-[3rem] text-center">
            {Math.round(effectiveScale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoomFactor((prev) => Math.min(prev + 0.1, 3.0))}
            className="w-8 h-8 rounded-lg hover:bg-card-light dark:hover:bg-card-dark flex items-center justify-center transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4 text-text-secondary-light dark:text-text-secondary-dark" />
          </button>
          <button
            type="button"
            onClick={() => setZoomFactor(1)}
            className="w-8 h-8 rounded-lg hover:bg-card-light dark:hover:bg-card-dark flex items-center justify-center transition-colors"
            title="Fit to width"
          >
            <Maximize2 className="w-4 h-4 text-text-secondary-light dark:text-text-secondary-dark" />
          </button>
        </div>
      )}
      <div
        ref={wrapperRef}
        className="w-full max-w-full overflow-x-hidden overflow-y-auto bg-white dark:bg-gray-900 rounded-lg p-4"
        style={{ maxHeight: 'calc(100vh - 400px)' }}
      >
        <div className="w-full flex justify-center">
          <div
            className="docx-scale-root max-w-none"
            style={{
              transform: `scale(${effectiveScale})`,
              transformOrigin: 'top center',
              width: `${100 / effectiveScale}%`,
              maxWidth: `${100 / effectiveScale}%`,
            }}
          >
          <div
            ref={contentRef}
            className="docx-renderer [&_.docx-wrapper]:!w-full [&_.docx-wrapper]:!max-w-full"
          />
        </div>
        </div>
      </div>
    </div>
  );
}

function TXTRenderer({ file }: { file: File }) {
  const [text, setText] = useState('');
  useEffect(() => {
    file.text().then(setText);
  }, [file]);
  return (
    <div className="txt-renderer p-4 bg-[#F7F5F2] dark:bg-background-dark rounded-squircle">
      <pre className="text-sm text-text-primary-light dark:text-text-primary-dark leading-relaxed whitespace-pre-wrap font-sans break-words w-full max-w-full">
        {text}
      </pre>
    </div>
  );
}
