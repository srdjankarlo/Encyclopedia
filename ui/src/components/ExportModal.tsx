// src/components/ExportModal.tsx
import { useState, useEffect } from 'react';
import type { Tab, WindowData } from '../types';

interface ExportModalProps {
  windows: Record<string, WindowData>;
  onClose: () => void;
}

export default function ExportModal({ windows, onClose }: ExportModalProps) {
  const [selectedTabIds, setSelectedTabIds] = useState<Set<string>>(new Set());
  const [exportFileName, setExportFileName] = useState('My_Encyclopedia');
  const [exportFormat, setExportFormat] = useState<'txt' | 'json'>('txt');

  // Select all tabs by default on mount
  useEffect(() => {
    setSelectedTabIds(new Set(Object.values(windows).flatMap(w => w.tabs.map(t => t.id))));
  }, [windows]);

  const toggleTabSelection = (tab: Tab, selected: boolean) => {
    const next = new Set(selectedTabIds);
    const walk = (tId: string) => {
      selected ? next.add(tId) : next.delete(tId);
      if (windows[tId]) windows[tId].tabs.forEach(child => walk(child.id));
    };
    walk(tab.id);
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
            id: tab.id, title: tab.title, content: tab.content,
            depth, fromParent: parentTitle, createdAt: tab.createdAt
          });
          if (windows[tab.id]) walk(tab.id, depth + 1, tab.title);
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
    onClose();
  };

  // Recursive component for the tree view
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
            {windows[tab.id] && <ExportTreeNode winId={tab.id} depth={depth + 1} />}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
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
          <button className="cancel-btn" onClick={onClose}>Cancel</button>
          <button className="confirm-btn" onClick={handleFinalExport}>Download {selectedTabIds.size} Items</button>
        </div>
      </div>
    </div>
  );
}