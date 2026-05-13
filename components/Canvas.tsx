'use client';

import EditorShell from '@/components/editor/EditorShell';

/** Canvas is now a thin wrapper around EditorShell for backward compatibility. */
export default function Canvas() {
  return <EditorShell />;
}
