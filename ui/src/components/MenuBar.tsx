import React, { useState } from 'react';
import type { Tab, WindowData, SortMode } from '../types';

interface MenuBarProps {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  setIsExportModalOpen: (open: boolean) => void;
  globalSortMode: SortMode;
  setGlobalSortMode: (mode: SortMode) => void;
  theme: string;
  setTheme: (theme: string) => void;
  windows: Record<string, WindowData>;
  expandedListNodes: Set<string>;
  setExpandedListNodes: React.Dispatch<React.SetStateAction<Set<string>>>;
  setShowShortcuts: (show: boolean) => void;
  globalSearch: string;
  handleSearch: (e: React.ChangeEvent<HTMLInputElement>) => void;
  globalMatches: Tab[];
  currentGlobalIndex: number;
  cycleGlobalMatch: (direction: 1 | -1) => void;
  contentSearch: string;
  handleContentSearch: (e: React.ChangeEvent<HTMLInputElement>) => void;
  contentMatches: { tabId: string; title: string }[];
  currentMatchIndex: number;
  cycleMatch: (direction: 1 | -1) => void;
  listViewWidth: number;
  toggleSidebar: (e: React.MouseEvent) => void;
}

export default function MenuBar({
  fileInputRef,
  setIsExportModalOpen,
  globalSortMode,
  setGlobalSortMode,
  theme,
  setTheme,
  windows,
  expandedListNodes,
  setExpandedListNodes,
  setShowShortcuts,
  globalSearch,
  handleSearch,
  globalMatches,
  currentGlobalIndex,
  cycleGlobalMatch,
  contentSearch,
  handleContentSearch,
  contentMatches,
  currentMatchIndex,
  cycleMatch,
  listViewWidth,
  toggleSidebar,
}: MenuBarProps) {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const toggleExpandAll = () => {
    const allTabs = Object.values(windows).flatMap((w) => w.tabs);
    if (expandedListNodes.size > 0) {
      setExpandedListNodes(new Set());
    } else {
      setExpandedListNodes(new Set(allTabs.map((t) => t.id)));
    }
  };

  return (
    <div className="global-menubar">
      {/* Data Menu */}
      <div className="menu-item" onMouseLeave={() => setActiveMenu(null)}>
        <button
          onMouseEnter={() => setActiveMenu('data')}
          onClick={() => setActiveMenu(activeMenu === 'data' ? null : 'data')}
        >
          Data
        </button>
        {activeMenu === 'data' && (
          <div className="dropdown">
            <button onClick={() => fileInputRef.current?.click()}>Import</button>
            <button onClick={() => setIsExportModalOpen(true)}>Export</button>
          </div>
        )}
      </div>

      {/* Sort Menu */}
      <div className="menu-item" onMouseLeave={() => setActiveMenu(null)}>
        <button
          onMouseEnter={() => setActiveMenu('sort')}
          onClick={() => setActiveMenu(activeMenu === 'sort' ? null : 'sort')}
        >
          Sort
        </button>
        {activeMenu === 'sort' && (
          <div className="dropdown">
            <button
              className={globalSortMode === 'oldest' ? 'active' : ''}
              onClick={() => setGlobalSortMode('oldest')}
            >
              Oldest
            </button>
            <button
              className={globalSortMode === 'newest' ? 'active' : ''}
              onClick={() => setGlobalSortMode('newest')}
            >
              Newest
            </button>
            <button
              className={globalSortMode === 'alpha' ? 'active' : ''}
              onClick={() => setGlobalSortMode('alpha')}
            >
              A-Z
            </button>
            <button
              className={globalSortMode === 'alpha-desc' ? 'active' : ''}
              onClick={() => setGlobalSortMode('alpha-desc')}
            >
              Z-A
            </button>
          </div>
        )}
      </div>

      {/* View Menu */}
      <div className="menu-item" onMouseLeave={() => setActiveMenu(null)}>
        <button
          onMouseEnter={() => setActiveMenu('view')}
          onClick={() => setActiveMenu(activeMenu === 'view' ? null : 'view')}
        >
          View
        </button>
        {activeMenu === 'view' && (
          <div className="dropdown">
            <button
              className={theme === 'light' ? 'active' : ''}
              onClick={() => setTheme('light')}
            >
              Light Theme
            </button>
            <button
              className={theme === 'gray' ? 'active' : ''}
              onClick={() => setTheme('gray')}
            >
              Gray Theme
            </button>
            <button
              className={theme === 'dark' ? 'active' : ''}
              onClick={() => setTheme('dark')}
            >
              Dark Theme
            </button>
            <button onClick={toggleExpandAll}>
              {expandedListNodes.size > 0 ? 'Collapse All' : 'Expand All'}
            </button>
            <button onClick={toggleSidebar}>
              {listViewWidth <= 20 ? 'Show Sidebar' : 'Hide Sidebar'}
            </button>
          </div>
        )}
      </div>

      {/* Help Menu */}
      <div className="menu-item" onMouseLeave={() => setActiveMenu(null)}>
        <button
          onMouseEnter={() => setActiveMenu('help')}
          onClick={() => setActiveMenu(activeMenu === 'help' ? null : 'help')}
        >
          Help
        </button>
        {activeMenu === 'help' && (
          <div className="dropdown">
            <button onClick={() => setShowShortcuts(true)}>Show Shortcuts</button>
          </div>
        )}
      </div>

      {/* Search Bars */}
      <div className="menubar-search">
        <div className="content-search-wrapper">
          <input
            placeholder="Search tabs by title..."
            value={globalSearch}
            onChange={handleSearch}
            onKeyDown={(e) => {
              if (e.key === 'Enter') cycleGlobalMatch(1);
            }}
          />
          {globalMatches.length > 0 && (
            <div className="search-nav">
              <button onClick={() => cycleGlobalMatch(-1)}>▲</button>
              <span>
                {currentGlobalIndex + 1}/{globalMatches.length}
              </span>
              <button onClick={() => cycleGlobalMatch(1)}>▼</button>
            </div>
          )}
        </div>

        <div className="content-search-wrapper">
          <input
            placeholder="Search content..."
            value={contentSearch}
            onChange={handleContentSearch}
            onKeyDown={(e) => {
              if (e.key === 'Enter') cycleMatch(1);
            }}
          />
          {contentMatches.length > 0 && (
            <div className="search-nav">
              <button onClick={() => cycleMatch(-1)}>▲</button>
              <span>
                {currentMatchIndex + 1}/{contentMatches.length}
              </span>
              <button onClick={() => cycleMatch(1)}>▼</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}