import { useRef, useState } from 'react';
import type { DragEvent, ChangeEvent } from 'react';

interface Props {
  onFiles: (files: File[]) => void;
  onText: (content: string) => void;
}

export default function FileDropZone({ onFiles, onText }: Props) {
  const [dragging, setDragging] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.name.endsWith('.csv'));
    if (files.length) onFiles(files);
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length) onFiles(files);
    e.target.value = '';
  }

  async function handlePasteFromClipboard(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const text = await navigator.clipboard.readText();
      setPasteText(text);
    } catch {
      // Clipboard API unavailable — user can paste manually into the textarea
    }
  }

  function handleImport(e: React.MouseEvent) {
    e.stopPropagation();
    const trimmed = pasteText.trim();
    if (!trimmed) return;
    onText(trimmed);
    setPasteText('');
    setShowPaste(false);
  }

  return (
    <div
      className={`drop-zone ${dragging ? 'drop-zone--active' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        multiple
        style={{ display: 'none' }}
        onChange={handleChange}
      />

      <div className="drop-zone__main" onClick={() => inputRef.current?.click()}>
        <div className="drop-zone__icon">📂</div>
        <p className="drop-zone__text">
          Drop TCGPlayer or Collectr CSV exports here, or <span className="drop-zone__link">browse</span>
        </p>
        <p className="drop-zone__hint">Upload multiple exports to compare prices over time</p>
      </div>

      <button
        type="button"
        className={`drop-zone__paste-toggle${showPaste ? ' drop-zone__paste-toggle--active' : ''}`}
        onClick={(e) => { e.stopPropagation(); setShowPaste((s) => !s); }}
      >
        {showPaste ? 'cancel' : 'or paste a TCGPlayer text export'}
      </button>

      {showPaste && (
        <div className="drop-zone__paste-area" onClick={(e) => e.stopPropagation()}>
          <textarea
            className="drop-zone__paste-textarea"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste your TCGPlayer text export here..."
            rows={6}
          />
          <div className="drop-zone__paste-actions">
            <button
              type="button"
              className="drop-zone__paste-btn"
              onClick={handlePasteFromClipboard}
            >
              Paste from clipboard
            </button>
            <button
              type="button"
              className="drop-zone__paste-btn drop-zone__paste-btn--primary"
              onClick={handleImport}
              disabled={!pasteText.trim()}
            >
              Import
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
