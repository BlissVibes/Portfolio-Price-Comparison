import { useRef, useState } from 'react';
import type { DragEvent, ChangeEvent } from 'react';

interface Props {
  onFiles: (files: File[]) => void;
}

export default function FileDropZone({ onFiles }: Props) {
  const [dragging, setDragging] = useState(false);
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

  return (
    <div
      className={`drop-zone ${dragging ? 'drop-zone--active' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        multiple
        style={{ display: 'none' }}
        onChange={handleChange}
      />
      <div className="drop-zone__icon">📂</div>
      <p className="drop-zone__text">
        Drop Collectr CSV exports here, or <span className="drop-zone__link">browse</span>
      </p>
      <p className="drop-zone__hint">Upload multiple exports to compare prices over time</p>
    </div>
  );
}
