// src/components/ExportModal.tsx
import { useState, useEffect } from 'react';
import type { Tab, WindowData } from '../types';
import { open } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
// @ts-ignore - html2pdf doesn't have official TS types
import html2pdf from 'html2pdf.js';

interface ExportModalProps {
  windows: Record<string, WindowData>;
  onClose: () => void;
}

export default function ExportModal({ windows, onClose }: ExportModalProps) {
  const [selectedTabIds, setSelectedTabIds] = useState<Set<string>>(new Set());
  const [exportFileName, setExportFileName] = useState('My_Encyclopedia');
  const [destinationPath, setDestinationPath] = useState<string>('');
  const [exportFormat, setExportFormat] = useState<'txt' | 'json' | 'pdf'>('txt');
  const [isExporting, setIsExporting] = useState(false);

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

  const handleSelectFolder = async () => {
    const selectedFolder = await open({
      directory: true,
      multiple: false,
      title: "Select Export Destination"
    });
    if (selectedFolder) setDestinationPath(selectedFolder as string);
  };

  // --- CUSTOM HTML TO TEXT PARSER ---
  const parseHTMLToText = (html: string) => {
    const container = document.createElement('div');
    container.innerHTML = html;

    // Replace Images
    container.querySelectorAll('img').forEach(img => {
      img.parentNode?.replaceChild(document.createTextNode('[IMAGE]'), img);
    });

    // Replace Links
    container.querySelectorAll('a').forEach(a => {
      const href = a.getAttribute('href');
      // Only append URL if it's an external link
      if (href && href.startsWith('http')) {
        a.parentNode?.replaceChild(document.createTextNode(`${a.textContent} (${href})`), a);
      } else {
        a.parentNode?.replaceChild(document.createTextNode(`${a.textContent}`), a);
      }
    });

    // Replace Task Lists (Checkboxes)
    container.querySelectorAll('ul[data-type="taskList"] li').forEach(li => {
      const checkbox = li.querySelector('input[type="checkbox"]') as HTMLInputElement;
      const isChecked = checkbox?.checked || li.getAttribute('data-checked') === 'true';
      const box = isChecked ? '[x] ' : '[ ] ';
      const label = li.querySelector('label');
      if (label) label.remove();
      li.prepend(document.createTextNode(box));
    });

    // Replace Standard Bullet Lists
    container.querySelectorAll('ul:not([data-type="taskList"]) li').forEach(li => {
      li.prepend(document.createTextNode('* '));
    });

    // Replace Ordered Lists (Numbers & Alpha)
    container.querySelectorAll('ol').forEach(ol => {
      const type = ol.style.listStyleType || ol.getAttribute('type') || 'decimal';
      ol.querySelectorAll(':scope > li').forEach((li, index) => {
        let prefix = `${index + 1}. `;
        if (type.includes('alpha')) {
          prefix = `${String.fromCharCode(97 + index)}. `; // lower-alpha (a, b, c)
        }
        li.prepend(document.createTextNode(prefix));
      });
    });

    // Replace Tables (Advanced multi-line, alignment, and colspan support)
    container.querySelectorAll('table').forEach(table => {
      let rowsData: { lines: string[], colspan: number, align: string, colIndex: number }[][] = [];
      let colWidths: number[] = [];

      // Pass 1: Parse cells, preserve line breaks, and get base column widths
      table.querySelectorAll('tr').forEach((tr) => {
        let rowCells: any[] = [];
        let colIndex = 0;
        
        tr.querySelectorAll('td, th').forEach(cell => {
          let colspan = parseInt(cell.getAttribute('colspan') || '1', 10);
          let align = (cell as HTMLElement).style.textAlign || 'left';
          
          // Preserve line breaks from TipTap's block elements (<p> and <br>)
          let html = cell.innerHTML
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n')
            .replace(/<\/div>/gi, '\n')
            .replace(/<p[^>]*>/gi, '')
            .replace(/<div[^>]*>/gi, '');
          
          let dummy = document.createElement('div');
          dummy.innerHTML = html;
          let text = dummy.textContent || '';
          
          // Split into lines and clean up trailing spaces
          let textLines = text.split('\n')
            .map(l => l.trim())
            .filter((l, i, arr) => l !== '' || arr.length === 1); // keep empty string only if cell is totally empty
            
          if (textLines.length === 0) textLines = [''];

          rowCells.push({ lines: textLines, colspan, align, colIndex });

          // Update column widths (only for single-span cells first to establish a baseline)
          if (colspan === 1) {
            let maxLineLen = Math.max(...textLines.map(l => l.length));
            colWidths[colIndex] = Math.max(colWidths[colIndex] || 0, maxLineLen);
          }
          colIndex += colspan;
        });
        rowsData.push(rowCells);
      });

      // Pass 2: Adjust column widths to safely fit colspan contents if they are wider than the merged columns
      rowsData.forEach(row => {
        row.forEach(cell => {
          if (cell.colspan > 1) {
            let maxLineLen = Math.max(...cell.lines.map((l: string) => l.length));
            let currentSpanWidth = 0;
            // Add up the widths of all columns this cell spans
            for (let i = 0; i < cell.colspan; i++) {
              currentSpanWidth += (colWidths[cell.colIndex + i] || 0);
            }
            // Add the width of the skipped internal dividers (" | " = 3 spaces)
            currentSpanWidth += (cell.colspan - 1) * 3; 
            
            // If the text is still wider than the combined columns, widen the last column
            if (maxLineLen > currentSpanWidth) {
              let extra = maxLineLen - currentSpanWidth;
              colWidths[cell.colIndex + cell.colspan - 1] = (colWidths[cell.colIndex + cell.colspan - 1] || 0) + extra;
            }
          }
        });
      });

      let tableText = '\n';
      
      // Pass 3: Draw the table row by row, line by line
      rowsData.forEach((row, rowIndex) => {
        // Find how many vertical text lines this table row requires
        let maxLines = Math.max(...row.map(c => c.lines.length));
        
        for (let lineIdx = 0; lineIdx < maxLines; lineIdx++) {
          let rowText = '| ';
          
          row.forEach(cell => {
            let text = cell.lines[lineIdx] || ''; // If this cell has fewer lines, print blank space
            
            // Calculate exact character width this cell block is allowed to consume
            let targetWidth = 0;
            for (let i = 0; i < cell.colspan; i++) {
              targetWidth += (colWidths[cell.colIndex + i] || 0);
            }
            targetWidth += (cell.colspan - 1) * 3;

            // Apply Alignment Padding
            let paddedText = '';
            if (cell.align === 'center') {
              let leftPad = Math.floor((targetWidth - text.length) / 2);
              let rightPad = targetWidth - text.length - leftPad;
              paddedText = ' '.repeat(Math.max(0, leftPad)) + text + ' '.repeat(Math.max(0, rightPad));
            } else if (cell.align === 'right') {
              paddedText = text.padStart(targetWidth, ' ');
            } else {
              paddedText = text.padEnd(targetWidth, ' '); // Default Left Align
            }

            rowText += paddedText + ' | ';
          });
          
          tableText += rowText.trimEnd() + '\n';
        }
        
        // Add divider exactly matching the column sizes under the header row
        if (rowIndex === 0 && table.querySelector('th')) {
          let dividerRow = '|';
          colWidths.forEach(w => {
            dividerRow += '-'.repeat(w + 2) + '|';
          });
          tableText += dividerRow + '\n';
        }
      });

      table.parentNode?.replaceChild(document.createTextNode(tableText), table);
    });

    // Add spacing to blocks
    container.querySelectorAll('p, h1, h2, h3').forEach(block => {
      block.appendChild(document.createTextNode('\n\n'));
    });

    return container.textContent?.replace(/\n{3,}/g, '\n\n').trim() || '';
  };

  const handleFinalExport = async () => {
    if (!destinationPath) {
      alert("Please select a destination folder first!");
      return;
    }

    setIsExporting(true);
    const exportList: any[] = [];
    
    // Gather Data
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

    const fullPath = await join(destinationPath, `${exportFileName}.${exportFormat}`);

    try {
      if (exportFormat === 'json') {
        const jsonData = JSON.stringify(exportList, null, 2);
        await writeFile(fullPath, new TextEncoder().encode(jsonData));
      } 
      
      else if (exportFormat === 'txt') {
        let formattedText = `Destination: ${destinationPath}\nFile Name: ${exportFileName}.txt\n\n`;
        formattedText += exportList.map(item => {
          const parsedContent = parseHTMLToText(item.content);
          return `${item.title.toUpperCase()} (Source: ${item.fromParent})\n${parsedContent}\n\n`;
        }).join('\n');
        
        await writeFile(fullPath, new TextEncoder().encode(formattedText));
      }
      
      else if (exportFormat === 'pdf') {
        // Build a temporary HTML wrapper for the PDF engine
        const container = document.createElement('div');
        container.style.padding = '20px';
        container.style.fontFamily = 'Arial, sans-serif';

        // NEW: Inject CSS so tables are drawn correctly in the PDF
        const style = document.createElement('style');
        style.innerHTML = `
          table { border-collapse: collapse; width: 100%; margin: 15px 0; }
          th, td { border: 1px solid #999; padding: 8px; text-align: left; vertical-align: top; }
          th { background-color: #f0f0f0; font-weight: bold; }
          img { max-width: 100%; height: auto; }
        `;
        container.appendChild(style);
        
        const header = document.createElement('h1');
        header.innerText = `Encyclopedia Report: ${exportFileName}`;
        header.style.textAlign = 'center';
        container.appendChild(header);

        exportList.forEach(item => {
          const section = document.createElement('div');
          section.style.marginBottom = '30px';
          section.innerHTML = `
            <h2 style="color: #007acc; border-bottom: 1px solid #ccc; padding-bottom: 5px;">
              ${item.title} <span style="font-size: 12px; color: #888;">(Source: ${item.fromParent})</span>
            </h2>
            <div style="font-size: 14px; line-height: 1.6;">${item.content}</div>
          `;
          container.appendChild(section);
        });

        // Configure PDF Generation
        const opt = {
          margin: 0.5,
          filename: `${exportFileName}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2 },
          jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
        };

        // Generate ArrayBuffer and save via Tauri
        const pdfBytes = await html2pdf().set(opt as any).from(container).output('arraybuffer');
        await writeFile(fullPath, new Uint8Array(pdfBytes));
      }

      alert(`Successfully saved to:\n${fullPath}`);
      onClose();
    } catch (error) {
      console.error("Export Error:", error);
      alert("An error occurred while saving the file. Check the console.");
    } finally {
      setIsExporting(false);
    }
  };

  const ExportTreeNode = ({ winId, depth }: { winId: string; depth: number }) => {
    const win = windows[winId];
    if (!win || win.tabs.length === 0) return null;
    return (
      <div style={{ marginLeft: depth * 15 }}>
        {win.tabs.map(tab => (
          <div key={tab.id}>
            <label className="modal-checkbox-row">
              <input type="checkbox" checked={selectedTabIds.has(tab.id)} onChange={(e) => toggleTabSelection(tab, e.target.checked)} />
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
        <h3 style={{color: 'var(--accent-color)', margin: '0 0 15px 0'}}>Export Configuration</h3>
        
        {/* DESTINATION FOLDER (NEW) */}
        <div className="modal-field">
          <label>Destination Folder</label>
          <div style={{display: 'flex', gap: '10px'}}>
            <input readOnly value={destinationPath} placeholder="Select a folder..." style={{flexGrow: 1}} />
            <button className="confirm-btn" style={{padding: '10px'}} onClick={handleSelectFolder}>Browse</button>
          </div>
        </div>

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
            <button className={exportFormat === 'pdf' ? 'active' : ''} onClick={() => setExportFormat('pdf')}>PDF Report</button>
          </div>
        </div>
        
        <div className="modal-actions">
          <button className="cancel-btn" onClick={onClose} disabled={isExporting}>Cancel</button>
          <button className="confirm-btn" onClick={handleFinalExport} disabled={isExporting}>
            {isExporting ? 'Generating...' : `Save ${selectedTabIds.size} Items`}
          </button>
        </div>
      </div>
    </div>
  );
}