'use client';

import TitleBar from '@/components/TitleBar';
import SourceRail from '@/components/SourceRail';
import Canvas from '@/components/Canvas';
import SpotlightSearch from '@/components/SpotlightSearch';
import QuickLook from '@/components/QuickLook';
import FilePreviewPanel from '@/components/FilePreviewPanel';
import AIPanel from '@/components/ai/AIPanel';
import { useSpotlight } from '@/hooks/useSpotlight';
import { useQuickLook } from '@/hooks/useQuickLook';
import { SidebarProvider } from '@/contexts/SidebarContext';
import { BookProvider } from '@/contexts/BookContext';
import { FilePreviewProvider } from '@/contexts/FilePreviewContext';
import { EditorProvider } from '@/contexts/EditorContext';

export default function HomePage() {
  const spotlight = useSpotlight();
  const quickLook = useQuickLook();

  return (
    <SidebarProvider>
      <BookProvider>
        <FilePreviewProvider>
          <EditorProvider>
            <TitleBar />
            <SourceRail />
            <FilePreviewPanel />
            <Canvas />
            <AIPanel />
            <SpotlightSearch isOpen={spotlight.isOpen} onClose={spotlight.close} />
            <QuickLook
              isOpen={quickLook.isOpen}
              filePath={quickLook.filePath}
              onClose={quickLook.close}
            />
          </EditorProvider>
        </FilePreviewProvider>
      </BookProvider>
    </SidebarProvider>
  );
}
