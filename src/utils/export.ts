import JSZip from 'jszip'
import type { Note } from '@/types'

async function fetchImageAsBlob(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return await res.blob()
  } catch {
    return null
  }
}

export async function exportNotesToZip(notes: Note[]): Promise<void> {
  if (notes.length === 0) return
  const zip = new JSZip()
  const imagesFolder = zip.folder('images')
  const multiple = notes.length > 1

  for (const note of notes) {
    const safeName = note.title.replace(/[\\/:*?"<>|]/g, '_') || 'note'
    const lines: string[] = [note.content]
    for (const img of note.imgs) {
      const uniqueName = multiple ? `${safeName}_${img}` : img
      lines.push(`\n![${img}](images/${uniqueName})`)
      const blob = await fetchImageAsBlob(`/assets/${img}`)
      if (blob) imagesFolder?.file(uniqueName, blob)
    }
    zip.file(`${safeName}.md`, lines.join('\n'), { binary: false })
  }

  const label = multiple ? 'notes' : notes[0]!.title.replace(/[\\/:*?"<>|]/g, '_') || 'note'
  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${label}.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function exportNoteToZip(note: Note): Promise<void> {
  return exportNotesToZip([note])
}
