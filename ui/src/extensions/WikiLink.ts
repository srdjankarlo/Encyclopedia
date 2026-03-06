// src/extensions/WikiLink.ts
import { Mark, mergeAttributes } from '@tiptap/core';

export const WikiLink = Mark.create({
  name: 'wikiLink',
  
  addAttributes() {
    return {
      tabId: {
        default: null,
        parseHTML: element => element.getAttribute('data-tab-id'),
        renderHTML: attributes => ({ 'data-tab-id': attributes.tabId }),
      },
    };
  },
  
  parseHTML() { 
    return [{ tag: 'span[data-tab-id]' }]; 
  },

  renderHTML({ HTMLAttributes }) {
    // The 'broken' styling is handled via a global CSS class 
    // and a useEffect in App.tsx that checks validity.
    return ['span', mergeAttributes(HTMLAttributes, { class: 'wiki-link' }), 0];
  },
});