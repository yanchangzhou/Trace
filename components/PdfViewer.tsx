'use client';

import { useMemo, useState } from 'react';
import { ZoomIn, ZoomOut, Maximize2, ExternalLink } from 'lucide-react';

type PdfViewerProps = {
  fileUrl: string;
  containerWidth: number;
  onOpenInNewTab: () => void;
};

export default function PdfViewer({ fileUrl, containerWidth, onOpenInNewTab }: PdfViewerProps) {
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [fitToWidth, setFitToWidth] = useState<boolean>(true);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  const innerW = useMemo(() => Math.max(64, containerWidth - 48), [containerWidth]);
  const displayPercent = fitToWidth ? 100 : zoomPercent;
  const iframeSrc = useMemo(() => {
    const zoomParam = fitToWidth ? 'page-width' : `${zoomPercent}`;
    return `${fileUrl}#toolbar=0&navpanes=0&statusbar=0&zoom=${zoomParam}&view=FitH`;
  }, [fileUrl, fitToWidth, zoomPercent]);

  return (
    <div className="relative w-full overflow-x-hidden" style={{ willChange: 'transform', contain: 'layout' }}>
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 mb-4 bg-[#F7F5F2] dark:bg-background-dark py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setFitToWidth(false);
              setZoomPercent((z) => Math.max(z - 10, 50));
            }}
            className="w-8 h-8 rounded-lg hover:bg-card-light dark:hover:bg-card-dark flex items-center justify-center transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4 text-text-secondary-light dark:text-text-secondary-dark" />
          </button>
          <span className="text-xs text-text-tertiary-light dark:text-text-tertiary-dark min-w-[3rem] text-center">
            {displayPercent}%
          </span>
          <button
            type="button"
            onClick={() => {
              setFitToWidth(false);
              setZoomPercent((z) => Math.min(z + 10, 300));
            }}
            className="w-8 h-8 rounded-lg hover:bg-card-light dark:hover:bg-card-dark flex items-center justify-center transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4 text-text-secondary-light dark:text-text-secondary-dark" />
          </button>
          <button
            type="button"
            onClick={() => setFitToWidth(true)}
            className="w-8 h-8 rounded-lg hover:bg-card-light dark:hover:bg-card-dark flex items-center justify-center transition-colors"
            title="Fit to width"
          >
            <Maximize2 className="w-4 h-4 text-text-secondary-light dark:text-text-secondary-dark" />
          </button>
        </div>
        <span className="text-xs text-text-tertiary-light dark:text-text-tertiary-dark">Browser PDF Preview</span>

        <button
          type="button"
          onClick={onOpenInNewTab}
          className="flex items-center gap-2 px-3 py-1 text-xs rounded-lg hover:bg-card-light dark:hover:bg-card-dark transition-colors"
          title="Open in New Tab"
        >
          <ExternalLink className="w-3 h-3" />
          <span>Open</span>
        </button>
      </div>

      <div
        className="w-full overflow-x-hidden overflow-y-auto bg-[#F7F5F2] dark:bg-gray-900 rounded-lg p-4"
        style={{ minHeight: 'calc(100vh - 360px)', width: '100%', maxWidth: `${innerW}px` }}
      >
        {!isLoaded && (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-accent-warm border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <iframe
          key={iframeSrc}
          title="PDF Preview"
          src={iframeSrc}
          className="w-full border-0 rounded-md bg-white"
          style={{ height: 'calc(100vh - 360px)' }}
          onLoad={() => setIsLoaded(true)}
        />
      </div>
    </div>
  );
}

