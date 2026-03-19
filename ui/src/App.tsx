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

const API_URL = "http://localhost:8080";

export default function App() {
  // --- CORE STATE ---
  const [windows, setWindows] = useState<Record<string, WindowData>>({ 'root': { id: 'root', tabs: [] } });
  const [activePath, setActivePath] = useState<string[]>(['root']);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  
  // --- UI STATE ---
  const [globalSearch, setGlobalSearch] = useState("");
  const [globalSortMode, setGlobalSortMode] = useState<SortMode>('oldest');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => localStorage.getItem('theme') === 'dark');
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  
  // --- SYNC STATE ---
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  
  const isInitialMount = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- 1. THEME EFFECT ---
  useEffect(() => {
    document.body.classList.toggle('dark-theme', isDarkMode);
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  // --- 2. DB LOAD EFFECT ---
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

  // --- 3. AUTO-SAVE EFFECT ---
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

  // const collapseAllWindows = () => {
  //   setWindows(prev => {
  //     const next = { ...prev };
  //     Object.keys(next).forEach(id => {
  //       // We usually keep the root open, but collapse everything else
  //       if (id !== 'root') {
  //         next[id] = { ...next[id], collapsed: true };
  //       }
  //     });
  //     return next;
  //   });
  // };

  // --- EDITOR SETUP ---
  const handleInternalNavigation = (tabId: string) => {
    const getParentOfTab = (targetId: string): string | null => {
      for (const winId in windows) {
        if (windows[winId].tabs.some(t => t.id === targetId)) return winId;
      }
      return null;
    };

    const pathSteps: string[] = [];
    let currentId: string | null = tabId;
    while (currentId && currentId !== 'root') {
      const parentId = getParentOfTab(currentId);
      if (parentId) { pathSteps.unshift(parentId); currentId = parentId; } 
      else { currentId = null; }
    }

    setActivePath(pathSteps.length > 0 ? pathSteps : ['root']);
    setActiveTabId(tabId);

    setTimeout(() => {
      const element = document.getElementById(`tab-${tabId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', inline: 'center' });
        element.classList.add('teleport-flash');
        setTimeout(() => element.classList.remove('teleport-flash'), 1500);
      }
    }, 200);
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, bulletList: false, orderedList: false, dropcursor: {} }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Heading.configure({ levels: [1, 2, 3] }), BulletList, OrderedList,
      Table.configure({ resizable: true, lastColumnResizable: true, allowTableNodeSelection: true}), TableRow, TableHeader, TableCell,
      // Use 'as any' to bypass the property errors while keeping the logic intact
      (ImageResize as any).configure({
        inline: false,
        allowBase64: true, // Most resize extensions pass this to the base image logic
        HTMLAttributes: {
          class: 'resizable-image',
        },
        addAttributes() {
          return {
            src: {},
            alt: { default: null },
            title: { default: null },
            width: {
              default: 'auto',
              renderHTML: (attributes: any) => ({
                width: attributes.width,
              }),
              parseHTML: (element: HTMLElement) => element.getAttribute('width') || 'auto',
            },
            height: {
              default: 'auto',
              renderHTML: (attributes: any) => ({
                height: attributes.height,
              }),
              parseHTML: (element: HTMLElement) => element.getAttribute('height') || 'auto',
            },
          };
        },
      }),
      WikiLink,
      Link.configure({ 
        openOnClick: false, autolink: false, 
        HTMLAttributes: { class: 'wiki-link', target: null, rel: null }
      }),
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
              wikiSpan.setAttribute('data-broken', 'true');
              alert("This tab has been deleted and the link is broken.");
              return true;
            }
            handleInternalNavigation(tabId!);
            return true;
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

  // Keep editor state synced with React state
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const updateHandler = () => setTick(t => t + 1);
    editor.on('selectionUpdate', updateHandler);
    editor.on('transaction', updateHandler);
    return () => { editor.off('selectionUpdate', updateHandler); editor.off('transaction', updateHandler); };
  }, [editor]);

  // Sync content when active tab changes
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

  // Broken Link scanner
  useEffect(() => {
    const scanLinks = () => {
      const existingIds = new Set(Object.values(windows).flatMap(w => w.tabs.map(t => t.id)));
      document.querySelectorAll('.wiki-link').forEach(link => {
        const id = link.getAttribute('data-tab-id');
        if (id && !existingIds.has(id)) {
          link.classList.add('is-broken'); link.setAttribute('data-broken', 'true');
        } else {
          link.classList.remove('is-broken'); link.removeAttribute('data-broken');
        }
      });
    };
    scanLinks();
    const timeout = setTimeout(scanLinks, 100);
    return () => clearTimeout(timeout);
  }, [windows, activeTabId, editor?.getHTML()]);

  // --- ACTIONS ---
  const addTab = (windowId: string) => {
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
      [windowId]: { ...prev[windowId], tabs: [...prev[windowId].tabs, { id: newId, title: newTitle, content: '', createdAt: Date.now() }] },
      [newId]: { id: newId, tabs: [], collapsed: false }
    }));
  };

  const deleteTab = async (windowId: string, tabId: string) => {
    if (!window.confirm("Delete this item and all sub-items?")) return;
    const next = { ...windows };
    const idsToRemove = new Set<string>();

    const collectAndKill = (id: string) => {
      idsToRemove.add(id);
      if (next[id]) {
        next[id].tabs.forEach(child => collectAndKill(child.id));
        delete next[id];
      }
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
      const parentTab = windows[pid].tabs.find(t => t.id === winId); // Fixed property to match parent/child relationship
      if (parentTab) return parentTab.id;
    }
    return null;
  }).filter(Boolean);

  return (
    <div className={`app-container ${isDarkMode ? 'dark-theme' : ''}`}>
      <div className="miller-columns">
        {activePath.map((winId, index) => {
          const win = windows[winId];
          if (!win) return null;
          let windowName = 'LIBRARY';
          if (winId !== 'root') {
            // We look through all windows to find the tab whose ID matches this window's ID
            const parentTab = Object.values(windows)
              .flatMap(w => w.tabs)
              .find(t => t.id === winId);
            
            windowName = parentTab ? parentTab.title.toUpperCase() : 'SUB-LEVEL';
          }
          
          const isCollapsed = win.collapsed;
          // const query = searchQueries[winId]?.toLowerCase() || "";
          
          // Use the width from state, or default to 280 (or 40 if collapsed)
          const currentWidth = isCollapsed ? 40 : (win.width || 280);

          const displayTabs = [...win.tabs].filter(t => t.title.toLowerCase().includes(globalSearch.toLowerCase())).sort((a, b) => {
            if (globalSortMode === 'alpha') return a.title.localeCompare(b.title, undefined, { numeric: true });
            if (globalSortMode === 'alpha-desc') return b.title.localeCompare(a.title, undefined, { numeric: true });
            if (globalSortMode === 'newest') return b.createdAt - a.createdAt;
            return a.createdAt - b.createdAt;
          });

          return (
            <ResizableBox 
              key={winId} 
              width={currentWidth} 
              height={Infinity} 
              axis="x" 
              minConstraints={[isCollapsed ? 40 : 150, Infinity]}
              maxConstraints={[600, Infinity]}
              // UPDATED: Sync the width back to your windows state
              onResize={(_e, { size }) => {
                setWindows(p => ({
                  ...p,
                  [winId]: { 
                    ...p[winId], 
                    width: size.width,
                    // Auto-collapse if user drags the window smaller than 60px
                    collapsed: size.width <= 60 
                  }
                }));
              }}
              handle={
                <div 
                  className="drag-handle" 
                  onDoubleClick={() => setWindows(p => ({ 
                    ...p, 
                    [winId]: { ...p[winId], collapsed: !isCollapsed, width: isCollapsed ? 280 : 40 } 
                  }))} 
                />
              }
            >
              <div className={`column ${isCollapsed ? 'collapsed' : ''}`} style={{ width: '100%' }}>
                <div className="column-header">
                  <span className="header-title">{windowName}</span>
                  {!isCollapsed && winId === 'root' && (
                    <div className="header-controls">
                      <div className="control-section">
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
                          <button className="toggle-all-btn" onClick={() => setWindows(p => { 
                            const any = Object.entries(p).some(([id, w]) => id !== 'root' && !w.collapsed); 
                            const next = {...p}; 
                            Object.keys(next).forEach(id => { if (id !== 'root') next[id] = {...next[id], collapsed: any}; }); 
                            return next; 
                          })}>
                            {Object.values(windows).some(w => w.id !== 'root' && !w.collapsed) ? 'COLLAPSE ALL' : 'EXPAND ALL'}
                          </button>
                          <button className="theme-toggle-btn" onClick={() => setIsDarkMode(!isDarkMode)}>{isDarkMode ? '🌙 DARK' : '☀️ LIGHT'}</button>
                          <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".json" onChange={handleImport} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                {!isCollapsed && (
                  <>
                    {winId === 'root' && !isCollapsed && (
                      <div className="search-bar">
                        <input 
                          placeholder="Search..." 
                          value={globalSearch} 
                          onChange={(e) => setGlobalSearch(e.target.value)} 
                        />
                      </div>
                    )}
                    <div className="tab-list">
                      {displayTabs.map(tab => (
                        <div 
                          key={tab.id} id={`tab-${tab.id}`}
                          className={`tab-row ${activeTabId === tab.id ? 'active' : ''} ${activeBranchIds.includes(tab.id) ? 'branch-active' : ''}`} 
                          tabIndex={0} 
                          onClick={() => handleTabClick(winId, tab, index)}
                        >
                          {editingTabId === tab.id ? (
                            <input 
                              autoFocus 
                              value={tab.title} 
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
                            <button className="edit-btn" onClick={(e) => { e.stopPropagation(); setEditingTabId(tab.id); }}>✎</button>
                            <button className="del-btn" onClick={(e) => { e.stopPropagation(); deleteTab(winId, tab.id); }}>✕</button>
                          </div>
                        </div>
                      ))}
                      <button className="add-btn" onClick={() => addTab(winId)}>+ Add Item</button>
                    </div>
                  </>
                )}
              </div>
            </ResizableBox>
          );
        })}
        
        <div className="writing-space">
          {activeTabId && editor ? (
            <div className="editor-wrapper">
              <EditorToolbar editor={editor} windows={windows} saveStatus={saveStatus} lastSaved={lastSaved} handleManualRetry={() => setWindows(p => ({...p}))} />
              <EditorContent editor={editor} className="rich-editor" />
              <div className="editor-footer">
                <div className="stat">Length: <span>{getEditorStats().chars}</span></div>
                <div className="stat">Words: <span>{getEditorStats().words}</span></div>
                <div className="stat">Lines: <span>{getEditorStats().lines}</span></div>
              </div>
            </div>
          ) : <div className="empty-state">Select an item to edit content.</div>}
        </div>
      </div>

      {isExportModalOpen && <ExportModal windows={windows} onClose={() => setIsExportModalOpen(false)} />}
    </div>
  );
}