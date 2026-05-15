import { Extension } from '@tiptap/core';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';
import { createRoot } from 'react-dom/client';
import CommandList from './CommandList';
import { filterCommands, type CommandItem } from './commands';

const render: SuggestionOptions<CommandItem, CommandItem>['render'] = () => {
  let root: ReturnType<typeof createRoot> | null = null;
  let dom: HTMLElement | null = null;

  return {
    onStart(props) {
      dom = document.createElement('div');
      document.body.appendChild(dom);
      root = createRoot(dom);
      root.render(
        <CommandList
          editor={props.editor}
          items={props.items}
          command={props.command}
          clientRect={props.clientRect}
        />,
      );
    },

    onUpdate(props) {
      root?.render(
        <CommandList
          editor={props.editor}
          items={props.items}
          command={props.command}
          clientRect={props.clientRect}
        />,
      );
    },

    onExit() {
      root?.unmount();
      root = null;
      dom?.remove();
      dom = null;
    },
  };
};

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    return [
      Suggestion<CommandItem, CommandItem>({
        editor: this.editor,
        char: '/',
        allowedPrefixes: [' ', '\n', ''],
        startOfLine: false,
        command({ editor, range, props }) {
          editor.chain().focus().deleteRange(range).run();
          props.action(editor);
        },
        items({ query }) {
          return filterCommands(query);
        },
        render,
      }),
    ];
  },
});
