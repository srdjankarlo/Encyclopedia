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

const API_URL = "http://localhost:8080";

const CustomEditorShortcuts = Extension.create({
  name: 'customEditorShortcuts',

  addKeyboardShortcuts() {
    return {
      // 1. Tab inserts an indent and prevents jumping through checkboxes/focus
      'Tab': () => {
        return this.editor.commands.insertContent('\t');
      },
      
      // 3. Move line/block up
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

      // 3. Move line/block down
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
  const [activePath, setActivePath] = useState<string[]>(['root']);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  
  // NEW: Editor visibility state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  
  // --- UI STATE ---
  const [globalSearch, setGlobalSearch] = useState("");
  const [globalSortMode, setGlobalSortMode] = useState<SortMode>('oldest');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => localStorage.getItem('theme') === 'dark');
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isMillerMode, setIsMillerMode] = useState(true);
  
  // NEW: List view specific width state so it remembers stretching
  const [listViewWidth, setListViewWidth] = useState(350);
  
  // --- SYNC STATE ---
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  
  const isInitialMount = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      CustomEditorShortcuts,
      StarterKit.configure({ heading: false, bulletList: false, orderedList: false, dropcursor: {} }),
      TaskList, TaskItem.configure({ nested: true }),
      Heading.configure({ levels: [1, 2, 3] }), BulletList, OrderedList,
      Table.configure({ resizable: true, lastColumnResizable: true, allowTableNodeSelection: true}), TableRow, TableHeader, TableCell,
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
      WikiLink, Link.configure({ openOnClick: false, autolink: false, HTMLAttributes: { class: 'wiki-link', target: null, rel: null } }),
    ],
    content: '',
    editorProps: {
      handleDOMEvents: {
        click: (_view, event) => {
          const target = event.target as HTMLElement;
          const wikiSpan = target.closest('.wiki-link');
          if (wikiSpan) {
            const tabId = wikiSpan.getAttribute('data-tab-id');
            const tabExists = Object.values(windows).some(w => w.tabs.some(t => t.id === tabId));
            if (!tabExists) {
              wikiSpan.setAttribute('data-broken', 'true'); alert("This tab has been deleted and the link is broken."); return true;
            }
            handleInternalNavigation(tabId!); return true;
          }
          return false;
        },
      },
    },
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
  });

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
    setActivePath(prev => prev.filter(id => id === 'root' || next[id]));
    if (activeTabId && idsToRemove.has(activeTabId)) setActiveTabId(null);
    try { await fetch(`${API_URL}/tabs/${tabId}`, { method: 'DELETE' }); } catch (e) { console.error(e); }
  };

  const handleTabClick = (_windowId: string, tab: Tab, index: number) => {
    setActiveTabId(tab.id);
    if (activePath[index + 1] === tab.id) {
      setActivePath(activePath.slice(0, index + 1));
      if (activeTabId === tab.id) setActiveTabId(null);
    } else {
      if (!windows[tab.id]) setWindows(prev => ({ ...prev, [tab.id]: { id: tab.id, tabs: [], collapsed: false } }));
      setActivePath([...activePath.slice(0, index + 1), tab.id]);
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedData: any[] = JSON.parse(event.target?.result as string);
        const newWindows: Record<string, WindowData> = { 'root': { id: 'root', tabs: [] } };
        const idMap: Record<string, string> = {}; 
        importedData.forEach(item => { idMap[item.title] = `tab-${Math.random().toString(36).substring(2, 11)}`; });

        [...importedData].sort((a, b) => (a.depth || 0) - (b.depth || 0)).forEach(item => {
          const newId = idMap[item.title];
          const targetWinId = (item.fromParent !== "Root" && idMap[item.fromParent]) ? idMap[item.fromParent] : 'root';
          if (!newWindows[targetWinId]) newWindows[targetWinId] = { id: targetWinId, tabs: [], collapsed: false };
          newWindows[targetWinId].tabs.push({ id: newId, title: item.title, content: item.content, createdAt: item.createdAt || Date.now() });
          if (!newWindows[newId]) newWindows[newId] = { id: newId, tabs: [], collapsed: false };
        });
        setWindows(newWindows);
      } catch (err) { alert("Import failed: Ensure you are using a valid JSON export file."); }
    };
    reader.readAsText(file);
  };

  const getEditorStats = () => {
    if (!editor) return { chars: 0, words: 0, lines: 0 };
    const text = editor.getText();
    return { chars: text.length, words: text.trim() ? text.trim().split(/\s+/).length : 0, lines: text.split(/\r\n|\r|\n/).length };
  };

  const activeBranchIds = activePath.map(winId => {
    for (const pid in windows) {
      const parentTab = windows[pid].tabs.find(t => t.id === winId); 
      if (parentTab) return parentTab.id;
    }
    return null;
  }).filter(Boolean);

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
    sortedChildren.forEach(child => {
      result.push({ ...child, depth });
      const grandchildren = getFlattenedTabs(allTabs, child.id, depth + 1);
      result = [...result, ...grandchildren];
    });
    return result;
  };

  const activateTab = (tab: Tab) => {
    setActiveTabId(tab.id);
    const newPath = ['root'];
    let current: any = tab;
    const pathTrace = [];
    while (current && current.parentId) {
      pathTrace.unshift(current.parentId);
      const parentTab = Object.values(windows).flatMap(w => w.tabs).find(t => t.id === current.parentId);
      current = parentTab as Tab;
    }
    if (!windows[tab.id]) {
      setWindows(prev => ({ ...prev, [tab.id]: { id: tab.id, tabs: [], collapsed: false } }));
    }
    setActivePath([...newPath, ...pathTrace, tab.id]);
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
        let nextTab: Tab | undefined;

        if (!isMillerMode) {
          const flat = getFlattenedTabs(allTabs).filter(t => t.title.toLowerCase().includes(globalSearch.toLowerCase()));
          const idx = flat.findIndex(t => t.id === activeTabId);
          if (e.key === 'ArrowDown' && idx >= 0 && idx < flat.length - 1) nextTab = flat[idx + 1];
          if (e.key === 'ArrowUp' && idx > 0) nextTab = flat[idx - 1];
        } else {
          const currentWinId = Object.keys(windows).find(id => windows[id].tabs.some(t => t.id === activeTabId)) || 'root';
          const currentTabs = getFilteredAndSortedTabs(windows[currentWinId]?.tabs || []);
          const idx = currentTabs.findIndex(t => t.id === activeTabId);

          if (e.key === 'ArrowDown' && idx >= 0 && idx < currentTabs.length - 1) nextTab = currentTabs[idx + 1];
          if (e.key === 'ArrowUp' && idx > 0) nextTab = currentTabs[idx - 1];
          if (e.key === 'ArrowRight') {
            const childWin = windows[activeTabId];
            if (childWin?.tabs.length > 0) nextTab = getFilteredAndSortedTabs(childWin.tabs)[0];
          }
          if (e.key === 'ArrowLeft' && currentWinId !== 'root') {
            nextTab = allTabs.find(t => t.id === currentWinId);
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
  }, [activeTabId, isEditorOpen, windows, isMillerMode, editingTabId, editor, globalSearch, globalSortMode]);

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

  return (
    <div className={`app-container ${isDarkMode ? 'dark-theme' : ''}`}>
      <div className="miller-columns">
        {isMillerMode ? (
          /* --- MODE 1: MILLER COLUMNS --- */
          activePath.map((winId, index) => {
            const win = windows[winId];
            if (!win) return null;
            let windowName = 'LIBRARY';
            if (winId !== 'root') {
              const parentTab = Object.values(windows).flatMap(w => w.tabs).find(t => t.id === winId);
              windowName = parentTab ? parentTab.title.toUpperCase() : 'SUB-LEVEL';
            }
            
            const isCollapsed = win.collapsed;
            const currentWidth = isCollapsed ? 40 : (win.width || 280);
            const displayTabs = getFilteredAndSortedTabs(win.tabs);

            return (
              <ResizableBox 
                key={winId} 
                width={currentWidth} height={Infinity} axis="x" 
                minConstraints={[isCollapsed ? 40 : 150, Infinity]} maxConstraints={[600, Infinity]}
                onResize={(_e, { size }) => setWindows(p => ({ ...p, [winId]: { ...p[winId], width: size.width, collapsed: size.width <= 60 } }))}
                handle={<div className="drag-handle" onDoubleClick={() => setWindows(p => ({ ...p, [winId]: { ...p[winId], collapsed: !isCollapsed, width: isCollapsed ? 280 : 40 } }))} />}
              >
                <div className={`column ${isCollapsed ? 'collapsed' : ''}`} style={{ width: '100%' }}>
                  <div className="column-header">
                    <span className="header-title">{windowName}</span>
                    {!isCollapsed && winId === 'root' && (
                      <div className="header-controls">
                        <div className="control-section">
                          <div className="controls-dashboard">
                            <div className="dash-column">
                              <span><strong>TAB:</strong> List header controls</span>
                              <span><strong>SPACE:</strong> Select control</span>
                            </div>
                          </div>
                          <span className="section-label">GLOBAL SORTING</span>
                          <div className="button-row">
                            <button className={globalSortMode === 'oldest' ? 'active' : ''} onClick={() => setGlobalSortMode('oldest')}>OLDEST</button>
                            <button className={globalSortMode === 'newest' ? 'active' : ''} onClick={() => setGlobalSortMode('newest')}>NEWEST</button>
                            <button className={globalSortMode === 'alpha' ? 'active' : ''} onClick={() => setGlobalSortMode('alpha')}>A-Z</button>
                            <button className={globalSortMode === 'alpha-desc' ? 'active' : ''} onClick={() => setGlobalSortMode('alpha-desc')}>Z-A</button>
                          </div>
                        </div>
                        <div className="control-section">
                          <span className="section-label">SYSTEM</span>
                          <div className="button-row">
                            <button className="export-btn" disabled={win.tabs.length === 0} onClick={() => setIsExportModalOpen(true)}>EXPORT</button>
                            <button className="import-btn" onClick={() => fileInputRef.current?.click()}>IMPORT</button>
                            <button className="theme-toggle-btn" onClick={() => setIsDarkMode(!isDarkMode)}>{isDarkMode ? '🌙 DARK' : '☀️ LIGHT'}</button>
                            <button className="toggle-mode-btn active" onClick={() => setIsMillerMode(false)}>VIEW: Miller columns</button>
                            <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".json" onChange={handleImport} />
                            <button className="toggle-all-btn" onClick={() => setWindows(p => { 
                              const any = Object.entries(p).some(([id, w]) => id !== 'root' && !w.collapsed); 
                              const next = {...p}; 
                              Object.keys(next).forEach(id => { if (id !== 'root') next[id] = {...next[id], collapsed: any}; }); 
                              return next; 
                            })}>
                              {Object.values(windows).some(w => w.id !== 'root' && !w.collapsed) ? 'COLLAPSE ALL' : 'EXPAND ALL'}
                            </button>
                          </div>
                        </div>
                        <div className="controls-dashboard">
                          <div className="dash-column">
                            <span><strong>F2:</strong> Rename Tab</span>
                            <span><strong>DEL:</strong> Delete Tab</span>
                            <span><strong>CTRL+A:</strong> Add Child Tab</span>
                            <span><strong>CTRL+E:</strong> Focus/Unfocus Editor</span>
                          </div>
                          <div className="dash-column">
                            <span><strong>ARROWS:</strong> Navigate tabs</span>
                            <span><strong>ENTER:</strong> Open/Activate tab</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  {!isCollapsed && (
                    <>
                      {winId === 'root' && (
                        <div className="search-bar">
                          <input placeholder="Search tabs..." value={globalSearch} onChange={handleSearch} />
                        </div>
                      )}
                      <div className="tab-list">
                        {displayTabs.map(tab => {
                          const isSearchMatch = globalSearch.trim() !== '' && tab.title.toLowerCase().includes(globalSearch.toLowerCase());
                          return (
                            <div 
                              key={tab.id} id={`tab-row-${tab.id}`} tabIndex={-1}
                              className={`tab-row ${activeTabId === tab.id ? 'active' : ''} ${activeBranchIds.includes(tab.id) ? 'branch-active' : ''} ${isSearchMatch ? 'search-highlight' : ''}`} 
                              onClick={() => handleTabClick(winId, tab, index)}
                            >
                              {editingTabId === tab.id ? (
                                <input 
                                  autoFocus value={tab.title} 
                                  onBlur={() => setEditingTabId(null)} 
                                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setEditingTabId(null); } }} 
                                  onChange={(e) => { 
                                    const next = { ...windows }; 
                                    const t = next[winId].tabs.find(i => i.id === tab.id); 
                                    if (t) t.title = e.target.value; 
                                    setWindows(next); 
                                  }} 
                                />
                              ) : ( <span className="tab-title">{tab.title}</span> )}
                              <div className="tab-actions">
                                {/* Removed tabIndex for actions so they are skipped by TAB */}
                                <button tabIndex={-1} className="edit-btn" onClick={(e) => { e.stopPropagation(); setEditingTabId(tab.id); }}>✎</button>
                                <button tabIndex={-1} className="del-btn" onClick={(e) => { e.stopPropagation(); deleteTab(winId, tab.id); }}>✕</button>
                              </div>
                            </div>
                          )
                        })}
                        <button tabIndex={-1} className="add-btn" onClick={() => addTab(winId)}>+ Add Item</button>
                      </div>
                    </>
                  )}
                </div>
              </ResizableBox>
            );
          })
        ) : (
          /* --- MODE 2: LIST VIEW --- */
          /* FIX 1: Use state for width so List View remembers resizing */
          <ResizableBox 
            width={listViewWidth} height={Infinity} axis="x" 
            onResize={(_e, { size }) => setListViewWidth(size.width)}
            minConstraints={[250, Infinity]} maxConstraints={[600, Infinity]}
            handle={<div className="drag-handle" />}
          >
            <div className="column" style={{ width: '100%' }}>
              <div className="column-header">
                <span className="header-title">LIBRARY</span>
                <div className="header-controls">
                  <div className="control-section">
                    <div className="controls-dashboard">
                      <div className="dash-column">
                        <span><strong>TAB:</strong> List header controls</span>
                        <span><strong>SPACE:</strong> Select control</span>
                      </div>
                    </div>
                    <span className="section-label">GLOBAL SORTING</span>
                    <div className="button-row">
                      <button className={globalSortMode === 'oldest' ? 'active' : ''} onClick={() => setGlobalSortMode('oldest')}>OLDEST</button>
                      <button className={globalSortMode === 'newest' ? 'active' : ''} onClick={() => setGlobalSortMode('newest')}>NEWEST</button>
                      <button className={globalSortMode === 'alpha' ? 'active' : ''} onClick={() => setGlobalSortMode('alpha')}>A-Z</button>
                      <button className={globalSortMode === 'alpha-desc' ? 'active' : ''} onClick={() => setGlobalSortMode('alpha-desc')}>Z-A</button>
                    </div>
                  </div>
                  <div className="control-section">
                    <span className="section-label">SYSTEM</span>
                    <div className="button-row">
                      <button className="export-btn" onClick={() => setIsExportModalOpen(true)}>EXPORT</button>
                      <button className="import-btn" onClick={() => fileInputRef.current?.click()}>IMPORT</button>
                      <button className="theme-toggle-btn" onClick={() => setIsDarkMode(!isDarkMode)}>{isDarkMode ? '🌙 DARK' : '☀️ LIGHT'}</button>
                      <button className="toggle-mode-btn active" onClick={() => setIsMillerMode(true)}>VIEW: List</button>
                    </div>
                  </div>
                  <div className="controls-dashboard">
                    <div className="dash-column">
                      <span><strong>F2:</strong> Rename Tab</span>
                      <span><strong>DEL:</strong> Delete Tab</span>
                      <span><strong>CTRL+A:</strong> Add Child Tab</span>
                      <span><strong>CTRL+E:</strong> Focus/Unfocus Editor</span>
                    </div>
                    <div className="dash-column">
                      <span><strong>ARROWS:</strong> Navigate tabs</span>
                      <span><strong>ENTER:</strong> Open/Activate tab</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="search-bar">
                <input placeholder="Search tabs..." value={globalSearch} onChange={handleSearch} />
              </div>

              <div className="tab-list tree-view">
                {getFlattenedTabs(Object.values(windows).flatMap(w => w.tabs))
                  .map(tab => {
                    const isSearchMatch = globalSearch.trim() !== '' && tab.title.toLowerCase().includes(globalSearch.toLowerCase());
                    return (
                      <div key={tab.id}>
                        <div 
                          id={`tab-row-${tab.id}`} tabIndex={-1}
                          className={`tab-row ${activeTabId === tab.id ? 'active' : ''} ${isSearchMatch ? 'search-highlight' : ''}`}
                          onClick={() => activateTab(tab)}
                          style={{ paddingLeft: `${(tab as any).depth * 20 + 12}px` }}
                        >
                          <span className="tree-indicator">{(tab as any).depth > 0 ? '↳' : '•'}</span>
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
                                  setActivePath(prev => [...prev, newId]);
                                }
                              }}>+ Add Child
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })
                }
                <div className="root-footer">
                  <button tabIndex={-1} className="add-btn" onClick={async () => {
                      const newId = await addTab('root');
                      if (newId) setActiveTabId(newId);
                    }}> + Add New Root Item
                  </button>
                </div>
              </div>
            </div>
          </ResizableBox>
        )}

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

      {isExportModalOpen && <ExportModal windows={windows} onClose={() => setIsExportModalOpen(false)} />}
    </div>
  );
}