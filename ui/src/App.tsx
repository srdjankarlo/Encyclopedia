import { useState, useEffect, useCallback } from 'react';
import { ResizableBox } from 'react-resizable';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TiptapImage from '@tiptap/extension-image';
import './App.css';

interface Tab {
  id: string;
  title: string;
  content: string;
  childWindowId?: string;
}

interface WindowData {
  id: string;
  tabs: Tab[];
  collapsed?: boolean;
}

export default function App() {
  const [windows, setWindows] = useState<Record<string, WindowData>>(() => {
    const saved = localStorage.getItem('enc_v10');
    return saved ? JSON.parse(saved) : {
      'root': { id: 'root', tabs: [{ id: 'init-1', title: 'New Tab 1', content: '' }] }
    };
  });

  const [activePath, setActivePath] = useState<string[]>(['root']);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);

  const getActiveContent = useCallback(() => {
    if (!activeTabId) return "";
    for (const winId in windows) {
      const tab = windows[winId].tabs.find(t => t.id === activeTabId);
      if (tab) return tab.content;
    }
    return "";
  }, [activeTabId, windows]);

  const updateContent = (html: string) => {
    if (!activeTabId) return;
    setWindows(prev => {
      const next = { ...prev };
      for (const winId in next) {
        const tab = next[winId].tabs.find(t => t.id === activeTabId);
        if (tab) { tab.content = html; break; }
      }
      return next;
    });
  };

  const editor = useEditor({
    extensions: [StarterKit, TiptapImage],
    content: '',
    onUpdate: ({ editor }) => updateContent(editor.getHTML()),
  });

  useEffect(() => {
    if (editor && activeTabId) {
      const content = getActiveContent();
      if (content !== editor.getHTML()) {
        editor.commands.setContent(content);
      }
    }
  }, [activeTabId, editor, getActiveContent]);

  useEffect(() => {
    localStorage.setItem('enc_v10', JSON.stringify(windows));
  }, [windows]);

  // FIND TITLE SYNC
  const findParentInfo = (childWinId: string) => {
    if (childWinId === 'root') return { title: "LIBRARY", fullPath: "1" };
    for (const winId in windows) {
      const parentTab = windows[winId].tabs.find(t => t.childWindowId === childWinId);
      if (parentTab) return { title: parentTab.title.toUpperCase(), fullPath: parentTab.title.replace('New Tab ', '') };
    }
    return { title: "SUB-LEVEL", fullPath: "" };
  };

  // SMART NUMBERING LOGIC
  const addTab = (windowId: string) => {
    const info = findParentInfo(windowId);
    const existingTabs = windows[windowId].tabs;
    
    // Find next number (e.g., if 1.1 and 1.2 exist, find 3)
    let nextNum = existingTabs.length + 1;
    const prefix = windowId === 'root' ? '' : `${info.fullPath}.`;
    const newTitle = `New Tab ${prefix}${nextNum}`;
    
    const newId = `tab-${Math.random().toString(36).substring(2, 11)}`;
    const newTab: Tab = { id: newId, title: newTitle, content: '' };
    
    setWindows(prev => ({ 
      ...prev, 
      [windowId]: { ...prev[windowId], tabs: [...prev[windowId].tabs, newTab] } 
    }));
  };

  // RECURSIVE DELETE + PATH CLEANUP
  const deleteTab = (windowId: string, tabId: string) => {
    const next = { ...windows };
    const tabToDelete = next[windowId].tabs.find(t => t.id === tabId);
    
    const allDeletedWindowIds: string[] = [];
    const collectWindows = (winId: string | undefined) => {
      if (!winId || !next[winId]) return;
      allDeletedWindowIds.push(winId);
      next[winId].tabs.forEach(t => collectWindows(t.childWindowId));
      delete next[winId];
    };

    collectWindows(tabToDelete?.childWindowId);
    next[windowId].tabs = next[windowId].tabs.filter(t => t.id !== tabId);
    
    // UI Path Cleanup: Remove any closed windows from the visible path
    const newPath = activePath.filter(id => id === 'root' || next[id]);
    setActivePath(newPath);
    setWindows(next);

    if (activeTabId === tabId || allDeletedWindowIds.includes(activeTabId || '')) {
      setActiveTabId(null);
    }
  };

  const toggleCollapse = (winId: string) => {
    if (winId === 'root') return;
    setWindows(prev => ({ ...prev, [winId]: { ...prev[winId], collapsed: !prev[winId].collapsed } }));
  };

  const handleTabClick = (windowId: string, tab: Tab, depth: number) => {
    setActiveTabId(tab.id);
    if (!tab.childWindowId) {
      const newWinId = `win-${Math.random().toString(36).substring(2, 11)}`;
      setWindows(prev => {
        const next = { ...prev };
        next[windowId].tabs = next[windowId].tabs.map(t => 
          t.id === tab.id ? { ...t, childWindowId: newWinId } : t
        );
        next[newWinId] = { id: newWinId, tabs: [], collapsed: false };
        return next;
      });
      setActivePath([...activePath.slice(0, depth + 1), newWinId]);
    } else {
      setActivePath([...activePath.slice(0, depth + 1), tab.childWindowId]);
    }
  };

  return (
    <div className="app-container">
      <div className="miller-columns">
        {activePath.map((winId, index) => {
          const isCollapsed = windows[winId]?.collapsed;
          if (!windows[winId]) return null; // Safety check for deleted windows

          return (
            <ResizableBox
              key={winId}
              width={isCollapsed ? 40 : 280}
              height={Infinity}
              axis="x"
              minConstraints={[isCollapsed ? 40 : 150, Infinity]}
              handle={<div className="drag-handle" onDoubleClick={() => toggleCollapse(winId)} />}
            >
              <div className={`column ${isCollapsed ? 'collapsed' : ''}`}>
                <div className="column-header">{findParentInfo(winId).title}</div>
                {!isCollapsed && (
                  <div className="tab-list">
                    {windows[winId].tabs.map(tab => (
                      <div key={tab.id} className={`tab-row ${activeTabId === tab.id ? 'active' : ''}`} onClick={() => handleTabClick(winId, tab, index)}>
                        {editingTabId === tab.id ? (
                          <input autoFocus value={tab.title} onBlur={() => setEditingTabId(null)} onKeyDown={(e) => e.key === 'Enter' && setEditingTabId(null)}
                            onChange={(e) => {
                              const next = { ...windows };
                              const t = next[winId].tabs.find(i => i.id === tab.id);
                              if(t) t.title = e.target.value;
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
                )}
              </div>
            </ResizableBox>
          );
        })}
        
        <div className="writing-space">
          {activeTabId && editor ? (
            <div className="editor-wrapper">
              <div className="editor-toolbar">
                <button title="Bold (Ctrl+B)" onClick={() => editor.chain().focus().toggleBold().run()} className={editor.isActive('bold') ? 'is-active' : ''}>B</button>
                <button title="Italic (Ctrl+I)" onClick={() => editor.chain().focus().toggleItalic().run()} className={editor.isActive('italic') ? 'is-active' : ''}>I</button>
                <button title="ToDo" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={editor.isActive('heading', { level: 1 }) ? 'is-active' : ''}>H1</button>
              </div>
              <EditorContent editor={editor} className="rich-editor" />
            </div>
          ) : (
            <div className="empty-state">Select an item to edit content.</div>
          )}
        </div>
      </div>
    </div>
  );
}