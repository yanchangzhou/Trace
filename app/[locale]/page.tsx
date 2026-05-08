'use client';

import TitleBar from '@/components/TitleBar';
import SourceRail from '@/components/SourceRail';
import Canvas from '@/components/Canvas';
import SpotlightSearch from '@/components/SpotlightSearch';
import QuickLook from '@/components/QuickLook';
import FilePreviewPanel from '@/components/FilePreviewPanel';
import { useQuickLook } from '@/hooks/useQuickLook';
import { SidebarProvider } from '@/contexts/SidebarContext';
import { BookProvider } from '@/contexts/BookContext';
import { FilePreviewProvider } from '@/contexts/FilePreviewContext';
import { SpotlightProvider, useSpotlightContext } from '@/contexts/SpotlightContext';

function AppContent() {
  const spotlight = useSpotlightContext();
  const quickLook = useQuickLook();

  return (
    <>
      <TitleBar />
      <SourceRail />
      <FilePreviewPanel />
      <Canvas />
      <SpotlightSearch
        isOpen={spotlight.isOpen}
        onClose={spotlight.close}
        onQuickLook={(path: string) => { quickLook.setFilePath(path); quickLook.open(path); }}
      />
      <QuickLook
        isOpen={quickLook.isOpen}
        filePath={quickLook.filePath}
        onClose={quickLook.close}
      />
    </>
  );
}

export default function HomePage() {
  return (
    <SidebarProvider>
      <BookProvider>
        <FilePreviewProvider>
          <SpotlightProvider>
            <AppContent />
          </SpotlightProvider>
        </FilePreviewProvider>
      </BookProvider>
    </SidebarProvider>
  );
}
