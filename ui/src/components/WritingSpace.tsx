import React from 'react';
import { EditorContent, type Editor } from '@tiptap/react';
import EditorToolbar from './EditorToolbar';
import type { WindowData, SaveStatus } from '../types';

interface WritingSpaceProps {
  activeTabId: string | null;
  isEditorOpen: boolean;
  editor: Editor | null;
  windows: Record<string, WindowData>;
  setWindows: React.Dispatch<React.SetStateAction<Record<string, WindowData>>>;
  saveStatus: SaveStatus;
  lastSaved: string | null;
  zoomLevel: number;
  showReplace: boolean;
  setShowReplace: React.Dispatch<React.SetStateAction<boolean>>;
  replaceQuery: string;
  setReplaceQuery: (q: string) => void;
  replaceWith: string;
  setReplaceWith: (w: string) => void;
  handleReplaceAll: () => void;
  stats: { chars: number; words: number; lines: number };
  cursor: { char: number; word: number; line: number };
}

export default function WritingSpace({
  activeTabId,
  isEditorOpen,
  editor,
  windows,
  setWindows,
  saveStatus,
  lastSaved,
  zoomLevel,
  showReplace,
  setShowReplace,
  replaceQuery,
  setReplaceQuery,
  replaceWith,
  setReplaceWith,
  handleReplaceAll,
  stats,
  cursor,
}: WritingSpaceProps) {
  return (
    <div className="writing-space">
      {activeTabId && isEditorOpen && editor ? (
        <div className="editor-wrapper">
          <EditorToolbar
            editor={editor}
            windows={windows}
            saveStatus={saveStatus}
            lastSaved={lastSaved}
            handleManualRetry={() => setWindows((p) => ({ ...p }))}
          />
          <EditorContent editor={editor} className="rich-editor" style={{ zoom: `${zoomLevel}%` }} />
          
          {showReplace && (
            <div
              className="replace-overlay"
              style={{
                position: 'absolute',
                top: '60px',
                right: '20px',
                backgroundColor: 'var(--bg-main, #ffffff)',
                border: '1px solid var(--border-color, #ccc)',
                padding: '10px',
                borderRadius: '6px',
                display: 'flex',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                zIndex: 100,
                alignItems: 'center',
              }}
            >
              <input
                autoFocus
                placeholder="Find..."
                value={replaceQuery}
                onChange={(e) => setReplaceQuery(e.target.value)}
                style={{ padding: '4px 8px', width: '120px' }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setShowReplace(false);
                    editor.commands.focus();
                  }
                }}
              />
              <input
                placeholder="Replace with..."
                value={replaceWith}
                onChange={(e) => setReplaceWith(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleReplaceAll()}
                style={{ padding: '4px 8px', width: '120px' }}
              />
              <button onClick={handleReplaceAll} style={{ padding: '4px 8px', cursor: 'pointer' }}>
                Replace All
              </button>
              <button
                onClick={() => setShowReplace(false)}
                style={{ padding: '4px 8px', cursor: 'pointer', color: '#ff4d4d' }}
              >
                ✕
              </button>
            </div>
          )}

          <div className="editor-footer">
            <div className="stat">
              Length: <span>{stats.chars}</span>{' '}
              <span style={{ opacity: 0.6, fontWeight: 'normal' }}>(Pos: {cursor.char})</span>
            </div>
            <div className="stat">
              Words: <span>{stats.words}</span>{' '}
              <span style={{ opacity: 0.6, fontWeight: 'normal' }}>(Pos: {cursor.word})</span>
            </div>
            <div className="stat">
              Lines: <span>{stats.lines}</span>{' '}
              <span style={{ opacity: 0.6, fontWeight: 'normal' }}>(Pos: {cursor.line})</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="empty-state">
          {activeTabId ? (
            <span>
              Editor hidden. Press <strong>ENTER</strong> to open.
            </span>
          ) : (
            'Select an item to view/edit content.'
          )}
        </div>
      )}
    </div>
  );
}