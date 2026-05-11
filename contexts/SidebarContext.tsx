'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

export const MIN_SIDEBAR_WIDTH = 120;
export const MAX_SIDEBAR_WIDTH = 400;
const DEFAULT_EXPANDED = 150;

interface SidebarContextType {
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  sidebarWidth: number;
  expandedWidth: number;
  setExpandedWidth: (width: number) => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedWidth, setExpandedWidth] = useState(DEFAULT_EXPANDED);
  const sidebarWidth = isCollapsed ? 64 : expandedWidth;

  return (
    <SidebarContext.Provider value={{ isCollapsed, setIsCollapsed, sidebarWidth, expandedWidth, setExpandedWidth }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
}
