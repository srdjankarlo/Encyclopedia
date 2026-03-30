// src/extensions/SearchHighlight.ts
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

const searchHighlightKey = new PluginKey('searchHighlight');

// Teach TypeScript about our custom command
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    searchHighlight: {
      setSearchTerm: (searchTerm: string) => ReturnType;
    }
  }
}

export const SearchHighlight = Extension.create({
  name: 'searchHighlight',

  addCommands() {
    return {
      setSearchTerm: (searchTerm: string) => ({ tr }) => {
        tr.setMeta(searchHighlightKey, searchTerm);
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: searchHighlightKey,
        state: {
          init() {
            return { searchTerm: '', decorations: DecorationSet.empty };
          },
          apply(tr, oldState) {
            let searchTerm = oldState.searchTerm;
            const meta = tr.getMeta(searchHighlightKey);
            
            // Update search term if a new one was dispatched
            if (meta !== undefined) {
              searchTerm = meta;
            }

            // If the document didn't change and the search term didn't change, do nothing
            if (!tr.docChanged && meta === undefined) {
              return oldState;
            }

            const decorations: Decoration[] = [];
            if (searchTerm) {
              const doc = tr.doc;
              const search = searchTerm.toLowerCase();
              
              // Scan the document for text nodes and highlight matches
              doc.descendants((node, pos) => {
                if (node.isText && node.text) {
                  const text = node.text.toLowerCase();
                  let index = text.indexOf(search);
                  while (index !== -1) {
                    decorations.push(
                      Decoration.inline(pos + index, pos + index + search.length, {
                        class: 'content-search-match',
                      })
                    );
                    index = text.indexOf(search, index + search.length);
                  }
                }
              });
              return { searchTerm, decorations: DecorationSet.create(doc, decorations) };
            }

            return { searchTerm, decorations: DecorationSet.empty };
          },
        },
        props: {
          decorations(state) {
            return searchHighlightKey.getState(state)?.decorations;
          },
        },
      }),
    ];
  },
});