import { useRef, useState } from 'react'
import type { DragEvent, ChangeEvent } from 'react'

interface Props {
  onFile: (file: File) => void
  accept: string
  label: string
  sublabel?: string
  optional?: boolean
}

export function UploadZone({ onFile, accept, label, sublabel, optional }: Props) {
  const [dragging, setDragging] = useState(false)
  const [filename, setFilename] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) { setFilename(file.name); onFile(file) }
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) { setFilename(file.name); onFile(file) }
  }

  return (
    <div
      className={`upload-zone${dragging ? ' dragging' : ''}${filename ? ' has-file' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={handleChange}
      />
      <div className="upload-icon">{filename ? '✓' : '↑'}</div>
      <div className="upload-label">{filename ?? label}</div>
      {!filename && sublabel && <div className="upload-sublabel">{sublabel}</div>}
      {optional && !filename && <div className="upload-optional">необязательно</div>}
    </div>
  )
}
