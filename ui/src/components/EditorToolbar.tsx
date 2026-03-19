// src/components/EditorToolbar.tsx
import { useState } from 'react';
import { Editor } from '@tiptap/react';
import { 
  Heading1, Heading2, Heading3, Type, Bold, Italic, Strikethrough, 
  List, ListOrdered, Image as ImageIcon, Table as TableIcon, 
  Columns, Rows, Trash2, Link as LinkIcon, CheckSquare, MinusSquare
} from 'lucide-react';
import type { WindowData, SaveStatus } from '../types';

interface EditorToolbarProps {
  editor: Editor;
  windows: Record<string, WindowData>;
  saveStatus: SaveStatus;
  lastSaved: string | null;
  handleManualRetry: () => void;
}

export default function EditorToolbar({ editor, windows, saveStatus, lastSaved, handleManualRetry }: EditorToolbarProps) {
  const [linkSearch, setLinkSearch] = useState({ active: false, query: '' });

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        (editor.chain().focus() as any).setImage({src: base64}).run();
      };
      reader.readAsDataURL(file);
    }
  };

  const addInternalLink = () => {
    if (linkSearch.active) {
      setLinkSearch({ active: false, query: '' });
      return;
    }
    if (!editor.state.selection.empty) {
      setLinkSearch({ active: true, query: '' });
    } else {
      alert("Please highlight some text first to create a link!");
    }
  };

  return (
    <div className="editor-toolbar">
      <div className="tools">
        <div className="tool-group">
          <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={editor.isActive('heading', { level: 1 }) ? 'is-active' : ''} title="Heading 1"><Heading1 size={18} /></button>
          <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={editor.isActive('heading', { level: 2 }) ? 'is-active' : ''} title="Heading 2"><Heading2 size={18} /></button>
          <button onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={editor.isActive('heading', { level: 3 }) ? 'is-active' : ''} title="Heading 3"><Heading3 size={18} /></button>
          <button onClick={() => editor.chain().focus().setParagraph().run()} className={editor.isActive('paragraph') ? 'is-active' : ''} title="Paragraph"><Type size={18} /></button>
          
          <div className="tool-separator" />

          <button onClick={() => editor.chain().focus().toggleBold().run()} className={editor.isActive('bold') ? 'is-active' : ''} title="Bold"><Bold size={18} /></button>
          <button onClick={() => editor.chain().focus().toggleItalic().run()} className={editor.isActive('italic') ? 'is-active' : ''} title="Italic"><Italic size={18} /></button>
          <button onClick={() => editor.chain().focus().toggleStrike().run()} className={editor.isActive('strike') ? 'is-active' : ''} title="Strike"><Strikethrough size={18} /></button>

          <div className="tool-separator" />

          <button onClick={() => editor.chain().focus().toggleTaskList().run()} className={editor.isActive('taskList') ? 'is-active' : ''} title="Checklist"><CheckSquare size={18} /></button>
          <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={editor.isActive('bulletList') ? 'is-active' : ''} title="Bullet List"><List size={18} /></button>
          <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={editor.isActive('orderedList') ? 'is-active' : ''} title="Numbered List"><ListOrdered size={18} /></button>

          <div className="tool-separator" />

          <button onClick={() => document.getElementById('image-upload')?.click()} title="Upload Image"><ImageIcon size={18} /></button>
          <input id="image-upload" type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
          
          <button onClick={() => editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run()} title="Insert Table"><TableIcon size={18} /></button>
          <button onClick={addInternalLink} className={editor.isActive('link') ? 'is-active' : ''} title="Add Wiki Link"><LinkIcon size={18} /></button>

          {editor.isActive('table') && (
            <>
              <div className="tool-separator" />
              <button onClick={() => editor.chain().focus().addColumnBefore().run()} title="Add Column Before"><Columns size={18} /></button>
              <button onClick={() => editor.chain().focus().addColumnAfter().run()} title="Add Column After"><Columns size={18} /></button>
              <button onClick={() => editor.chain().focus().deleteColumn().run()} title="Delete Column" style={{color: '#ff4d4d'}}><MinusSquare size={18} /></button>
              <div className="tool-separator" />
              <button onClick={() => editor.chain().focus().addRowBefore().run()} title="Add Row Before"><Rows size={18} /></button>
              <button onClick={() => editor.chain().focus().addRowAfter().run()} title="Add Row After"><Rows size={18} /></button>
              <button onClick={() => editor.chain().focus().deleteRow().run()} title="Delete Row" style={{color: '#ff4d4d'}}><MinusSquare size={18} /></button>
              <div className="tool-separator" />
              <button onClick={() => editor.chain().focus().deleteTable().run()} style={{color: '#ff4d4d'}} title="Delete Table"><Trash2 size={18} /></button>
            </>
          )}

          {linkSearch.active && (
            <div className="wiki-link-search">
              <input 
                autoFocus placeholder="Search tabs..." value={linkSearch.query}
                onChange={(e) => setLinkSearch({ ...linkSearch, query: e.target.value })}
                onKeyDown={(e) => e.key === 'Escape' && setLinkSearch({ active: false, query: '' })}
              />
              <div className="search-results">
                {Object.values(windows).flatMap(w => w.tabs)
                  .filter(t => t.title.toLowerCase().includes(linkSearch.query.toLowerCase())).slice(0, 5)
                  .map(t => (
                    <div key={t.id} className="search-item" onClick={() => {
                      editor.chain().focus().extendMarkRange('wikiLink').setMark('wikiLink', { tabId: t.id }).run();
                      setLinkSearch({ active: false, query: '' });
                    }}>
                      {t.title}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="sync-indicator-container">
        <div className={`sync-indicator ${saveStatus}`}>
          {saveStatus === 'saving' && "● Syncing..."}
          {saveStatus === 'saved' && <div className="saved-group"><span>✓ Saved</span>{lastSaved && <span className="save-time">at {lastSaved}</span>}</div>}
          {saveStatus === 'error' && <div className="error-group"><span>⚠ Sync Error</span><button className="retry-sync-btn" onClick={handleManualRetry}>Retry</button></div>}
        </div>
      </div>
    </div>
  );
}