// src/App.tsx
import { useState, useEffect, useRef } from 'react';
import { ResizableBox } from 'react-resizable';
import { useEditor, EditorContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Heading } from '@tiptap/extension-heading';
import { BulletList } from '@tiptap/extension-bullet-list';
import { OrderedList } from '@tiptap/extension-ordered-list';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import ImageResize from 'tiptap-extension-resize-image';
import { Link } from '@tiptap/extension-link';
import type { Tab, WindowData, SortMode, SaveStatus } from './types';
import { WikiLink } from './extensions/WikiLink';
import ExportModal from './components/ExportModal';
import EditorToolbar from './components/EditorToolbar';
import './App.css';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Extension } from '@tiptap/core';
import { TextSelection } from 'prosemirror-state';
import { openUrl } from '@tauri-apps/plugin-opener';
import { SearchHighlight } from './extensions/SearchHighlight';
import { TextAlign } from '@tiptap/extension-text-align';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { Highlight } from '@tiptap/extension-highlight';

const API_URL = "http://localhost:8080";

const CustomEditorShortcuts = Extension.create({
  name: 'customEditorShortcuts',

  addKeyboardShortcuts() {
    return {
      // Tab inserts an indent and prevents jumping through checkboxes/focus
      'Tab': () => {
        // \u00A0 is a non-breaking space. 4 of them equals one tab indent.
        // HTML will never strip these out when saving/loading.
        return this.editor.commands.insertContent('\u00A0\u00A0\u00A0\u00A0');
      },
      
      // Move line/block up
      'Shift-Alt-ArrowUp': () => {
        const { state, dispatch } = this.editor.view;
        const { selection, tr } = state;
        const { $from, $to } = selection;

        const range = $from.blockRange($to);
        if (!range || range.startIndex === 0) return false; // Already at the top

        const parent = range.parent;
        const nodeBefore = parent.child(range.startIndex - 1);
        const beforeSize = nodeBefore.nodeSize;

        const startPos = range.start;
        const endPos = range.end;
        const beforePos = startPos - beforeSize;

        if (dispatch) {
          // Slice the current block, delete it, and re-insert it above the previous block
          const slice = state.doc.slice(startPos, endPos);
          tr.delete(startPos, endPos);
          tr.insert(beforePos, slice.content);
          
          // Map the selection to follow the moved text
          const mappedFrom = tr.doc.resolve($from.pos - beforeSize);
          const mappedTo = tr.doc.resolve($to.pos - beforeSize);
          tr.setSelection(TextSelection.between(mappedFrom, mappedTo));
          
          dispatch(tr.scrollIntoView());
        }
        return true;
      },

      // Move line/block down
      'Shift-Alt-ArrowDown': () => {
        const { state, dispatch } = this.editor.view;
        const { selection, tr } = state;
        const { $from, $to } = selection;

        const range = $from.blockRange($to);
        if (!range) return false;

        const parent = range.parent;
        if (range.endIndex === parent.childCount) return false; // Already at the bottom

        const nodeAfter = parent.child(range.endIndex);
        const afterSize = nodeAfter.nodeSize;

        const startPos = range.start;
        const endPos = range.end;

        if (dispatch) {
          // Slice the current block, delete it, and re-insert it below the next block
          const slice = state.doc.slice(startPos, endPos);
          tr.delete(startPos, endPos);
          tr.insert(startPos + afterSize, slice.content);

          // Map the selection to follow the moved text
          const mappedFrom = tr.doc.resolve($from.pos + afterSize);
          const mappedTo = tr.doc.resolve($to.pos + afterSize);
          tr.setSelection(TextSelection.between(mappedFrom, mappedTo));

          dispatch(tr.scrollIntoView());
        }
        return true;
      },
    };
  },
});

export default function App() {
  // --- CORE STATE ---
  const [windows, setWindows] = useState<Record<string, WindowData>>({ 'root': { id: 'root', tabs: [] } });
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  
  // NEW: Editor visibility state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  
  // --- UI STATE ---
  const [globalSearch, setGlobalSearch] = useState("");
  const [contentSearch, setContentSearch] = useState("");
  const [contentMatches, setContentMatches] = useState<{tabId: string, title: string}[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [globalSortMode, setGlobalSortMode] = useState<SortMode>('oldest');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => localStorage.getItem('theme') === 'dark');
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  
  // NEW: List view specific width state so it remembers stretching
  const [listViewWidth, setListViewWidth] = useState(350);

  // NEW: Track expanded items in List View
  const [expandedListNodes, setExpandedListNodes] = useState<Set<string>>(new Set());
  
  // --- SYNC STATE ---
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  
  const isInitialMount = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const windowsRef = useRef(windows);
  useEffect(() => {
    windowsRef.current = windows;
  }, [windows]);

  const editor = useEditor({
    extensions: [
      CustomEditorShortcuts,
      StarterKit.configure({ heading: false, bulletList: false, orderedList: false, dropcursor: {} }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TaskList, TaskItem.configure({ nested: true }),
      Heading.configure({ levels: [1, 2, 3] }),
      BulletList,
      OrderedList,
      // CUSTOM ORDERED LIST (For a,b,c support)
      // OrderedList.extend({
      //   addAttributes() {
      //     return {
      //       ...this.parent?.(),
      //       listStyle: {
      //         default: 'decimal',
      //         parseHTML: element => element.style.listStyleType || 'decimal',
      //         renderHTML: attributes => ({ style: `list-style-type: ${attributes.listStyle}` }),
      //       },
      //     };
      //   },
      // }),
      // OrderedList.configure({
      //   HTMLAttributes: {
      //     class: 'ordered-list',
      //   },
      //   // This allows the 'type' attribute (e.g., <ol type="a">) to be preserved
      //   keepAttributes: true,
      //   keepMarks: true,
      // }),
      // CUSTOM TABLE CELL (For background colors and vertical alignment)
      Table.configure({ resizable: true, lastColumnResizable: true, allowTableNodeSelection: true}),
      TableRow, TableHeader,
      TableCell.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            backgroundColor: {
              default: null,
              parseHTML: element => element.getAttribute('data-bg-color'),
              renderHTML: attributes => attributes.backgroundColor ? { 'data-bg-color': attributes.backgroundColor, style: `background-color: ${attributes.backgroundColor}` } : {},
            },
            verticalAlign: {
              default: 'top',
              parseHTML: element => element.style.verticalAlign || 'top',
              renderHTML: attributes => ({ style: `vertical-align: ${attributes.verticalAlign}` }),
            }
          };
        }
      }),
      // 3. TEXT ALIGNMENT (For horizontal alignment in cells)
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      (ImageResize as any).configure({
        inline: false, allowBase64: true, HTMLAttributes: { class: 'resizable-image' },
        addAttributes() {
          return {
            src: {}, alt: { default: null }, title: { default: null },
            width: { default: 'auto', renderHTML: (attributes: any) => ({ width: attributes.width }), parseHTML: (element: HTMLElement) => element.getAttribute('width') || 'auto' },
            height: { default: 'auto', renderHTML: (attributes: any) => ({ height: attributes.height }), parseHTML: (element: HTMLElement) => element.getAttribute('height') || 'auto' },
          };
        },
      }),
      WikiLink,
      // Link.configure({ openOnClick: false, autolink: false, HTMLAttributes: { class: 'wiki-link', target: null, rel: null } }),
      // EXTERNAL WEB LINKS CONFIG
      Link.configure({ 
        openOnClick: false,
        autolink: true,    // Auto-detects URLs
        HTMLAttributes: { 
          class: 'external-link'
        } 
      }),
      SearchHighlight,
    ],
    editorProps: {
      handleDOMEvents: {
        click: (_view, event) => {
          const target = event.target as HTMLElement;

          // --- 1. HANDLE WIKI LINKS (Existing) ---
          const wikiSpan = target.closest('.wiki-link');
          if (wikiSpan) {
            const tabId = wikiSpan.getAttribute('data-tab-id');
            const tabExists = Object.values(windows).some(w => w.tabs.some(t => t.id === tabId));
            if (!tabExists) {
              wikiSpan.setAttribute('data-broken', 'true'); 
              alert("This tab has been deleted and the link is broken."); 
              return true;
            }
            handleInternalNavigation(tabId!); 
            return true;
          }

          // --- 2. HANDLE EXTERNAL LINKS (New) ---
          const externalLink = target.closest('a.external-link') as HTMLAnchorElement;
          if (externalLink && externalLink.href) {
            event.preventDefault(); // Stop the app from trying to navigate internally
            
            // Call the Tauri Opener API
            openUrl(externalLink.href).catch(console.error);
            
            return true; // Mark event as handled
          }

          return false;
        },
        // NEW: Double-click to auto-fit table columns
        dblclick: (_view, event) => {
          const target = event.target as HTMLElement;
          if (target.classList.contains('column-resize-handle')) {
            // If they double click the resizer, remove the fixed width from the column 
            // so the browser naturally snaps it to the text width.
            const cell = target.closest('td, th') as HTMLElement;
            if (cell) {
              const cellIndex = Array.from(cell.parentElement!.children).indexOf(cell);
              const table = cell.closest('table');
              const colgroup = table?.querySelector('colgroup');
              if (colgroup) {
                const col = colgroup.children[cellIndex] as HTMLElement;
                if (col) col.removeAttribute('width'); // Resets to auto-fit
              }
              return true;
            }
          }
          return false;
        }
      },
    },
    content: '',
    onUpdate: ({ editor }) => {
      if (!activeTabId) return;
      const html = editor.getHTML();
      setWindows(prev => {
        const next = { ...prev };
        for (const winId in next) {
          const tab = next[winId].tabs.find(t => t.id === activeTabId);
          if (tab) { tab.content = html; break; }
        }
        return next;
      });
    },
  }, [activeTabId]);

  useEffect(() => {
    if (!editor || !activeTabId) return;

    const handleUpdate = () => {
      const html = editor.getHTML();
      
      // Check if content actually changed to avoid unnecessary state updates
      const currentTab = Object.values(windowsRef.current)
        .flatMap(w => w.tabs)
        .find(t => t.id === activeTabId);

      if (currentTab && currentTab.content === html) return;

      setWindows(prev => {
        const next = { ...prev };
        for (const winId in next) {
          const tab = next[winId].tabs.find(t => t.id === activeTabId);
          if (tab) { 
            tab.content = html; 
            break; 
          }
        }
        return next;
      });
    };

    editor.on('update', handleUpdate);
    return () => { editor.off('update', handleUpdate); };
  }, [editor, activeTabId]);

  // --- ACTIONS ---
  const addTab = async (windowId: string) => {
    const win = windows[windowId];
    if (!win) return;
    const info = windowId === 'root' ? { fullPath: "New Tab" } : { fullPath: windows[Object.keys(windows).find(k => windows[k].tabs.some(t => t.id === windowId)) || 'root']?.tabs.find(t => t.id === windowId)?.title || "Sub" };
    let maxNum = 0;
    win.tabs.forEach(t => {
      const parts = t.title.split('.');
      const numMatch = parts[parts.length - 1].match(/\d+/);
      if (numMatch) {
        const num = parseInt(numMatch[0]);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });

    const newId = `tab-${Math.random().toString(36).substring(2, 11)}`;
    const newTitle = windowId === 'root' ? `New Tab ${maxNum + 1}` : `${info.fullPath}.${maxNum + 1}`;
    
    setWindows(prev => ({ 
      ...prev, 
      [windowId]: { 
        ...prev[windowId], 
        tabs: [...prev[windowId].tabs, { id: newId, title: newTitle, content: '', createdAt: Date.now(), parentId: windowId === 'root' ? null : windowId }] 
      },
      [newId]: { id: newId, tabs: [], collapsed: false }
    }));
    return newId;
  };

  const deleteTab = async (windowId: string, tabId: string) => {
    if (!window.confirm("Delete this item and all sub-items?")) return;
    const next = { ...windows };
    const idsToRemove = new Set<string>();

    const collectAndKill = (id: string) => {
      idsToRemove.add(id);
      if (next[id]) { next[id].tabs.forEach(child => collectAndKill(child.id)); delete next[id]; }
    };
    collectAndKill(tabId);
    if (next[windowId]) next[windowId].tabs = next[windowId].tabs.filter(t => t.id !== tabId);

    setWindows(next);
    if (activeTabId && idsToRemove.has(activeTabId)) setActiveTabId(null);
    try { await fetch(`${API_URL}/tabs/${tabId}`, { method: 'DELETE' }); } catch (e) { console.error(e); }
  };

  // const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
  //   const file = e.target.files?.[0];
  //   if (!file) return;
  //   const reader = new FileReader();
  //   reader.onload = (event) => {
  //     try {
  //       const importedData: any[] = JSON.parse(event.target?.result as string);
  //       const newWindows: Record<string, WindowData> = { 'root': { id: 'root', tabs: [] } };
  //       const idMap: Record<string, string> = {}; 
  //       importedData.forEach(item => { idMap[item.title] = `tab-${Math.random().toString(36).substring(2, 11)}`; });

  //       [...importedData].sort((a, b) => (a.depth || 0) - (b.depth || 0)).forEach(item => {
  //         const newId = idMap[item.title];
  //         const targetWinId = (item.fromParent !== "Root" && idMap[item.fromParent]) ? idMap[item.fromParent] : 'root';
  //         if (!newWindows[targetWinId]) newWindows[targetWinId] = { id: targetWinId, tabs: [], collapsed: false };
  //         newWindows[targetWinId].tabs.push({ id: newId, title: item.title, content: item.content, createdAt: item.createdAt || Date.now() });
  //         if (!newWindows[newId]) newWindows[newId] = { id: newId, tabs: [], collapsed: false };
  //       });
  //       setWindows(newWindows);
  //     } catch (err) { alert("Import failed: Ensure you are using a valid JSON export file."); }
  //   };
  //   reader.readAsText(file);
  // };

  const getEditorStats = () => {
    if (!editor) return { chars: 0, words: 0, lines: 0 };
    const text = editor.getText();
    return { chars: text.length, words: text.trim() ? text.trim().split(/\s+/).length : 0, lines: text.split(/\r\n|\r|\n/).length };
  };

  // --- HELPERS ---
  const getFilteredAndSortedTabs = (tabs: Tab[]) => {
    return [...tabs]
      .sort((a, b) => {
        if (globalSortMode === 'alpha') return a.title.localeCompare(b.title, undefined, { numeric: true });
        if (globalSortMode === 'alpha-desc') return b.title.localeCompare(a.title, undefined, { numeric: true });
        if (globalSortMode === 'newest') return b.createdAt - a.createdAt;
        return a.createdAt - b.createdAt; 
      });
  };

  const getFlattenedTabs = (allTabs: Tab[], parentId: string | null = null, depth = 0): (Tab & { depth: number })[] => {
    const children = allTabs.filter(t => t.parentId === (parentId === 'root' ? null : parentId));
    const sortedChildren = getFilteredAndSortedTabs(children);
    let result: (Tab & { depth: number })[] = [];
    
    // If the user is searching, force all branches open so matches are visible
    const isSearchActive = globalSearch.trim() !== '';

    sortedChildren.forEach(child => {
      result.push({ ...child, depth });
      // NEW: Only fetch grandchildren if this node is expanded or we are searching
      if (isSearchActive || expandedListNodes.has(child.id)) {
        const grandchildren = getFlattenedTabs(allTabs, child.id, depth + 1);
        result = [...result, ...grandchildren];
      }
    });
    return result;
  };

  const activateTab = (tab: Tab) => {
    setActiveTabId(tab.id);
  };

  // --- EDITOR SETUP ---
  const handleInternalNavigation = (tabId: string) => {
    activateTab({ id: tabId } as Tab); // Rough mock to trigger trace
    setTimeout(() => {
      const element = document.getElementById(`tab-row-${tabId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('teleport-flash');
        setTimeout(() => element.classList.remove('teleport-flash'), 1500);
      }
    }, 200);
  };

  const [, setTick] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const updateHandler = () => setTick(t => t + 1);
    editor.on('selectionUpdate', updateHandler); editor.on('transaction', updateHandler);
    return () => { editor.off('selectionUpdate', updateHandler); editor.off('transaction', updateHandler); };
  }, [editor]);

  // --- THEME EFFECT ---
  useEffect(() => {
    document.body.classList.toggle('dark-theme', isDarkMode);
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  // --- DB LOAD EFFECT ---
  useEffect(() => {
    const loadFromDb = async () => {
      try {
        const res = await fetch(`${API_URL}/tabs`);
        const dbTabs: any[] = await res.json();
        if (!dbTabs || dbTabs.length === 0) return;

        const newWindows: Record<string, WindowData> = { 'root': { id: 'root', tabs: [] } };
        dbTabs.forEach(t => { if (t.id) newWindows[t.id] = { id: t.id, tabs: [], collapsed: false }; });
        
        dbTabs.forEach(t => {
          const targetWinId = t.parent_id || 'root';
          if (!newWindows[targetWinId]) newWindows[targetWinId] = { id: targetWinId, tabs: [], collapsed: false };
          newWindows[targetWinId].tabs.push({
            id: t.id, title: t.title, content: t.content, 
            createdAt: Number(t.created_at), parentId: t.parent_id
          });
        });
        setWindows(newWindows);
      } catch (e) { console.error("❌ DB Load failed", e); }
    };
    loadFromDb();
  }, []);

  // --- AUTO-SAVE EFFECT ---
  useEffect(() => {
    if (isInitialMount.current) { isInitialMount.current = false; return; }
    setSaveStatus('saving');
    const timer = setTimeout(async () => {
      try {
        const promises = Object.entries(windows).flatMap(([winId, win]) => 
          win.tabs.map(tab => 
            fetch(`${API_URL}/tabs`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                id: tab.id, title: tab.title, content: tab.content, 
                parent_id: winId === 'root' ? null : winId, 
                child_window_id: tab.id, created_at: tab.createdAt 
              }),
            })
          )
        );
        await Promise.all(promises);
        setSaveStatus('saved');
        setLastSaved(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      } catch (e) { setSaveStatus('error'); }
    }, 1000);
    return () => clearTimeout(timer);
  }, [windows]);

  // --- GLOBAL KEYBOARD LOGIC ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInsideEditor = target.closest('.rich-editor');
      const isInput = ['INPUT', 'TEXTAREA'].includes(target.tagName);

      // 1. Ctrl + E: Toggle editor focus
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        if (isInsideEditor) {
          (document.activeElement as HTMLElement)?.blur();
          document.getElementById(`tab-row-${activeTabId}`)?.focus();
        } else if (activeTabId) {
          if (!isEditorOpen) setIsEditorOpen(true);
          setTimeout(() => editor?.commands.focus('end'), 50);
        }
        return;
      }

      // Ctrl + A Logic
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        // If we are NOT in the editor and NOT in an input field (like the search bar)
        if (!isInsideEditor && !isInput) {
          e.preventDefault(); // Stop the browser from selecting everything
          if (activeTabId) {
            addTab(activeTabId).then(newId => {
              if (newId) setActiveTabId(newId);
            });
          }
          return;
        }
        // If we ARE in the editor or input, we do nothing and let the default Select All happen
      }

      // Ignore standard key presses if renaming a tab or typing in an input
      if (editingTabId || (isInput && !isInsideEditor)) return;

      // 2. Action Shortcuts (F2, Delete, Enter)
      if (activeTabId && !isInsideEditor) {
        if (e.key === 'F2') {
          e.preventDefault();
          setEditingTabId(activeTabId);
          return;
        }
        if (e.key === 'Delete') {
          e.preventDefault();
          const winId = Object.keys(windows).find(id => windows[id].tabs.some(t => t.id === activeTabId));
          if (winId) deleteTab(winId, activeTabId);
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          setIsEditorOpen(prev => !prev);
          return;
        }
      }

      // 3. Arrow Navigation
      const isArrow = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key);
      if (isArrow && !isInsideEditor) {
        e.preventDefault();

        // Jump to active if none is focused
        if (!activeTabId) {
          const rootTabs = getFilteredAndSortedTabs(windows['root']?.tabs || []);
          if (rootTabs.length > 0) activateTab(rootTabs[0]);
          return;
        }

        const allTabs = Object.values(windows).flatMap(w => w.tabs);
        const activeTab = allTabs.find(t => t.id === activeTabId);
        if (!activeTab) return;

        const hasChildren = allTabs.some(t => t.parentId === activeTab.id);
        const isExpanded = expandedListNodes.has(activeTab.id);
        const searchLower = globalSearch.toLowerCase().trim();

        let nextTab: Tab | undefined;

        // Helper to get correctly sorted & filtered siblings/children
        const getVisible = (parentId: string | null) => 
          getFilteredAndSortedTabs(allTabs.filter(t => t.parentId === parentId))
            .filter(t => searchLower === '' || t.title.toLowerCase().includes(searchLower));

        if (e.key === 'ArrowDown') {
          const siblings = getVisible(activeTab.parentId ?? null);
          const idx = siblings.findIndex(t => t.id === activeTab.id);
          if (idx >= 0 && idx < siblings.length - 1) nextTab = siblings[idx + 1];
        } 
        else if (e.key === 'ArrowUp') {
          const siblings = getVisible(activeTab.parentId ?? null);
          const idx = siblings.findIndex(t => t.id === activeTab.id);
          if (idx > 0) nextTab = siblings[idx - 1];
        }
        else if (e.key === 'ArrowRight') {
          if (hasChildren && !isExpanded) {
            // 1. Expand children if collapsed
            setExpandedListNodes(prev => new Set(prev).add(activeTab.id));
          } else if (hasChildren && isExpanded) {
            // 2. Move to first child if already expanded
            const children = getVisible(activeTab.id);
            if (children.length > 0) nextTab = children[0];
          }
        }
        else if (e.key === 'ArrowLeft') {
          if (hasChildren && isExpanded) {
            // 1. Collapse children if expanded
            setExpandedListNodes(prev => {
              const next = new Set(prev);
              next.delete(activeTab.id);
              return next;
            });
          } else if (activeTab.parentId) {
            // 2. Move to parent if already collapsed (or leaf node)
            nextTab = allTabs.find(t => t.id === activeTab.parentId);
          }
        }

        if (nextTab) {
          activateTab(nextTab);
          setTimeout(() => document.getElementById(`tab-row-${nextTab!.id}`)?.focus(), 10);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTabId, isEditorOpen, windows, editingTabId, editor, globalSearch, globalSortMode, expandedListNodes]);

  useEffect(() => {
    if (editor && activeTabId) {
      let content = "";
      for (const winId in windows) {
        const tab = windows[winId].tabs.find(t => t.id === activeTabId);
        if (tab) { content = tab.content; break; }
      }
      if (content !== editor.getHTML()) editor.commands.setContent(content);
    }
  }, [activeTabId, editor, windows]);

  useEffect(() => {
    const scanLinks = () => {
      const existingIds = new Set(Object.values(windows).flatMap(w => w.tabs.map(t => t.id)));
      document.querySelectorAll('.wiki-link').forEach(link => {
        const id = link.getAttribute('data-tab-id');
        if (id && !existingIds.has(id)) { link.classList.add('is-broken'); link.setAttribute('data-broken', 'true'); } 
        else { link.classList.remove('is-broken'); link.removeAttribute('data-broken'); }
      });
    };
    scanLinks();
    const timeout = setTimeout(scanLinks, 100);
    return () => clearTimeout(timeout);
  }, [windows, activeTabId, editor?.getHTML()]);

  // Sync the search term to the editor's highlight extension
  useEffect(() => {
    if (editor) {
      editor.commands.setSearchTerm(contentSearch);
    }
  }, [contentSearch, activeTabId, editor]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setGlobalSearch(query);

    // If there is text in the search bar, auto-open the path to the first match
    if (query.trim() !== '') {
      const searchLower = query.toLowerCase();
      const allTabs = Object.values(windows).flatMap(w => w.tabs);
      
      // Find the first tab anywhere in the tree that matches the query
      const firstMatch = allTabs.find(t => t.title.toLowerCase().includes(searchLower));
      
      if (firstMatch) {
        // This existing function naturally expands the Miller columns to this tab!
        activateTab(firstMatch);
      }
    }
  };

  // Helper to open the folder tree to the matched tab
  const expandToTab = (tabId: string) => {
    const path: string[] = [];
    let currentId: string | null = tabId;
    const allTabs = Object.values(windows).flatMap(w => w.tabs);
    
    while (currentId) {
      const tab = allTabs.find(t => t.id === currentId);
      if (tab && tab.parentId) {
        path.push(tab.parentId);
        currentId = tab.parentId;
      } else {
        break;
      }
    }
    if (path.length > 0) {
      setExpandedListNodes(prev => new Set([...prev, ...path]));
    }
  };

  const handleContentSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value.toLowerCase();
    setContentSearch(query);

    if (!query.trim()) {
      setContentMatches([]);
      return;
    }

    const matches: {tabId: string, title: string}[] = [];
    Object.values(windows).forEach(w => {
      w.tabs.forEach(t => {
        // Strip HTML tags to search only the plain text
        const plainText = t.content.replace(/<[^>]*>?/gm, '').toLowerCase();
        if (plainText.includes(query)) {
          matches.push({ tabId: t.id, title: t.title });
        }
      });
    });

    setContentMatches(matches);
    setCurrentMatchIndex(0);

    // Auto-jump to first match
    if (matches.length > 0) {
      activateTab({ id: matches[0].tabId } as Tab);
      expandToTab(matches[0].tabId);
    }
  };

  const cycleMatch = (direction: 1 | -1) => {
    if (contentMatches.length === 0) return;
    let newIndex = currentMatchIndex + direction;
    
    // Wrap around logic
    if (newIndex < 0) newIndex = contentMatches.length - 1;
    if (newIndex >= contentMatches.length) newIndex = 0;
    
    setCurrentMatchIndex(newIndex);
    activateTab({ id: contentMatches[newIndex].tabId } as Tab);
    expandToTab(contentMatches[newIndex].tabId);
  };

  return (
    <div className={`app-wrapper ${isDarkMode ? 'dark-theme' : ''}`}>
      
      {/* --- NEW GLOBAL MENUBAR --- */}
      <div className="global-menubar">
        <div className="menu-item" onMouseLeave={() => setActiveMenu(null)}>
          <button onMouseEnter={() => setActiveMenu('data')} onClick={() => setActiveMenu(activeMenu === 'data' ? null : 'data')}>Data</button>
          {activeMenu === 'data' && (
            <div className="dropdown">
              <button onClick={() => fileInputRef.current?.click()}>Import</button>
              <button onClick={() => setIsExportModalOpen(true)}>Export</button>
            </div>
          )}
        </div>

        <div className="menu-item" onMouseLeave={() => setActiveMenu(null)}>
          <button onMouseEnter={() => setActiveMenu('sort')} onClick={() => setActiveMenu(activeMenu === 'sort' ? null : 'sort')}>Sort</button>
          {activeMenu === 'sort' && (
            <div className="dropdown">
              <button className={globalSortMode === 'oldest' ? 'active' : ''} onClick={() => setGlobalSortMode('oldest')}>Oldest</button>
              <button className={globalSortMode === 'newest' ? 'active' : ''} onClick={() => setGlobalSortMode('newest')}>Newest</button>
              <button className={globalSortMode === 'alpha' ? 'active' : ''} onClick={() => setGlobalSortMode('alpha')}>A-Z</button>
              <button className={globalSortMode === 'alpha-desc' ? 'active' : ''} onClick={() => setGlobalSortMode('alpha-desc')}>Z-A</button>
            </div>
          )}
        </div>

        <div className="menu-item" onMouseLeave={() => setActiveMenu(null)}>
          <button onMouseEnter={() => setActiveMenu('view')} onClick={() => setActiveMenu(activeMenu === 'view' ? null : 'view')}>View</button>
          {activeMenu === 'view' && (
            <div className="dropdown">
              <button onClick={() => setIsDarkMode(!isDarkMode)}>{isDarkMode ? 'Light Mode' : 'Dark Mode'}</button>
              <button onClick={() => {
                const allTabs = Object.values(windows).flatMap(w => w.tabs);
                if (expandedListNodes.size > 0) {
                  setExpandedListNodes(new Set()); // Collapse all
                } else {
                  setExpandedListNodes(new Set(allTabs.map(t => t.id))); // Expand all
                }
              }}>{expandedListNodes.size > 0 ? 'Collapse All' : 'Expand All'}</button>
            </div>
          )}
        </div>

        <div className="menu-item" onMouseLeave={() => setActiveMenu(null)}>
          <button onMouseEnter={() => setActiveMenu('help')} onClick={() => setActiveMenu(activeMenu === 'help' ? null : 'help')}>Help</button>
          {activeMenu === 'help' && (
            <div className="dropdown">
              <button onClick={() => setShowShortcuts(true)}>Show Shortcuts</button>
            </div>
          )}
        </div>
        
        {/* Right side search bars */}
        <div className="menubar-search">
          <input placeholder="Search tabs by title..." value={globalSearch} onChange={handleSearch} />
          <div className="content-search-wrapper">
            <input 
              placeholder="Search content..." 
              value={contentSearch} 
              onChange={handleContentSearch} 
              onKeyDown={(e) => { if (e.key === 'Enter') cycleMatch(1); }} 
            />
            {contentMatches.length > 0 && (
              <div className="search-nav">
                <button onClick={() => cycleMatch(-1)}>▲</button>
                <span>{currentMatchIndex + 1}/{contentMatches.length}</span>
                <button onClick={() => cycleMatch(1)}>▼</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- EXISTING APP CONTAINER --- */}
      <div className={`app-container ${isDarkMode ? 'dark-theme' : ''}`}>
        <div className="miller-columns">
          {/* Use state for width so List View remembers resizing */}
          <ResizableBox 
            width={listViewWidth} height={Infinity} axis="x" 
            onResize={(_e, { size }) => setListViewWidth(size.width)}
            minConstraints={[250, Infinity]} maxConstraints={[600, Infinity]}
            handle={<div className="drag-handle" />}
          >
            <div className="column" style={{ width: '100%' }}>
              {/* Cleaned up column header since controls moved to top menu */}
              <div className="column-header" style={{ borderBottom: 'none' }}>
                <span className="header-title">LIBRARY</span>
              </div>

              <div className="tab-list tree-view">
                <div className="root-footer">
                  <button tabIndex={-1} className="add-btn" onClick={async () => {
                      const newId = await addTab('root');
                      if (newId) setActiveTabId(newId);
                    }}> + Add New Root Item
                  </button>
                </div>
                {getFlattenedTabs(Object.values(windows).flatMap(w => w.tabs))
                  .map(tab => {
                    const isSearchMatch = globalSearch.trim() !== '' && tab.title.toLowerCase().includes(globalSearch.toLowerCase());

                    // Calculate if this tab has children to show the toggle arrow
                    const allTabs = Object.values(windows).flatMap(w => w.tabs);
                    const hasChildren = allTabs.some(t => t.parentId === tab.id);

                    return (
                      <div key={tab.id}>
                        <div 
                          id={`tab-row-${tab.id}`} tabIndex={-1}
                          className={`tab-row ${activeTabId === tab.id ? 'active' : ''} ${isSearchMatch ? 'search-highlight' : ''}`}
                          onClick={() => activateTab(tab)}
                          style={{ paddingLeft: `${(tab as any).depth * 20 + 12}px` }}
                        >
                          {/* NEW: Clickable Expand/Collapse Arrow */}
                          <span 
                            className="tree-indicator" 
                            style={{ cursor: hasChildren ? 'pointer' : 'default' }}
                            onClick={(e) => {
                              if (hasChildren) {
                                e.stopPropagation(); // Don't trigger the tab selection
                                setExpandedListNodes(prev => {
                                  const next = new Set(prev);
                                  if (next.has(tab.id)) next.delete(tab.id);
                                  else next.add(tab.id);
                                  return next;
                                });
                              }
                            }}
                          >
                            {hasChildren ? (expandedListNodes.has(tab.id) ? '▼' : '▶') : '•'}
                          </span>
                          {editingTabId === tab.id ? (
                            <input 
                              autoFocus value={tab.title} 
                              onBlur={() => setEditingTabId(null)} 
                              onKeyDown={(e) => { if (e.key === 'Enter') setEditingTabId(null); }} 
                              onChange={(e) => {
                                const next = { ...windows };
                                Object.keys(next).forEach(winId => {
                                  const t = next[winId].tabs.find(i => i.id === tab.id);
                                  if (t) t.title = e.target.value;
                                });
                                setWindows(next);
                              }}
                            />
                          ) : ( <span className="tab-title">{tab.title}</span> )}
                          
                          <div className="tab-actions">
                            <button tabIndex={-1} className="edit-btn" onClick={(e) => { e.stopPropagation(); setEditingTabId(tab.id); }}>✎</button>
                            <button tabIndex={-1} className="del-btn" onClick={(e) => { 
                              e.stopPropagation(); 
                              const winId = Object.keys(windows).find(id => windows[id].tabs.some(t => t.id === tab.id));
                              if (winId) deleteTab(winId, tab.id);
                            }}>✕</button>
                          </div>
                        </div>

                        {activeTabId === tab.id && (
                          <div className="tab-list-actions" style={{ paddingLeft: `${((tab as any).depth + 1) * 20 + 24}px` }}>
                            <button tabIndex={-1} className="add-btn" onClick={async () => {
                                const newId = await addTab(tab.id);
                                if (newId) {
                                  setActiveTabId(newId);
                                }
                              }}>+ Add Child
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })
                }
              </div>
            </div>
          </ResizableBox>

          {/* --- THE EDITOR --- */}
          <div className="writing-space">
            {activeTabId && isEditorOpen && editor ? (
              <div className="editor-wrapper">
                <EditorToolbar editor={editor} windows={windows} saveStatus={saveStatus} lastSaved={lastSaved} handleManualRetry={() => setWindows(p => ({...p}))} />
                <EditorContent editor={editor} className="rich-editor" />
                <div className="editor-footer">
                  <div className="stat">Length: <span>{getEditorStats().chars}</span></div>
                  <div className="stat">Words: <span>{getEditorStats().words}</span></div>
                  <div className="stat">Lines: <span>{getEditorStats().lines}</span></div>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                {activeTabId ? (
                  <span>Editor hidden. Press <strong>ENTER</strong> to open.</span>
                ) : (
                  "Select an item to view/edit content."
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {isExportModalOpen && <ExportModal windows={windows} onClose={() => setIsExportModalOpen(false)} />}
      
      {/* NEW: Shortcuts Modal for the Help Menu */}
      {showShortcuts && (
        <div className="modal-overlay" onClick={() => setShowShortcuts(false)}>
           <div className="export-modal" onClick={e => e.stopPropagation()}>
             <h3 style={{color: 'var(--accent-color)', margin: '0 0 15px 0'}}>Keyboard Shortcuts</h3>
             <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', fontSize: '13px', color: 'var(--text-main)'}}>
                <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                  <span><strong>F2:</strong> Rename Tab</span>
                  <span><strong>DEL:</strong> Delete Tab</span>
                  <span><strong>CTRL+A:</strong> Add Child Tab</span>
                  <span><strong>CTRL+E:</strong> Focus/Unfocus Editor</span>
                </div>
                <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                  <span><strong>ARROWS:</strong> Navigate tabs</span>
                  <span><strong>ENTER:</strong> Open/Activate tab</span>
                  <span><strong>CTRL+F:</strong> Find tabs/content</span>
                  <span><strong>ALT+SHIFT+Up/Down:</strong> Move text</span>
                </div>
             </div>
             <div className="modal-actions" style={{marginTop: '25px'}}>
               <button className="confirm-btn" onClick={() => setShowShortcuts(false)}>Close</button>
             </div>
           </div>
        </div>
      )}
    </div>
  );
}