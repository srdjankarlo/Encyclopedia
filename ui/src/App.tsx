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
import Underline from '@tiptap/extension-underline';
import { invoke } from '@tauri-apps/api/core';
import { Eye } from 'lucide-react';
import { ask } from '@tauri-apps/plugin-dialog';


const CustomEditorShortcuts = Extension.create({
  name: 'customEditorShortcuts',

  addKeyboardShortcuts() {
    return {
      'Tab': () => this.editor.commands.insertContent('\u00A0\u00A0\u00A0\u00A0'),
      'Shift-Alt-ArrowUp': () => {
        const { state, dispatch } = this.editor.view;
        const { selection, tr } = state;
        const { $from, $to } = selection;

        const range = $from.blockRange($to);
        if (!range || range.startIndex === 0) return false;

        const parent = range.parent;
        const nodeBefore = parent.child(range.startIndex - 1);
        const beforeSize = nodeBefore.nodeSize;

        const startPos = range.start;
        const endPos = range.end;
        const beforePos = startPos - beforeSize;

        if (dispatch) {
          const slice = state.doc.slice(startPos, endPos);
          tr.delete(startPos, endPos);
          tr.insert(beforePos, slice.content);
          
          const mappedFrom = tr.doc.resolve($from.pos - beforeSize);
          const mappedTo = tr.doc.resolve($to.pos - beforeSize);
          tr.setSelection(TextSelection.between(mappedFrom, mappedTo));
          
          dispatch(tr.scrollIntoView());
        }
        return true;
      },
      'Shift-Alt-ArrowDown': () => {
        const { state, dispatch } = this.editor.view;
        const { selection, tr } = state;
        const { $from, $to } = selection;

        const range = $from.blockRange($to);
        if (!range) return false;

        const parent = range.parent;
        if (range.endIndex === parent.childCount) return false;

        const nodeAfter = parent.child(range.endIndex);
        const afterSize = nodeAfter.nodeSize;

        const startPos = range.start;
        const endPos = range.end;

        if (dispatch) {
          const slice = state.doc.slice(startPos, endPos);
          tr.delete(startPos, endPos);
          tr.insert(startPos + afterSize, slice.content);

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
  const [windows, setWindows] = useState<Record<string, WindowData>>({ 'root': { id: 'root', tabs: [] } });
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  
  // NEW: Zoom state for CTRL + Scroll
  const [zoomLevel, setZoomLevel] = useState(100);

  const [globalSearch, setGlobalSearch] = useState("");
  const [globalMatches, setGlobalMatches] = useState<Tab[]>([]);
  const [currentGlobalIndex, setCurrentGlobalIndex] = useState(0);
  const [contentSearch, setContentSearch] = useState("");
  const [contentMatches, setContentMatches] = useState<{tabId: string, title: string}[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [globalSortMode, setGlobalSortMode] = useState<SortMode>('oldest');
  // const [isDarkMode, setIsDarkMode] = useState<boolean>(() => localStorage.getItem('theme') === 'dark');
  const [theme, setTheme] = useState<string>(() => localStorage.getItem('theme') || 'light');
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  
  const [listViewWidth, setListViewWidth] = useState(350);
  const [prevListViewWidth, setPrevListViewWidth] = useState(350);
  const [expandedListNodes, setExpandedListNodes] = useState<Set<string>>(new Set());
  
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  
  const isInitialMount = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const windowsRef = useRef(windows);
  useEffect(() => {
    windowsRef.current = windows;
  }, [windows]);

  // NEW: Ctrl + Wheel Zoom Listener for the Editor
  useEffect(() => {
    const handleWheelZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        const target = e.target as HTMLElement;
        if (target.closest('.rich-editor')) {
          e.preventDefault(); // Stop standard browser zoom
          setZoomLevel(prev => {
            const next = prev - Math.sign(e.deltaY) * 10;
            return Math.min(Math.max(next, 50), 300); // Bounds: 50% to 300%
          });
        }
      }
    };
    window.addEventListener('wheel', handleWheelZoom, { passive: false });
    return () => window.removeEventListener('wheel', handleWheelZoom);
  }, []);

  const editor = useEditor({
    extensions: [
      CustomEditorShortcuts,
      StarterKit.configure({ heading: false, bulletList: false, orderedList: false, dropcursor: {} }),
      TextStyle, Color, Highlight.configure({ multicolor: true }),
      TaskList, TaskItem.configure({ nested: true }),
      Heading.configure({ levels: [1, 2, 3] }), BulletList, Underline, OrderedList,
      OrderedList.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            listStyleType: {
              default: 'decimal', parseHTML: element => element.style.listStyleType || 'decimal',
              renderHTML: attributes => ({ style: `list-style-type: ${attributes.listStyleType}` }),
            },
          };
        },
      }),
      Table.configure({ resizable: true, lastColumnResizable: true, allowTableNodeSelection: true}),
      TableRow, TableHeader,
      TableCell.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            backgroundColor: {
              default: null, parseHTML: element => element.getAttribute('data-bg-color'),
              renderHTML: attributes => attributes.backgroundColor ? { 'data-bg-color': attributes.backgroundColor, style: `background-color: ${attributes.backgroundColor}` } : {},
            },
            verticalAlign: {
              default: 'top', parseHTML: element => element.style.verticalAlign || 'top',
              renderHTML: attributes => ({ style: `vertical-align: ${attributes.verticalAlign}` }),
            }
          };
        }
      }),
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
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { class: 'external-link' } }),
      SearchHighlight,
    ],
    editorProps: {
      handleDOMEvents: {
        click: (_view, event) => {
          const target = event.target as HTMLElement;
          const wikiSpan = target.closest('.wiki-link');
          if (wikiSpan) {
            const tabId = wikiSpan.getAttribute('data-tab-id');
            const tabExists = Object.values(windows).some(w => w.tabs.some(t => t.id === tabId));
            if (!tabExists) { wikiSpan.setAttribute('data-broken', 'true'); alert("Link broken."); return true; }
            handleInternalNavigation(tabId!); return true;
          }
          const externalLink = target.closest('a.external-link') as HTMLAnchorElement;
          if (externalLink && externalLink.href) {
            event.preventDefault(); openUrl(externalLink.href).catch(console.error); return true; 
          }
          return false;
        },
        dblclick: (_view, event) => {
          const target = event.target as HTMLElement;
          if (target.classList.contains('column-resize-handle')) {
            const cell = target.closest('td, th') as HTMLElement;
            if (cell) {
              const cellIndex = Array.from(cell.parentElement!.children).indexOf(cell);
              const colgroup = cell.closest('table')?.querySelector('colgroup');
              if (colgroup) colgroup.children[cellIndex]?.removeAttribute('width');
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
    onFocus: () => setIsEditorFocused(true),
    onBlur: () => setIsEditorFocused(false),
  }, [activeTabId]);

  useEffect(() => {
    if (!editor || !activeTabId) return;
    const handleUpdate = () => {
      const html = editor.getHTML();
      const currentTab = Object.values(windowsRef.current).flatMap(w => w.tabs).find(t => t.id === activeTabId);
      if (currentTab && currentTab.content === html) return;
      setWindows(prev => {
        const next = { ...prev };
        for (const winId in next) {
          const tab = next[winId].tabs.find(t => t.id === activeTabId);
          if (tab) { tab.content = html; break; }
        }
        return next;
      });
    };
    editor.on('update', handleUpdate);
    return () => { editor.off('update', handleUpdate); };
  }, [editor, activeTabId]);

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
    // Note: The window.confirm check has been moved to the event listener directly
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
    try { await invoke('delete_tab', { id: tabId }); } catch (e) { console.error(e); }
  };

  // NEW: Calculate both total stats and current cursor position
  const getEditorStats = () => {
    if (!editor) return { stats: { chars: 0, words: 0, lines: 0 }, cursor: { char: 0, word: 0, line: 0 } };
    
    // 1. Replaced editor.getText() with the exact same method used for the cursor, 
    // but spanning the entire document size to represent the true "max"
    const fullText = editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n');
    const stats = { 
      chars: fullText.length, 
      words: fullText.trim() ? fullText.trim().split(/\s+/).length : 0, 
      lines: fullText.split('\n').length 
    };

    // 2. The cursor logic remains exactly the same
    const { from } = editor.state.selection;
    const textBefore = editor.state.doc.textBetween(0, from, '\n');
    const cursor = {
      char: textBefore.length,
      word: textBefore.trim() ? textBefore.trim().split(/\s+/).length : 0,
      line: textBefore.split('\n').length
    };

    return { stats, cursor };
  };

  const getFilteredAndSortedTabs = (tabs: Tab[]) => {
    return [...tabs].sort((a, b) => {
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
    const isSearchActive = globalSearch.trim() !== '';

    sortedChildren.forEach(child => {
      result.push({ ...child, depth });
      if (isSearchActive || expandedListNodes.has(child.id)) {
        result = [...result, ...getFlattenedTabs(allTabs, child.id, depth + 1)];
      }
    });
    return result;
  };

  const activateTab = (tab: Tab) => setActiveTabId(tab.id);

  // Helper: Smoothly scroll the sidebar to a specific tab
  const scrollToTabInSidebar = (tabId: string) => {
    setTimeout(() => {
      const element = document.getElementById(`tab-row-${tabId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);
  };

  const handleInternalNavigation = (tabId: string) => {
    activateTab({ id: tabId } as Tab);
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

  // useEffect(() => {
  //   document.body.classList.toggle('dark-theme', isDarkMode);
  //   localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  // }, [isDarkMode]);
  useEffect(() => {
    document.body.classList.remove('dark-theme', 'gray-theme');
    if (theme !== 'light') document.body.classList.add(`${theme}-theme`);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const loadFromDb = async () => {
      try {
        const dbTabs: any[] = await invoke('get_tabs');
        if (!dbTabs || dbTabs.length === 0) return;

        const newWindows: Record<string, WindowData> = { 'root': { id: 'root', tabs: [] } };
        dbTabs.forEach(t => { if (t.id) newWindows[t.id] = { id: t.id, tabs: [], collapsed: false }; });
        
        dbTabs.forEach(t => {
          const targetWinId = t.parent_id || 'root';
          if (!newWindows[targetWinId]) newWindows[targetWinId] = { id: targetWinId, tabs: [], collapsed: false };
          newWindows[targetWinId].tabs.push({ id: t.id, title: t.title, content: t.content, createdAt: Number(t.created_at), parentId: t.parent_id });
        });
        setWindows(newWindows);
      } catch (e) { console.error("❌ DB Load failed", e); }
    };
    loadFromDb();
  }, []);

  useEffect(() => {
    if (isInitialMount.current) { isInitialMount.current = false; return; }
    setSaveStatus('saving');
    const timer = setTimeout(async () => {
      try {
        const promises = Object.entries(windows).flatMap(([winId, win]) => 
          win.tabs.map(tab => invoke('save_tab', { tab: { id: tab.id, title: tab.title, content: tab.content, parent_id: winId === 'root' ? null : winId, child_window_id: tab.id, created_at: tab.createdAt } }))
        );
        await Promise.all(promises);
        setSaveStatus('saved');
        setLastSaved(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      } catch (e) { setSaveStatus('error'); }
    }, 1000);
    return () => clearTimeout(timer);
  }, [windows]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInsideEditor = target.closest('.rich-editor');
      const isInput = ['INPUT', 'TEXTAREA'].includes(target.tagName);

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        if (isInsideEditor) { (document.activeElement as HTMLElement)?.blur(); document.getElementById(`tab-row-${activeTabId}`)?.focus(); } 
        else if (activeTabId) { if (!isEditorOpen) setIsEditorOpen(true); setTimeout(() => editor?.commands.focus('end'), 50); }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        if (!isInsideEditor && !isInput) {
          e.preventDefault(); 
          if (activeTabId) addTab(activeTabId).then(newId => { if (newId) setActiveTabId(newId); });
          return;
        }
      }

      if (editingTabId || (isInput && !isInsideEditor)) return;

      if (activeTabId && !isInsideEditor) {
        if (e.key === 'F2') { e.preventDefault(); setEditingTabId(activeTabId); return; }
        
        // NEW FIX: Only proceed if they hit 'OK' on the browser dialog.
        if (e.key === 'Delete') {
          e.preventDefault();
          const winId = Object.keys(windows).find(id => windows[id].tabs.some(t => t.id === activeTabId));
          if (winId) {
            const targetTabId = activeTabId; // Capture ID safely before async call
            // Find the tab object to get its title, fallback to 'this item' just in case
            const currentTab = windows[winId].tabs.find(t => t.id === targetTabId);
            const targetTabName = currentTab ? currentTab.title : 'this item';
            
            // Native Tauri Dialog (Asynchronous)
            ask(`Delete this item ${targetTabName} and all sub-items?`, { 
              title: 'Confirm Deletion', 
              kind: 'warning' 
            }).then((confirmed) => {
              if (confirmed) {
                deleteTab(winId, targetTabId);
              }
            });
          }
          return;
        }
        
        if (e.key === 'Enter') { e.preventDefault(); setIsEditorOpen(prev => !prev); return; }
      }

      const isArrow = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key);
      if (isArrow && !isInsideEditor) {
        e.preventDefault();
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
        const getVisible = (parentId: string | null) => getFilteredAndSortedTabs(allTabs.filter(t => t.parentId === parentId)).filter(t => searchLower === '' || t.title.toLowerCase().includes(searchLower));

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
          if (hasChildren && !isExpanded) setExpandedListNodes(prev => new Set(prev).add(activeTab.id));
          else if (hasChildren && isExpanded) {
            const children = getVisible(activeTab.id);
            if (children.length > 0) nextTab = children[0];
          }
        }
        else if (e.key === 'ArrowLeft') {
          if (hasChildren && isExpanded) setExpandedListNodes(prev => { const next = new Set(prev); next.delete(activeTab.id); return next; });
          else if (activeTab.parentId) nextTab = allTabs.find(t => t.id === activeTab.parentId);
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

  useEffect(() => {
    if (editor) editor.commands.setSearchTerm(contentSearch);
  }, [contentSearch, activeTabId, editor]);

  const expandToTab = (tabId: string) => {
    const path: string[] = [];
    let currentId: string | null = tabId;
    const allTabs = Object.values(windows).flatMap(w => w.tabs);
    
    while (currentId) {
      const tab = allTabs.find(t => t.id === currentId);
      if (tab && tab.parentId) { path.push(tab.parentId); currentId = tab.parentId; } 
      else break;
    }
    if (path.length > 0) setExpandedListNodes(prev => new Set([...prev, ...path]));
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setGlobalSearch(query);
    if (query.trim() === '') { setGlobalMatches([]); return; }

    const searchLower = query.toLowerCase();
    const matches = Object.values(windows).flatMap(w => w.tabs).filter(t => t.title.toLowerCase().includes(searchLower));
    
    setGlobalMatches(matches);
    setCurrentGlobalIndex(0);

    if (matches.length > 0) {
      activateTab(matches[0]);
      expandToTab(matches[0].id);
      scrollToTabInSidebar(matches[0].id);
    }
  };

  const cycleGlobalMatch = (direction: 1 | -1) => {
    if (globalMatches.length === 0) return;
    let newIndex = currentGlobalIndex + direction;
    if (newIndex < 0) newIndex = globalMatches.length - 1;
    if (newIndex >= globalMatches.length) newIndex = 0;
    
    setCurrentGlobalIndex(newIndex);
    activateTab(globalMatches[newIndex]);
    expandToTab(globalMatches[newIndex].id);
    scrollToTabInSidebar(globalMatches[newIndex].id);
  };

  const handleContentSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value.toLowerCase();
    setContentSearch(query);
    if (!query.trim()) { setContentMatches([]); return; }

    const matches: {tabId: string, title: string}[] = [];
    Object.values(windows).forEach(w => w.tabs.forEach(t => {
      if (t.content.replace(/<[^>]*>?/gm, '').toLowerCase().includes(query)) matches.push({ tabId: t.id, title: t.title });
    }));

    setContentMatches(matches);
    setCurrentMatchIndex(0);

    if (matches.length > 0) {
      activateTab({ id: matches[0].tabId } as Tab);
      expandToTab(matches[0].tabId);
    }
  };

  const cycleMatch = (direction: 1 | -1) => {
    if (contentMatches.length === 0) return;
    let newIndex = currentMatchIndex + direction;
    if (newIndex < 0) newIndex = contentMatches.length - 1;
    if (newIndex >= contentMatches.length) newIndex = 0;
    
    setCurrentMatchIndex(newIndex);
    activateTab({ id: contentMatches[newIndex].tabId } as Tab);
    expandToTab(contentMatches[newIndex].tabId);

    // NEW: Scroll the editor content directly to the highlighted text
    setTimeout(() => {
      // The editor needs a moment to load the new content and apply the yellow decorations
      setTimeout(() => {
        const matchElements = document.querySelectorAll('.content-search-match');
        if (matchElements.length > 0) {
          matchElements[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 150);
    }, 50);
  };

  const { stats, cursor } = getEditorStats();

  const handleSidebarDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (listViewWidth <= 20) {
      // If it's minimized, restore it
      setListViewWidth(prevListViewWidth > 20 ? prevListViewWidth : 350);
    } else {
      // If it's open, save current width and minimize to 5px
      setPrevListViewWidth(listViewWidth);
      setListViewWidth(5);
    }
  };

  return (
    // <div className={`app-wrapper ${isDarkMode ? 'dark-theme' : ''}`}>
    <div className={`app-wrapper ${theme !== 'light' ? `${theme}-theme` : ''}`}>
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
              {/* <button onClick={() => setIsDarkMode(!isDarkMode)}>{isDarkMode ? 'Light Mode' : 'Dark Mode'}</button> */}
              <button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>Light Theme</button>
              <button className={theme === 'gray' ? 'active' : ''} onClick={() => setTheme('gray')}>Gray Theme</button>
              <button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>Dark Theme</button>
              <button onClick={() => {
                const allTabs = Object.values(windows).flatMap(w => w.tabs);
                if (expandedListNodes.size > 0) setExpandedListNodes(new Set());
                else setExpandedListNodes(new Set(allTabs.map(t => t.id)));
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
        
        <div className="menubar-search">
          <div className="content-search-wrapper">
            <input placeholder="Search tabs by title..." value={globalSearch} onChange={handleSearch} onKeyDown={(e) => { if (e.key === 'Enter') cycleGlobalMatch(1); }} />
            {globalMatches.length > 0 && (
              <div className="search-nav">
                <button onClick={() => cycleGlobalMatch(-1)}>▲</button>
                <span>{currentGlobalIndex + 1}/{globalMatches.length}</span>
                <button onClick={() => cycleGlobalMatch(1)}>▼</button>
              </div>
            )}
          </div>
          <div className="content-search-wrapper">
            <input placeholder="Search content..." value={contentSearch} onChange={handleContentSearch} onKeyDown={(e) => { if (e.key === 'Enter') cycleMatch(1); }} />
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

      {/* <div className={`app-container ${isDarkMode ? 'dark-theme' : ''}`}> */}
      <div className={`app-container ${theme !== 'light' ? `${theme}-theme` : ''}`}>
        <div className="miller-columns">
          <ResizableBox 
            width={listViewWidth} 
            height={Infinity} 
            axis="x" 
            onResize={(_e, { size }) => setListViewWidth(size.width)}
            onResizeStart={() => {
              // Remember the width if the user manually drags it
              if (listViewWidth > 20) setPrevListViewWidth(listViewWidth);
            }}
            minConstraints={[5, Infinity]} /* Changed from 250 to 5 so it can minimize */
            maxConstraints={[600, Infinity]} 
            handle={<div className="drag-handle" onDoubleClick={handleSidebarDoubleClick} />} 
          >
            <div className="column" style={{ width: '100%' }}>
              <div className="column-header" style={{ borderBottom: 'none' }}><span className="header-title">LIBRARY</span></div>
              <div className="tab-list tree-view">
                <div className="root-footer">
                  <button tabIndex={-1} className="add-btn" onClick={async () => { const newId = await addTab('root'); if (newId) setActiveTabId(newId); }}> + Add New Root Item</button>
                </div>
                {getFlattenedTabs(Object.values(windows).flatMap(w => w.tabs)).map(tab => {
                    const isSearchMatch = globalSearch.trim() !== '' && tab.title.toLowerCase().includes(globalSearch.toLowerCase());
                    const allTabs = Object.values(windows).flatMap(w => w.tabs);
                    const hasChildren = allTabs.some(t => t.parentId === tab.id);
                    const isActiveTab = tab.id === activeTabId;
                    const showEye = isActiveTab && isEditorFocused

                    return (
                      <div key={tab.id}>
                        <div 
                          id={`tab-row-${tab.id}`} tabIndex={-1}
                          className={`tab-row ${activeTabId === tab.id ? 'active' : ''} ${isSearchMatch ? 'search-highlight' : ''}`}
                          onClick={() => activateTab(tab)}
                          style={{ paddingLeft: `${(tab as any).depth * 20 + 12}px` }}
                        >
                          <span className="tree-indicator" style={{ cursor: hasChildren ? 'pointer' : 'default' }} onClick={(e) => {
                              if (hasChildren) {
                                e.stopPropagation();
                                setExpandedListNodes(prev => { const next = new Set(prev); if (next.has(tab.id)) next.delete(tab.id); else next.add(tab.id); return next; });
                              }
                            }}
                          >
                            {hasChildren ? (expandedListNodes.has(tab.id) ? '▼' : '▶') : '•'}
                          </span>
                          {editingTabId === tab.id ? (
                            <input autoFocus value={tab.title} onBlur={() => setEditingTabId(null)} onKeyDown={(e) => { if (e.key === 'Enter') setEditingTabId(null); }} onChange={(e) => {
                                const next = { ...windows };
                                Object.keys(next).forEach(winId => { const t = next[winId].tabs.find(i => i.id === tab.id); if (t) t.title = e.target.value; });
                                setWindows(next);
                              }}
                            />
                          ) : ( <span className="tab-title">{tab.title}</span> )}
                          {showEye && ( <Eye size={14} className={`tab-eye-icon ${isActiveTab ? 'active-eye' : ''} ${isSearchMatch ? 'search-eye' : ''}`} /> )}
                        </div>
                        {activeTabId === tab.id && (
                          <div className="tab-list-actions" style={{ paddingLeft: `${((tab as any).depth + 1) * 20 + 24}px` }}>
                            <button tabIndex={-1} className="add-btn" onClick={async () => { const newId = await addTab(tab.id); if (newId) setActiveTabId(newId); }}>+ Add Child</button>
                          </div>
                        )}
                      </div>
                    )
                  })
                }
              </div>
            </div>
          </ResizableBox>

          <div className="writing-space">
            {activeTabId && isEditorOpen && editor ? (
              <div className="editor-wrapper">
                <EditorToolbar editor={editor} windows={windows} saveStatus={saveStatus} lastSaved={lastSaved} handleManualRetry={() => setWindows(p => ({...p}))} />
                {/* NEW: Apply the zoom level directly to the editor content */}
                <EditorContent editor={editor} className="rich-editor" style={{ zoom: `${zoomLevel}%` }} />
                
                {/* NEW: Updated Footer with Cursor Stats */}
                <div className="editor-footer">
                  <div className="stat">Length: <span>{stats.chars}</span> <span style={{opacity:0.6, fontWeight:'normal'}}>(Pos: {cursor.char})</span></div>
                  <div className="stat">Words: <span>{stats.words}</span> <span style={{opacity:0.6, fontWeight:'normal'}}>(Pos: {cursor.word})</span></div>
                  <div className="stat">Lines: <span>{stats.lines}</span> <span style={{opacity:0.6, fontWeight:'normal'}}>(Pos: {cursor.line})</span></div>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                {activeTabId ? <span>Editor hidden. Press <strong>ENTER</strong> to open.</span> : "Select an item to view/edit content."}
              </div>
            )}
          </div>
        </div>
      </div>

      {isExportModalOpen && <ExportModal windows={windows} onClose={() => setIsExportModalOpen(false)} />}
      
      {showShortcuts && (
        <div className="modal-overlay" onClick={() => setShowShortcuts(false)}>
           <div className="export-modal" onClick={e => e.stopPropagation()}>
             <h3 style={{color: 'var(--accent-color)', margin: '0 0 15px 0'}}>Keyboard Shortcuts</h3>
             <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', fontSize: '13px', color: 'var(--text-main)'}}>
                <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                  <span><strong>Encyclopedia control shortcuts</strong></span>
                  <span><strong>ARROWS:</strong> Navigate tabs</span>
                  <span><strong>ENTER:</strong> Open/Activate tab</span>
                  <span><strong>CTRL+E:</strong> Focus/Unfocus Editor</span>
                  <span><strong>CTRL+A:</strong> Add Child Tab</span>
                  <span><strong>F2:</strong> Rename Tab</span>
                  <span><strong>DEL:</strong> Delete Tab</span>
                  <span><strong>Double click vertical border:</strong> Minimize/Expand library</span>
                </div>
                <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                  <span><strong>Editor control shortcuts</strong></span>
                  <span><strong>CTRL+F:</strong> Find tabs/content</span>
                  <span><strong>CTRL+Scroll:</strong> Zoom In/Out Editor</span>
                  <span><strong>SHIFT+ALT+Up/Down:</strong> Move text line</span>
                  <span><strong>CTRL+B:</strong> Bold text</span>
                  <span><strong>CTRL+I:</strong> Italic text</span>
                  <span><strong>CTRL+U:</strong> Underline text</span>
                  <span><strong>CTRL+C/V:</strong> Copy/Paste content</span>
                  <span><strong>CTRL+Z/Y:</strong> Undo/Redo action</span>
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