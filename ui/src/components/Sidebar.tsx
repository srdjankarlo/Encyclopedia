import React from 'react';
import { ResizableBox } from 'react-resizable';
import { Eye } from 'lucide-react';
import type { Tab, WindowData } from '../types';

interface SidebarProps {
  listViewWidth: number;
  setListViewWidth: (width: number) => void;
  setPrevListViewWidth: (width: number) => void;
  handleSidebarDoubleClick: (e: React.MouseEvent) => void;
  windows: Record<string, WindowData>;
  setWindows: React.Dispatch<React.SetStateAction<Record<string, WindowData>>>;
  activeTabId: string | null;
  setActiveTabId: (id: string) => void;
  editingTabId: string | null;
  setEditingTabId: (id: string | null) => void;
  expandedListNodes: Set<string>;
  setExpandedListNodes: React.Dispatch<React.SetStateAction<Set<string>>>;
  globalSearch: string;
  isEditorFocused: boolean;
  addTab: (windowId: string) => Promise<string | undefined>;
  activateTab: (tab: Tab) => void;
  getFlattenedTabs: (tabs: Tab[]) => (Tab & { depth: number })[];
}

export default function Sidebar({
  listViewWidth,
  setListViewWidth,
  setPrevListViewWidth,
  handleSidebarDoubleClick,
  windows,
  setWindows,
  activeTabId,
  setActiveTabId,
  editingTabId,
  setEditingTabId,
  expandedListNodes,
  setExpandedListNodes,
  globalSearch,
  isEditorFocused,
  addTab,
  activateTab,
  getFlattenedTabs,
}: SidebarProps) {
  return (
    <ResizableBox
      width={listViewWidth}
      height={Infinity}
      axis="x"
      onResize={(_e, { size }) => setListViewWidth(size.width)}
      onResizeStart={() => {
        if (listViewWidth > 20) setPrevListViewWidth(listViewWidth);
      }}
      minConstraints={[5, Infinity]}
      maxConstraints={[600, Infinity]}
      handle={<div className="drag-handle" onDoubleClick={handleSidebarDoubleClick} />}
    >
      <div className="column" style={{ width: '100%' }}>
        <div className="column-header" style={{ borderBottom: 'none' }}>
          <span className="header-title">LIBRARY</span>
        </div>
        <div className="tab-list tree-view">
          <div className="root-footer">
            <button
              tabIndex={-1}
              className="add-btn"
              onClick={async () => {
                const newId = await addTab('root');
                if (newId) setActiveTabId(newId);
              }}
            >
              + Add New Root Item
            </button>
          </div>
          {getFlattenedTabs(Object.values(windows).flatMap((w) => w.tabs)).map((tab) => {
            const isSearchMatch =
              globalSearch.trim() !== '' &&
              tab.title.toLowerCase().includes(globalSearch.toLowerCase());
            const allTabs = Object.values(windows).flatMap((w) => w.tabs);
            const hasChildren = allTabs.some((t) => t.parentId === tab.id);
            const isActiveTab = tab.id === activeTabId;
            const showEye = isActiveTab && isEditorFocused;

            return (
              <div key={tab.id}>
                <div
                  id={`tab-row-${tab.id}`}
                  tabIndex={-1}
                  className={`tab-row ${activeTabId === tab.id ? 'active' : ''} ${
                    isSearchMatch ? 'search-highlight' : ''
                  }`}
                  onClick={() => activateTab(tab)}
                  style={{ paddingLeft: `${(tab as any).depth * 20 + 12}px` }}
                >
                  <span
                    className="tree-indicator"
                    style={{ cursor: hasChildren ? 'pointer' : 'default' }}
                    onClick={(e) => {
                      if (hasChildren) {
                        e.stopPropagation();
                        setExpandedListNodes((prev) => {
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
                      autoFocus
                      value={tab.title}
                      onBlur={() => setEditingTabId(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setEditingTabId(null);
                      }}
                      onChange={(e) => {
                        const next = { ...windows };
                        Object.keys(next).forEach((winId) => {
                          const t = next[winId].tabs.find((i) => i.id === tab.id);
                          if (t) t.title = e.target.value;
                        });
                        setWindows(next);
                      }}
                    />
                  ) : (
                    <span className="tab-title">{tab.title}</span>
                  )}
                  {showEye && (
                    <Eye
                      size={14}
                      className={`tab-eye-icon ${isActiveTab ? 'active-eye' : ''} ${
                        isSearchMatch ? 'search-eye' : ''
                      }`}
                    />
                  )}
                </div>
                {activeTabId === tab.id && (
                  <div
                    className="tab-list-actions"
                    style={{ paddingLeft: `${((tab as any).depth + 1) * 20 + 24}px` }}
                  >
                    <button
                      tabIndex={-1}
                      className="add-btn"
                      onClick={async () => {
                        const newId = await addTab(tab.id);
                        if (newId) setActiveTabId(newId);
                      }}
                    >
                      + Add Child
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </ResizableBox>
  );
}