import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { NodeSelection } from '@tiptap/pm/state';

const blockDragPluginKey = new PluginKey('blockDrag');

interface BlockDragOptions {
  dragHandleSelector: string;
}

export const BlockDragExtension = Extension.create<BlockDragOptions>({
  name: 'blockDrag',

  addOptions() {
    return {
      dragHandleSelector: '.block-drag-handle',
    };
  },

  addProseMirrorPlugins() {
    const opts = this.options;

    return [
      new Plugin({
        key: blockDragPluginKey,
        props: {
          handleDOMEvents: {
            dragstart(view, event) {
              const target = event.target as HTMLElement;
              if (!target.closest(opts.dragHandleSelector)) return false;

              const pos = view.posAtDOM(target, 0);
              const resolved = view.state.doc.resolve(pos);
              const parentDepth = resolved.depth;
              const blockPos = resolved.before(parentDepth + 1);

              const tr = view.state.tr.setSelection(NodeSelection.create(view.state.doc, blockPos));
              view.dispatch(tr);

              const slice = view.state.selection.content();
              event.dataTransfer?.setData('text/plain', 'block-drag');
              event.dataTransfer!.effectAllowed = 'move';

              return true;
            },

            dragover(view, event) {
              event.preventDefault();
              const target = event.target as HTMLElement;
              const pos = view.posAtDOM(target, 0);
              const resolved = view.state.doc.resolve(pos);
              const parentDepth = resolved.depth;
              const blockPos = resolved.before(parentDepth + 1);

              // Highlight drop target
              const existing = document.querySelector('.block-drop-indicator');
              if (existing) existing.remove();

              const coords = view.coordsAtPos(blockPos);
              const indicator = document.createElement('div');
              indicator.className = 'block-drop-indicator';
              indicator.style.cssText = `position:absolute;left:0;top:${coords.top - view.dom.getBoundingClientRect().top}px;height:3px;background:#D4A574;border-radius:2px;width:100%;pointer-events:none;z-index:10;`;
              view.dom.appendChild(indicator);

              return true;
            },

            dragleave() {
              document.querySelector('.block-drop-indicator')?.remove();
              return false;
            },

            drop(view, event) {
              event.preventDefault();
              document.querySelector('.block-drop-indicator')?.remove();

              const { from } = view.state.selection;
              const target = event.target as HTMLElement;
              const targetPos = view.posAtDOM(target, 0);
              const resolved = view.state.doc.resolve(targetPos);
              const parentDepth = resolved.depth;
              const destPos = resolved.before(parentDepth + 1);

              if (from !== destPos) {
                const node = view.state.doc.nodeAt(from);
                if (node) {
                  const tr = view.state.tr;
                  tr.delete(from, from + node.nodeSize);
                  const adjustedDest = destPos > from ? destPos - node.nodeSize : destPos;
                  tr.insert(adjustedDest, node);
                  view.dispatch(tr);
                }
              }

              return true;
            },

            dragend() {
              document.querySelector('.block-drop-indicator')?.remove();
              return false;
            },
          },
        },
      }),
    ];
  },
});
