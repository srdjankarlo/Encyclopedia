import { useState, useEffect, useRef } from 'react';
import { ResizableBox } from 'react-resizable';
import { useEditor, EditorContent } from '@tiptap/react';
import {StarterKit} from '@tiptap/starter-kit';
// import TiptapImage from '@tiptap/extension-image';
import {Heading} from '@tiptap/extension-heading';
import {BulletList} from '@tiptap/extension-bullet-list';
import {OrderedList} from '@tiptap/extension-ordered-list';
import {ListItem} from '@tiptap/extension-list-item';
import {Table} from '@tiptap/extension-table';
import {TableRow} from '@tiptap/extension-table-row';
import {TableCell} from '@tiptap/extension-table-cell';
import {TableHeader} from '@tiptap/extension-table-header';
import {Image} from '@tiptap/extension-image';
import {Link} from '@tiptap/extension-link';
import './App.css';
import { 
  Heading1, Heading2, Type, Bold, Italic, Strikethrough, 
  List, ListOrdered, Image as ImageIcon, Table as TableIcon, 
  Columns, Rows, Trash2, Plus
} from 'lucide-react';

const API_URL = "http://localhost:8080";

interface Tab {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  parentId?: string; // Added for DB structural clarity
}

interface WindowData {
  id: string;
  tabs: Tab[];
  collapsed?: boolean;
}

type SortMode = 'oldest' | 'alpha' | 'alpha-desc' | 'newest';

export default function App() {
  const [windows, setWindows] = useState<Record<string, WindowData>>({ 'root': { id: 'root', tabs: [] } });
  const [activePath, setActivePath] = useState<string[]>(['root']);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({});
  const [globalSortMode, setGlobalSortMode] = useState<SortMode>('oldest');
  const isInitialMount = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  // Export State
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [selectedTabIds, setSelectedTabIds] = useState<Set<string>>(new Set());
  const [exportFileName, setExportFileName] = useState('My_Encyclopedia');
  const [exportFormat, setExportFormat] = useState<'txt' | 'json'>('txt');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    // Check if the user has a preference saved in local storage
    return localStorage.getItem('theme') === 'dark';
  });

  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.add('dark-theme');
      localStorage.setItem('theme', 'dark');
    } else {
      document.body.classList.remove('dark-theme');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  // --- SYNC LOGIC (Update this section) ---
  useEffect(() => {
    const loadFromDb = async () => {
      try {
        const res = await fetch(`${API_URL}/tabs`);
        const dbTabs: any[] = await res.json();

        if (!dbTabs || dbTabs.length === 0) {
          setWindows({ 'root': { id: 'root', tabs: [] } });
          return;
        }

        const newWindows: Record<string, WindowData> = { 'root': { id: 'root', tabs: [] } };

        // First pass: Create windows for any tab that acts as a parent
        dbTabs.forEach(t => {
          if (t.id) { // Every tab potentially has a child window
            newWindows[t.id] = { id: t.id, tabs: [], collapsed: false };
          }
        });

        // Second pass: Put tabs into their parents' windows
        dbTabs.forEach(t => {
          const targetWinId = t.parent_id || 'root';
          if (!newWindows[targetWinId]) {
            newWindows[targetWinId] = { id: targetWinId, tabs: [], collapsed: false };
          }

          newWindows[targetWinId].tabs.push({
            id: t.id,
            title: t.title,
            content: t.content,
            createdAt: Number(t.created_at),
            parentId: t.parent_id // Keep track of parent
          });
        });

        setWindows(newWindows);
      } catch (e) {
        console.error("❌ DB Load failed", e);
      }
    };
    loadFromDb();
  }, []);

  const handleManualRetry = () => {
    setSaveStatus('saving');
    // This triggers the useEffect dependency [windows] by creating a shallow copy
    // or you can extract the save logic into a named function to call here.
    setWindows(prev => ({ ...prev })); 
  };

  // --- UPDATED SYNC LOGIC ---
  useEffect(() => {
    if (isInitialMount.current) { isInitialMount.current = false; return; }
    
    // Set to saving as soon as changes are detected
    setSaveStatus('saving');

    const timer = setTimeout(async () => {
      try {
        const promises = Object.entries(windows).flatMap(([winId, win]) => 
          win.tabs.map(tab => 
            fetch(`${API_URL}/tabs`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                id: tab.id, 
                title: tab.title, 
                content: tab.content, 
                // CHANGE: if winId is 'root', parent_id is null. Otherwise, it's the winId.
                parent_id: winId === 'root' ? null : winId, 
                child_window_id: tab.id, // The tab's ID is the window it opens
                created_at: tab.createdAt 
              }),
            })
          )
        );

        await Promise.all(promises);
        setSaveStatus('saved');
        setLastSaved(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      } catch (e) {
        console.error("Save failed", e);
        setSaveStatus('error');
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [windows]);

  // --- NEW: COLLAPSE/EXPAND ALL ---
  const toggleAllWindows = () => {
    setWindows(prev => {
      // Check if there are any windows (besides root) that are currently expanded
      const anyExpanded = Object.entries(prev).some(([id, win]) => id !== 'root' && !win.collapsed);
      
      const next = { ...prev };
      Object.keys(next).forEach(id => {
        if (id !== 'root') {
          // If any were expanded, collapse them all. Otherwise, expand them all.
          next[id] = { ...next[id], collapsed: anyExpanded };
        }
      });
      return next;
    });
  };

  // --- NEW: STATS CALCULATOR ---
  const getEditorStats = () => {
    if (!editor) return { chars: 0, words: 0, lines: 0 };
    const text = editor.getText();
    const lines = text.split(/\r\n|\r|\n/).length;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    return { chars, words, lines };
  };

  // --- HELPERS ---
  const findParentInfo = (currentWinId: string) => {
    if (currentWinId === 'root') return { title: "LIBRARY", fullPath: "New Tab" };

    // In the new system, currentWinId IS the parent's tab ID
    for (const winId in windows) {
      const parentTab = windows[winId].tabs.find(t => t.id === currentWinId);
      if (parentTab) {
        return { 
          title: parentTab.title.toUpperCase(), 
          fullPath: parentTab.title 
        };
      }
    }
    return { title: "SUB-LEVEL", fullPath: "Sub" };
  };

  const addTab = (windowId: string) => {
    const info = findParentInfo(windowId);
    const win = windows[windowId];
    if (!win) return;

    // 1. Calculate the next increment number
    let maxNum = 0;
    win.tabs.forEach(t => {
      // If title is "Research.2", we split by "." and get the "2"
      const parts = t.title.split('.');
      const lastPart = parts[parts.length - 1];
      
      // Also handle the "New Tab 1" case for the root
      const numMatch = lastPart.match(/\d+/);
      if (numMatch) {
        const num = parseInt(numMatch[0]);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });

    const nextNum = maxNum + 1;

    // 2. Format the title
    // If root: "New Tab 1", "New Tab 2"
    // If sub: "Parent.1", "Parent.2"
    const newTitle = windowId === 'root' 
      ? `New Tab ${nextNum}` 
      : `${info.fullPath}.${nextNum}`;

    const newId = `tab-${Math.random().toString(36).substring(2, 11)}`;
    
    const newTab: Tab = { 
      id: newId, 
      title: newTitle, 
      content: '', 
      createdAt: Date.now()
    };

    setWindows(prev => ({ 
      ...prev, 
      [windowId]: { 
        ...prev[windowId], 
        tabs: [...prev[windowId].tabs, newTab] 
      },
      [newId]: { 
        id: newId, 
        tabs: [], 
        collapsed: false 
      }
    }));
  };

  // --- EXPORT LOGIC ---
  const toggleTabSelection = (tab: Tab, selected: boolean) => {
    const next = new Set(selectedTabIds);
    const walk = (tId: string) => {
      selected ? next.add(tId) : next.delete(tId);
      // If this tab has a child window, walk those tabs too
      if (windows[tId]) {
        windows[tId].tabs.forEach(child => walk(child.id));
      }
    };
    walk(tab.id);
    setSelectedTabIds(next);
  };

  const handleFinalExport = () => {
    const exportList: any[] = [];
    
    // Recursive walker that uses the new Window ID logic
    const walk = (winId: string, depth: number, parentTitle: string = "Root") => {
      const win = windows[winId];
      if (!win) return;

      win.tabs.forEach(tab => {
        if (selectedTabIds.has(tab.id)) {
          exportList.push({
            id: tab.id,
            title: tab.title,
            content: tab.content,
            depth: depth,
            fromParent: parentTitle, 
            createdAt: tab.createdAt
          });
          // Check if this tab has its own window (children)
          if (windows[tab.id]) {
            walk(tab.id, depth + 1, tab.title);
          }
        }
      });
    };

    walk('root', 0);

    let blob: Blob;
    if (exportFormat === 'json') {
      blob = new Blob([JSON.stringify(exportList, null, 2)], { type: 'application/json' });
    } else {
      const formattedText = exportList.map(item => {
        const prefix = "=".repeat(item.depth + 1) + " ";
        const cleanContent = item.content.replace(/<[^>]*>/g, '\n');
        return `${prefix}${item.title.toUpperCase()} (Source: ${item.fromParent})\n${cleanContent}\n\n`;
      }).join('\n');
      blob = new Blob([formattedText], { type: 'text/plain' });
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportFileName}.${exportFormat}`;
    a.click();
    setIsExportModalOpen(false);
  };

  // --- IMPORT LOGIC ---
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedData: any[] = JSON.parse(event.target?.result as string);
        if (!Array.isArray(importedData)) throw new Error("Invalid format");

        // Start with a clean slate or merge with 'root'
        const newWindows: Record<string, WindowData> = { 'root': { id: 'root', tabs: [] } };
        
        // 1. Create a map for IDs and verify titles
        const idMap: Record<string, string> = {}; // Old Title -> New ID
        importedData.forEach(item => {
          idMap[item.title] = `tab-${Math.random().toString(36).substring(2, 11)}`;
        });

        // 2. Sort by depth to ensure parents are created before children
        const sortedData = [...importedData].sort((a, b) => (a.depth || 0) - (b.depth || 0));

        sortedData.forEach(item => {
          const newId = idMap[item.title];
          const parentTitle = item.fromParent;
          
          let targetWinId = 'root';
          if (parentTitle !== "Root" && idMap[parentTitle]) {
            targetWinId = idMap[parentTitle];
          }

          const newTab: Tab = {
            id: newId,
            title: item.title,
            content: item.content,
            createdAt: item.createdAt || Date.now(),
          };

          // Ensure the target window exists
          if (!newWindows[targetWinId]) {
            newWindows[targetWinId] = { id: targetWinId, tabs: [], collapsed: false };
          }
          newWindows[targetWinId].tabs.push(newTab);

          // Initialize a window for the new tab in case it has children later
          if (!newWindows[newId]) {
            newWindows[newId] = { id: newId, tabs: [], collapsed: false };
          }
        });

        setWindows(newWindows);
        alert(`Successfully imported ${importedData.length} items.`);
      } catch (err) {
        console.error(err);
        alert("Import failed: Ensure you are using a valid JSON export file.");
      }
    };
    reader.readAsText(file);
  };

  // --- ACTIONS ---
  const deleteTab = async (windowId: string, tabId: string) => {
    if (!window.confirm("Delete this item and all sub-items?")) return;

    const next = { ...windows };
    const idsToRemove = new Set<string>();

    // 1. RECURSIVE UI CLEANUP: Find every tab and window in this branch
    const collectAndKill = (id: string) => {
      idsToRemove.add(id);
      
      // If a window exists for this tab, it contains its children
      if (next[id]) {
        next[id].tabs.forEach(child => collectAndKill(child.id));
        delete next[id]; // Kill the window object entirely
      }
    };

    collectAndKill(tabId);

    // 2. Remove the starting tab from its parent's list
    if (next[windowId]) {
      next[windowId].tabs = next[windowId].tabs.filter(t => t.id !== tabId);
    }

    // 3. Update State & Close Columns
    setWindows(next);
    setActivePath(prev => prev.filter(id => id === 'root' || next[id]));
    if (activeTabId && idsToRemove.has(activeTabId)) setActiveTabId(null);

    // 4. BACKEND CALL: The SQL handles the rest of the tree
    try {
      await fetch(`${API_URL}/tabs/${tabId}`, { method: 'DELETE' });
    } catch (e) {
      console.error("Sync error", e);
    }
  };

  const handleTabClick = (windowId: string, tab: Tab, index: number) => {
    // 1. Set the active tab highlight
    setActiveTabId(tab.id);

    // 2. Determine if we are clicking a tab that is already open at the end of the path
    const isAlreadyOpen = activePath[index + 1] === tab.id;

    if (isAlreadyOpen) {
      // CLOSE: If it's already open, truncate the path to this level
      setActivePath(activePath.slice(0, index + 1));
      if (activeTabId === tab.id) setActiveTabId(null);
    } else {
      // OPEN: If it's not open, create the window if it doesn't exist and update path
      if (!windows[tab.id]) {
        setWindows(prev => ({
          ...prev,
          [tab.id]: { id: tab.id, tabs: [], collapsed: false }
        }));
      }
      // Update path to include this new tab's window
      setActivePath([...activePath.slice(0, index + 1), tab.id]);
    }
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // We configure these separately for more control
        heading: false,
        bulletList: false, 
        orderedList: false,
      }),
      Heading.configure({ levels: [1, 2, 3] }),
      BulletList,
      OrderedList,
      ListItem,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Image,
      Link.configure({ openOnClick: false }),
    ],
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
  });

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

  const activeBranchIds = activePath.map(winId => {
    for (const pid in windows) {
      const parentTab = windows[pid].tabs.find(t => t.childWindowId === winId);
      if (parentTab) return parentTab.id;
    }
    return null;
  }).filter(Boolean);

  const ExportTreeNode = ({ winId, depth }: { winId: string; depth: number }) => {
    const win = windows[winId];
    if (!win || win.tabs.length === 0) return null;
    return (
      <div style={{ marginLeft: depth * 15 }}>
        {win.tabs.map(tab => (
          <div key={tab.id}>
            <label className="modal-checkbox-row">
              <input 
                type="checkbox" 
                checked={selectedTabIds.has(tab.id)} 
                onChange={(e) => toggleTabSelection(tab, e.target.checked)} 
              />
              <span className="modal-tab-name">{tab.title}</span>
            </label>
            {/* If a window exists for this tab ID, it has children */}
            {windows[tab.id] && <ExportTreeNode winId={tab.id} depth={depth + 1} />}
          </div>
        ))}
      </div>
    );
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && editor) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        editor.chain().focus().setImage({ src: base64 }).run();
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="app-container">
      <div className="miller-columns">
        {activePath.map((winId, index) => {
          const win = windows[winId];
          if (!win) return null;
          const isCollapsed = win.collapsed;
          const query = searchQueries[winId]?.toLowerCase() || "";
          const sortMode = globalSortMode;
          const displayTabs = [...win.tabs].filter(t => t.title.toLowerCase().includes(query));

          if (sortMode === 'alpha') displayTabs.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
          if (sortMode === 'alpha-desc') displayTabs.sort((a, b) => b.title.localeCompare(a.title, undefined, { numeric: true }));
          if (sortMode === 'newest') displayTabs.sort((a, b) => b.createdAt - a.createdAt);
          if (sortMode === 'oldest') displayTabs.sort((a, b) => a.createdAt - b.createdAt);

          return (
            <ResizableBox key={winId} width={isCollapsed ? 40 : 280} height={Infinity} axis="x" minConstraints={[isCollapsed ? 40 : 150, Infinity]} handle={<div className="drag-handle" onDoubleClick={() => setWindows(p => ({ ...p, [winId]: { ...p[winId], collapsed: !isCollapsed } }))} />}>
              <div className={`column ${isCollapsed ? 'collapsed' : ''}`}>
                <div className="column-header">
                  <span className="header-title">{findParentInfo(winId).title}</span>
                  {!isCollapsed && (
                    <div className="header-controls">
                      {/* ONLY SHOW SORTING IN ROOT */}
                      {winId === 'root' && (
                        <div className="control-section">
                          <span className="section-label">GLOBAL SORTING</span>
                          <div className="button-row">
                            <button className={globalSortMode === 'oldest' ? 'active' : ''} onClick={() => setGlobalSortMode('oldest')}>OLDEST</button>
                            <button className={globalSortMode === 'newest' ? 'active' : ''} onClick={() => setGlobalSortMode('newest')}>NEWEST</button>
                            <button className={globalSortMode === 'alpha' ? 'active' : ''} onClick={() => setGlobalSortMode('alpha')}>A-Z</button>
                            <button className={globalSortMode === 'alpha-desc' ? 'active' : ''} onClick={() => setGlobalSortMode('alpha-desc')}>Z-A</button>
                          </div>
                        </div>
                      )}

                      {/* SYSTEM CONTROLS (Keep in root) */}
                      {winId === 'root' && (
                        <div className="control-section">
                          <span className="section-label">SYSTEM</span>
                          <div className="button-row">
                            <button className="export-btn" disabled={win.tabs.length === 0} onClick={() => {
                                setSelectedTabIds(new Set(Object.values(windows).flatMap(w => w.tabs.map(t => t.id))));
                                setIsExportModalOpen(true);
                            }}>EXPORT</button>
                            <button className="import-btn" onClick={() => fileInputRef.current?.click()}>IMPORT</button>
                            {/* NEW BUTTON */}
                            <button className="toggle-all-btn" onClick={toggleAllWindows} title="Toggle all sub-windows">
                              {Object.values(windows).some(w => w.id !== 'root' && !w.collapsed) ? 'COLLAPSE ALL' : 'EXPAND ALL'}
                            </button>
                            <button 
                              className="theme-toggle-btn" 
                              onClick={() => setIsDarkMode(!isDarkMode)}
                              title="Toggle Dark/Light Mode"
                            >
                              {isDarkMode ? '🌙 DARK' : '☀️ LIGHT'}
                            </button>
                            <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".json" onChange={handleImport} />
                          </div>
                          {/* NEW SHORTCUTS PANEL (ROOT ONLY) */}
                          <div className="shortcuts-legend">
                            <div className="legend-item"><b>ENTER</b> Select</div>
                            <div className="legend-item"><b>F2</b> Rename</div>
                            <div className="legend-item"><b>DEL</b> Delete</div>
                            <div className="legend-item"><b>DBL-CLK</b> Toggle Width</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {!isCollapsed && (
                  <>
                    <div className="search-bar"><input placeholder="Search..." value={searchQueries[winId] || ""} onChange={(e) => setSearchQueries(p => ({ ...p, [winId]: e.target.value }))} /></div>
                    <div className="tab-list">
                      {displayTabs.map(tab => (
                        <div 
                          key={tab.id} 
                          className={`tab-row ${activeTabId === tab.id ? 'active' : ''} ${activeBranchIds.includes(tab.id) ? 'branch-active' : ''}`} 
                          tabIndex={0} 
                          onKeyDown={(e) => {
                            // ENTER: Open/Navigate
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleTabClick(winId, tab, index);
                            }
                            // F2: Trigger Rename
                            if (e.key === 'F2') {
                              e.preventDefault();
                              setEditingTabId(tab.id);
                            }
                            // DELETE: Trigger Delete
                            if (e.key === 'Delete') {
                              e.preventDefault();
                              deleteTab(winId, tab.id);
                            }
                          }}
                          onClick={() => handleTabClick(winId, tab, index)}
                        >
                          {editingTabId === tab.id ? (
                            <input 
                              autoFocus 
                              value={tab.title} 
                              onBlur={() => setEditingTabId(null)} 
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.stopPropagation();
                                  setEditingTabId(null);
                                }
                              }} 
                              onChange={(e) => {
                                const next = { ...windows };
                                const t = next[winId].tabs.find(i => i.id === tab.id);
                                if (t) t.title = e.target.value;
                                setWindows(next);
                              }} 
                            />
                          ) : ( <span className="tab-title">{tab.title}</span> )}
                          <div className="tab-actions">
                            <button className="edit-btn" tabIndex={-1} onClick={(e) => { e.stopPropagation(); setEditingTabId(tab.id); }}>✎</button>
                            <button className="del-btn" tabIndex={-1} onClick={(e) => { e.stopPropagation(); deleteTab(winId, tab.id); }}>✕</button>
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
              <div className="editor-toolbar">
                <div className="tools">
                  {/* Text Style Group */}
                  <div className="tool-group">
                    {/* Text Styles */}
                    <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={editor.isActive('heading', { level: 1 }) ? 'is-active' : ''} title="Heading 1"><Heading1 size={18} /></button>
                    <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={editor.isActive('heading', { level: 2 }) ? 'is-active' : ''} title="Heading 2"><Heading2 size={18} /></button>
                    <button onClick={() => editor.chain().focus().setParagraph().run()} className={editor.isActive('paragraph') ? 'is-active' : ''} title="Paragraph"><Type size={18} /></button>
                    
                    <div className="tool-separator" />

                    {/* Formatting */}
                    <button onClick={() => editor.chain().focus().toggleBold().run()} className={editor.isActive('bold') ? 'is-active' : ''} title="Bold"><Bold size={18} /></button>
                    <button onClick={() => editor.chain().focus().toggleItalic().run()} className={editor.isActive('italic') ? 'is-active' : ''} title="Italic"><Italic size={18} /></button>
                    <button onClick={() => editor.chain().focus().toggleStrike().run()} className={editor.isActive('strike') ? 'is-active' : ''} title="Strike"><Strikethrough size={18} /></button>

                    <div className="tool-separator" />

                    {/* Lists */}
                    <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={editor.isActive('bulletList') ? 'is-active' : ''} title="Bullet List"><List size={18} /></button>
                    <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={editor.isActive('orderedList') ? 'is-active' : ''} title="Numbered List"><ListOrdered size={18} /></button>

                    <div className="tool-separator" />

                    {/* Media & Tables */}
                    <button onClick={() => document.getElementById('image-upload')?.click()} title="Upload Image"><ImageIcon size={18} /></button>
                    <input 
                      id="image-upload" 
                      type="file" 
                      accept="image/*" 
                      onChange={handleImageUpload} 
                      style={{ display: 'none' }} 
                    />
                    
                    <button onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="Insert Table"><TableIcon size={18} /></button>

                    {/* Contextual Table Controls */}
                    {editor.isActive('table') && (
                      <>
                        <div className="tool-separator" />
                        <button 
                          onClick={() => editor.chain().focus().addColumnAfter().run()} 
                          title="Add Column"
                        >
                          <Columns size={18} />
                        </button>
                        <button 
                          onClick={() => editor.chain().focus().addRowAfter().run()} 
                          title="Add Row"
                        >
                          <Rows size={18} />
                        </button>
                        <button 
                          onClick={() => editor.chain().focus().deleteTable().run()} 
                          style={{color: '#ff4d4d'}} 
                          title="Delete Table"
                        >
                          <Trash2 size={18} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {/* SYNC INDICATOR */}
                <div className="sync-indicator-container">
                  <div className={`sync-indicator ${saveStatus}`}>
                    {saveStatus === 'saving' && "● Syncing..."}
                    {saveStatus === 'saved' && (
                      <div className="saved-group">
                        <span>✓ Saved</span>
                        {lastSaved && <span className="save-time">at {lastSaved}</span>}
                      </div>
                    )}
                    {saveStatus === 'error' && (
                      <div className="error-group">
                        <span>⚠ Sync Error</span>
                        <button className="retry-sync-btn" onClick={handleManualRetry}>Retry</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <EditorContent editor={editor} className="rich-editor" />
              {/* STATS FOOTER (Notepad++ Style) */}
              <div className="editor-footer">
                <div className="stat">Length: <span>{getEditorStats().chars}</span></div>
                <div className="stat">Words: <span>{getEditorStats().words}</span></div>
                <div className="stat">Lines: <span>{getEditorStats().lines}</span></div>
                <div className="stat-right">UTF-8 | Windows (CR LF)</div>
              </div>
            </div>
          ) : <div className="empty-state">Select an item to edit content.</div>}
        </div>
      </div>

      {isExportModalOpen && (
        <div className="modal-overlay" onClick={() => setIsExportModalOpen(false)}>
          <div className="export-modal large" onClick={e => e.stopPropagation()}>
            <h3 style={{color: '#007acc', margin: '0 0 15px 0'}}>Export Configuration</h3>
            <div className="modal-field">
              <label>File Name</label>
              <input value={exportFileName} onChange={e => setExportFileName(e.target.value)} />
            </div>
            <div className="modal-field tree-selector">
              <label>Select Content to Export</label>
              <div className="tree-container"><ExportTreeNode winId="root" depth={0} /></div>
            </div>
            <div className="modal-field">
              <label>Format</label>
              <div className="button-row">
                <button className={exportFormat === 'txt' ? 'active' : ''} onClick={() => setExportFormat('txt')}>Text Document</button>
                <button className={exportFormat === 'json' ? 'active' : ''} onClick={() => setExportFormat('json')}>Database (JSON)</button>
              </div>
            </div>
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setIsExportModalOpen(false)}>Cancel</button>
              <button className="confirm-btn" onClick={handleFinalExport}>Download {selectedTabIds.size} Items</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}