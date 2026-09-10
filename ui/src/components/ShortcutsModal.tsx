
interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ShortcutsModal({ isOpen, onClose }: ShortcutsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="export-modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ color: 'var(--accent-color)', margin: '0 0 15px 0' }}>
          Keyboard Shortcuts
        </h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '15px',
            fontSize: '13px',
            color: 'var(--text-main)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span><strong>Encyclopedia control shortcuts</strong></span>
            <span><strong>ARROWS:</strong> Navigate tabs</span>
            <span><strong>ENTER:</strong> Open/Activate tab</span>
            <span><strong>CTRL+E:</strong> Focus/Unfocus Editor</span>
            <span><strong>CTRL+A:</strong> Add Child Tab</span>
            <span><strong>F2:</strong> Rename Tab</span>
            <span><strong>DEL:</strong> Delete Tab</span>
            <span><strong>Double click vertical border:</strong> Minimize/Expand library</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span><strong>Editor control shortcuts</strong></span>
            <span><strong>CTRL+SPACE:</strong> Toggle Checkbox List</span>
            <span><strong>CTRL+1:</strong> Check/Uncheck Item</span>
            <span><strong>CTRL+F:</strong> Find tabs/content</span>
            <span><strong>CTRL+R:</strong> Find & Replace</span>
            <span><strong>CTRL+Scroll:</strong> Zoom In/Out Editor</span>
            <span><strong>SHIFT+ALT+Up/Down:</strong> Move text line</span>
            <span><strong>CTRL+B:</strong> Bold text</span>
            <span><strong>CTRL+I:</strong> Italic text</span>
            <span><strong>CTRL+U:</strong> Underline text</span>
          </div>
        </div>
        <div className="modal-actions" style={{ marginTop: '25px' }}>
          <button className="confirm-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}