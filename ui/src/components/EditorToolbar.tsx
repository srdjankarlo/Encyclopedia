// src/components/EditorToolbar.tsx
import { useState } from 'react';
import { Editor } from '@tiptap/react';
import { 
  Heading1, Heading2, Heading3, Type, Bold, Italic, Strikethrough, 
  List, ListOrdered, Image as ImageIcon, Table as TableIcon, 
  Trash2, Link as LinkIcon, CheckSquare, MinusSquare,
  AlignLeft, AlignCenter, AlignRight,
  ArrowUpToLine, ArrowDownToLine, FoldVertical, Palette,
  Underline as UnderlineIcon, Baseline
} from 'lucide-react';
import type { WindowData, SaveStatus } from '../types';

interface EditorToolbarProps {
  editor: Editor;
  windows: Record<string, WindowData>;
  saveStatus: SaveStatus;
  lastSaved: string | null;
  handleManualRetry: () => void;
}

// NEW: Helper component to group buttons with a title
const Section = ({ title, children }: { title: string, children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
    <span style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 'bold' }}>{title}</span>
    <div className="tool-group">{children}</div>
  </div>
);

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
      <div className="tools" style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'flex-start' }}>
        
        <Section title="Text Size/Style">
          <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={editor.isActive('heading', { level: 1 }) ? 'is-active' : ''} title="Heading 1"><Heading1 size={18} /></button>
          <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={editor.isActive('heading', { level: 2 }) ? 'is-active' : ''} title="Heading 2"><Heading2 size={18} /></button>
          <button onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={editor.isActive('heading', { level: 3 }) ? 'is-active' : ''} title="Heading 3"><Heading3 size={18} /></button>
          <button onClick={() => editor.chain().focus().setParagraph().run()} className={editor.isActive('paragraph') ? 'is-active' : ''} title="Paragraph"><Type size={18} /></button>
        </Section>

        <div className="tool-separator" style={{ height: '32px', margin: '10px 0' }} />

        <Section title="Format Text">
          <button onClick={() => editor.chain().focus().toggleBold().run()} className={editor.isActive('bold') ? 'is-active' : ''} title="Bold"><Bold size={18} /></button>
          <button onClick={() => editor.chain().focus().toggleItalic().run()} className={editor.isActive('italic') ? 'is-active' : ''} title="Italic"><Italic size={18} /></button>
          <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={editor.isActive('underline') ? 'is-active' : ''} title="Underline"><UnderlineIcon size={18} /></button>
          <button onClick={() => editor.chain().focus().toggleStrike().run()} className={editor.isActive('strike') ? 'is-active' : ''} title="Strike"><Strikethrough size={18} /></button>
          <div className="color-picker-wrapper">
            <input type="color" onInput={e => editor.chain().focus().setColor((e.target as HTMLInputElement).value).run()} value={editor.getAttributes('textStyle').color || '#000000'} title="Text Color" />
          </div>
          <div className="color-picker-wrapper">
            <input type="color" onInput={e => editor.chain().focus().toggleHighlight({ color: (e.target as HTMLInputElement).value }).run()} value={editor.getAttributes('highlight').color || '#ffff00'} title="Background Color" />
          </div>
        </Section>

        <div className="tool-separator" style={{ height: '32px', margin: '10px 0' }} />

        <Section title="Lists">
          <button onClick={() => editor.chain().focus().toggleTaskList().run()} className={editor.isActive('taskList') ? 'is-active' : ''} title="Checklist"><CheckSquare size={18} /></button>
          <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={editor.isActive('bulletList') ? 'is-active' : ''} title="Bullet List"><List size={18} /></button>
          <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={editor.isActive('orderedList', { listStyleType: 'decimal' }) ? 'is-active' : ''} title="Numbered List"><ListOrdered size={18} /></button>
          <button onClick={() => editor.chain().focus().toggleOrderedList().updateAttributes('orderedList', { listStyleType: 'lower-alpha' }).run()} className={editor.isActive('orderedList', { listStyleType: 'lower-alpha' }) ? 'is-active' : ''} title="Alphabet List"><Baseline size={18} /></button>
        </Section>

        <div className="tool-separator" style={{ height: '32px', margin: '10px 0' }} />

        <Section title="Pictures">
          <button onClick={() => document.getElementById('image-upload')?.click()} title="Upload Image"><ImageIcon size={18} /></button>
          <input id="image-upload" type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
        </Section>

        <div className="tool-separator" style={{ height: '32px', margin: '10px 0' }} />

        <Section title="Links">
          <button onClick={addInternalLink} className={editor.isActive('link') ? 'is-active' : ''} title="Add Wiki Link"><LinkIcon size={18} /></button>
        </Section>

        <div className="tool-separator" style={{ height: '32px', margin: '10px 0' }} />

        <Section title="Tables">
          {/* Main Outer Row */}
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            
            {/* 1. Table icon on its own */}
            <button onClick={() => editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run()} title="Insert Table">
              <TableIcon size={18} />
            </button>

            {editor.isActive('table') && (
              <>
                {/* 2. Alignment Block (Horizontal on top, Vertical below) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => editor.chain().focus().setTextAlign('left').run()} className={editor.isActive({ textAlign: 'left' }) ? 'is-active' : ''} title="Align Left"><AlignLeft size={18} /></button>
                    <button onClick={() => editor.chain().focus().setTextAlign('center').run()} className={editor.isActive({ textAlign: 'center' }) ? 'is-active' : ''} title="Align Center"><AlignCenter size={18} /></button>
                    <button onClick={() => editor.chain().focus().setTextAlign('right').run()} className={editor.isActive({ textAlign: 'right' }) ? 'is-active' : ''} title="Align Right"><AlignRight size={18} /></button>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => editor.chain().focus().setCellAttribute('verticalAlign', 'top').run()} className={editor.isActive('tableCell', { verticalAlign: 'top' }) ? 'is-active' : ''} title="Align Top"><ArrowUpToLine size={18} /></button>
                    <button onClick={() => editor.chain().focus().setCellAttribute('verticalAlign', 'middle').run()} className={editor.isActive('tableCell', { verticalAlign: 'middle' }) ? 'is-active' : ''} title="Align Middle"><FoldVertical size={18} /></button>
                    <button onClick={() => editor.chain().focus().setCellAttribute('verticalAlign', 'bottom').run()} className={editor.isActive('tableCell', { verticalAlign: 'bottom' }) ? 'is-active' : ''} title="Align Bottom"><ArrowDownToLine size={18} /></button>
                  </div>
                </div>

                {/* 3. Cell color on its own */}
                <label className="color-picker-btn" title="Cell Color" style={{ display: 'flex', alignItems: 'center' }}>
                  <Palette size={18} />
                  <input type="color" onChange={(e) => editor.chain().focus().setCellAttribute('backgroundColor', e.target.value).run()} style={{ opacity: 0, position: 'absolute', width: '0' }} />
                </label>

                {/* 4. Matrix Block (Columns on top, Rows below) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => editor.chain().focus().addColumnBefore().run()} title="Add Column Before">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="6" height="16" fill="currentColor" /><rect x="3" y="4" width="18" height="16" /><line x1="15" y1="4" x2="15" y2="20" /></svg>
                    </button>
                    <button onClick={() => editor.chain().focus().addColumnAfter().run()} title="Add Column After">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><rect x="15" y="4" width="6" height="16" fill="currentColor" /><rect x="3" y="4" width="18" height="16" /><line x1="9" y1="4" x2="9" y2="20" /></svg>
                    </button>
                    <button onClick={() => editor.chain().focus().deleteColumn().run()} title="Delete Column" style={{color: '#ff4d4d'}}><MinusSquare size={18} /></button>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => editor.chain().focus().addRowBefore().run()} title="Add Row Before">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="3" width="16" height="6" fill="currentColor" /><rect x="4" y="3" width="16" height="18" /><line x1="4" y1="15" x2="20" y2="15" /></svg>
                    </button>
                    <button onClick={() => editor.chain().focus().addRowAfter().run()} title="Add Row After">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="15" width="16" height="6" fill="currentColor" /><rect x="4" y="3" width="16" height="18" /><line x1="4" y1="9" x2="20" y2="9" /></svg>
                    </button>
                    <button onClick={() => editor.chain().focus().deleteRow().run()} title="Delete Row" style={{color: '#ff4d4d'}}><MinusSquare size={18} /></button>
                  </div>
                </div>

                {/* 5. Merge, split, delete in one straight row at the end */}
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <button onClick={() => editor.chain().focus().mergeCells().run()} disabled={!editor.can().mergeCells()} title="Merge Selected Cells">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="3" y1="12" x2="21" y2="12" strokeDasharray="4 4" opacity="0.5" /></svg>
                  </button>
                  <button onClick={() => editor.chain().focus().splitCell().run()} disabled={!editor.can().splitCell()} title="Split Cell">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="12" y1="3" x2="12" y2="21" /></svg>
                  </button>
                  <button onClick={() => editor.chain().focus().deleteTable().run()} style={{color: '#ff4d4d'}} title="Delete Table"><Trash2 size={18} /></button>
                </div>
              </>
            )}
          </div>
        </Section>
        
        {/* Link Search Modal overlay */}
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