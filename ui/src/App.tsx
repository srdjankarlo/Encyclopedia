import { useState, useEffect, useCallback, useRef } from 'react';
import { ResizableBox } from 'react-resizable';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TiptapImage from '@tiptap/extension-image';
import './App.css';

const API_URL = "http://localhost:8080";

interface Tab {
  id: string;
  title: string;
  content: string;
  childWindowId?: string;
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
        console.log("📦 Data received from DB:", dbTabs);

        if (!dbTabs || dbTabs.length === 0) {
          setWindows({ 'root': { id: 'root', tabs: [{ id: 'init-1', title: 'New Tab 1', content: '', createdAt: Date.now() }] } });
        } else {
          // Initialize with root window
          const newWindows: Record<string, WindowData> = { 'root': { id: 'root', tabs: [] } };

          // 1. Create any windows that are referenced by tabs as "childWindowId"
          dbTabs.forEach(t => {
            if (t.child_window_id && !newWindows[t.child_window_id]) {
              newWindows[t.child_window_id] = { id: t.child_window_id, tabs: [], collapsed: false };
            }
          });

          // 2. Sort tabs into their parent windows
          dbTabs.forEach(t => {
            // If parent_id is null/empty, it belongs in 'root'. 
            // Otherwise, it belongs in the window matching its parent_id.
            const targetWinId = (t.parent_id && newWindows[t.parent_id]) ? t.parent_id : 'root';
            
            newWindows[targetWinId].tabs.push({
              id: t.id,
              title: t.title,
              content: t.content,
              childWindowId: t.child_window_id,
              createdAt: Number(t.created_at)
            });
          });

          console.log("🏗️ Reconstructed Windows:", newWindows);
          setWindows(newWindows);
        }
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
                child_window_id: tab.childWindowId || null, 
                parent_id: winId === 'root' ? null : winId, // IMPORTANT: The window ID is the parent
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
  const findParentInfo = (childWinId: string) => {
    if (childWinId === 'root') return { title: "LIBRARY", fullPath: "" };
    for (const winId in windows) {
      const parentTab = windows[winId].tabs.find(t => t.childWindowId === childWinId);
      if (parentTab) {
        const path = parentTab.title.startsWith('New Tab ') ? parentTab.title.replace('New Tab ', '') : parentTab.title;
        return { title: parentTab.title.toUpperCase(), fullPath: path };
      }
    }
    return { title: "SUB-LEVEL", fullPath: "" };
  };

  const addTab = (windowId: string) => {
    const info = findParentInfo(windowId);
    const win = windows[windowId];
    if (!win) return;
    let maxNum = 0;
    win.tabs.forEach(t => {
      const parts = t.title.split('.');
      const lastPart = parts[parts.length - 1];
      const num = parseInt(lastPart.replace('New Tab ', ''));
      if (!isNaN(num) && num > maxNum) maxNum = num;
    });
    const nextNum = maxNum + 1;
    const newTitle = windowId === 'root' ? `New Tab ${nextNum}` : `${info.fullPath}.${nextNum}`;
    const newId = `tab-${Math.random().toString(36).substring(2, 11)}`;
    const newTab: Tab = { id: newId, title: newTitle, content: '', createdAt: Date.now() };
    setWindows(prev => ({ ...prev, [windowId]: { ...prev[windowId], tabs: [...prev[windowId].tabs, newTab] } }));
  };

  // --- EXPORT LOGIC ---
  const toggleTabSelection = (tab: Tab, selected: boolean) => {
    const next = new Set(selectedTabIds);
    const walk = (t: Tab) => {
      selected ? next.add(t.id) : next.delete(t.id);
      if (t.childWindowId && windows[t.childWindowId]) {
        windows[t.childWindowId].tabs.forEach(walk);
      }
    };
    walk(tab);
    setSelectedTabIds(next);
  };

  const handleFinalExport = () => {
    const exportList: any[] = [];
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
            fromParent: parentTitle, // "From" field added here
            createdAt: tab.createdAt
          });
          if (tab.childWindowId) walk(tab.childWindowId, depth + 1, tab.title);
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

        const newWindows = { ...windows };
        
        // 1. Create a map of old IDs to new generated IDs to maintain relationships
        const idMap: Record<string, string> = {};
        importedData.forEach(item => {
          idMap[item.id] = `tab-${Math.random().toString(36).substr(2, 9)}`;
        });

        // 2. Process items and rebuild windows
        importedData.forEach(item => {
          const newId = idMap[item.id];
          const parentTitle = item.fromParent;
          
          // Determine which window this tab belongs in
          // If fromParent is "Root", it goes to 'root', otherwise find the new ID of that parent
          let targetWinId = 'root';
          if (parentTitle !== "Root") {
            const parentItem = importedData.find(p => p.title === parentTitle);
            if (parentItem) {
              const newParentTabId = idMap[parentItem.id];
              // We need to ensure the parent has a childWindowId assigned
              // Find the tab in our working newWindows set
              for (const wId in newWindows) {
                const tab = newWindows[wId].tabs.find(t => t.id === newParentTabId);
                if (tab) {
                  if (!tab.childWindowId) tab.childWindowId = `win-${Math.random().toString(36).substr(2, 9)}`;
                  targetWinId = tab.childWindowId;
                  break;
                }
              }
            }
          }

          const newTab: Tab = {
            id: newId,
            title: item.title,
            content: item.content,
            createdAt: item.createdAt || Date.now(),
          };

          if (!newWindows[targetWinId]) {
            newWindows[targetWinId] = { id: targetWinId, tabs: [] };
          }
          newWindows[targetWinId].tabs.push(newTab);
        });

        setWindows(newWindows);
        alert(`Successfully imported and reconstructed tree.`);
      } catch (err) {
        console.error(err);
        alert("Import failed: JSON structure is incompatible.");
      }
    };
    reader.readAsText(file);
  };

  // --- ACTIONS ---
  const deleteTab = (windowId: string, tabId: string) => {
    const tabToDelete = windows[windowId].tabs.find(t => t.id === tabId);
    if (!tabToDelete) return;

    // Added Confirmation
    const confirmMsg = `Are you sure you want to delete "${tabToDelete.title}"? This will also delete all nested sub-items.`;
    if (!window.confirm(confirmMsg)) return;

    const next = { ...windows };
    const collectWindows = (winId: string | undefined) => {
      if (!winId || !next[winId]) return;
      next[winId].tabs.forEach(t => collectWindows(t.childWindowId));
      delete next[winId];
    };
    
    collectWindows(tabToDelete.childWindowId);
    next[windowId].tabs = next[windowId].tabs.filter(t => t.id !== tabId);
    setActivePath(activePath.filter(id => id === 'root' || next[id]));
    setWindows(next);
  };

  const handleTabClick = (windowId: string, tab: Tab, depth: number) => {
    setActiveTabId(tab.id);
    if (!tab.childWindowId) {
      const newWinId = `win-${Math.random().toString(36).substring(2, 11)}`;
      setWindows(prev => {
        const next = { ...prev };
        next[windowId].tabs = next[windowId].tabs.map(t => t.id === tab.id ? { ...t, childWindowId: newWinId } : t);
        next[newWinId] = { id: newWinId, tabs: [], collapsed: false };
        return next;
      });
      setActivePath([...activePath.slice(0, depth + 1), newWinId]);
    } else { setActivePath([...activePath.slice(0, depth + 1), tab.childWindowId]); }
  };

  const editor = useEditor({
    extensions: [StarterKit, TiptapImage],
    content: '',
    onUpdate: ({ editor }) => {
      if (!activeTabId) return;
      setWindows(prev => {
        const next = { ...prev };
        for (const winId in next) {
          const tab = next[winId].tabs.find(t => t.id === activeTabId);
          if (tab) { tab.content = editor.getHTML(); break; }
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
    if (!win) return null;
    return (
      <div style={{ marginLeft: depth * 15 }}>
        {win.tabs.map(tab => (
          <div key={tab.id}>
            <label className="modal-checkbox-row">
              <input type="checkbox" checked={selectedTabIds.has(tab.id)} onChange={(e) => toggleTabSelection(tab, e.target.checked)} />
              <span className="modal-tab-name">{tab.title}</span>
            </label>
            {tab.childWindowId && <ExportTreeNode winId={tab.childWindowId} depth={depth + 1} />}
          </div>
        ))}
      </div>
    );
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
                  <button onClick={() => editor.chain().focus().toggleBold().run()} className={editor.isActive('bold') ? 'is-active' : ''}>B</button>
                  <button onClick={() => editor.chain().focus().toggleItalic().run()} className={editor.isActive('italic') ? 'is-active' : ''}>I</button>
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