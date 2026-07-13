import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import path from 'path'
import type { Note } from '../types/index.js'
import { getNotesFolder, getUploadsFolder } from './database.js'

const _IMG_REF_PATTERN = /!\[[^\]]*\]\(\.\.\/uploads\/images\/[^)]+\)/g
const _IMG_NAME_PATTERN = /!\[[^\]]*\]\(\.\.\/uploads\/images\/([^)]+)\)/g

const _contentCache: Map<string, string> = new Map()

export function getContentCache(): Map<string, string> {
  return _contentCache
}

export function refreshContentCache(notes: Note[]): void {
  _contentCache.clear()
  for (const note of notes) {
    _contentCache.set(note.title, readNoteFile(note.title))
  }
}

export function saveNoteFile(title: string, subject: string, content: string, imgs: string[]): void {
  const header = `# ${subject}/${title}`
  const parts: string[] = []
  if (content) parts.push(content)
  for (const img of imgs) {
    parts.push(`![图片](../uploads/images/${img})`)
  }
  const fileContent = header + '\n' + parts.join('\n')
  writeFileSync(path.join(getNotesFolder(), `${title}.md`), fileContent, 'utf-8')
  _contentCache.set(title, content ? content.replace(_IMG_REF_PATTERN, '') : '')
}

export function readNoteFile(title: string): string {
  const notesFolder = getNotesFolder()
  const filePath = path.join(notesFolder, `${title}.md`)
  if (!existsSync(filePath)) return ''
  const raw = readFileSync(filePath, 'utf-8')
  const newlineIdx = raw.indexOf('\n')
  const body = newlineIdx !== -1 ? raw.slice(newlineIdx + 1) : raw
  return body.replace(_IMG_REF_PATTERN, '')
}

export function readNoteImgs(title: string): string[] {
  const notesFolder = getNotesFolder()
  const filePath = path.join(notesFolder, `${title}.md`)
  if (!existsSync(filePath)) return []
  const raw = readFileSync(filePath, 'utf-8')
  const matches: string[] = []
  let m: RegExpExecArray | null
  const re = new RegExp(_IMG_NAME_PATTERN.source, 'g')
  while ((m = re.exec(raw)) !== null) {
    matches.push(m[1])
  }
  return matches
}

export function saveImages(files: Express.Multer.File[], safeTitle: string): string[] {
  const saved: string[] = []
  for (let idx = 0; idx < files.length; idx++) {
    const file = files[idx]
    const ext = path.extname(file.originalname).toLowerCase()
    let filename = files.length === 1 ? `${safeTitle}${ext}` : `${safeTitle}_${idx + 1}${ext}`
    const original = filename
    let counter = 1
    const uploadsFolder = getUploadsFolder()
    while (existsSync(path.join(uploadsFolder, filename))) {
      const parsed = path.parse(original)
      filename = `${parsed.name}_${counter}_${Date.now()}${parsed.ext}`
      counter++
    }
    writeFileSync(path.join(uploadsFolder, filename), file.buffer)
    saved.push(filename)
  }
  return saved
}

export function deleteNoteFiles(title: string): void {
  const notesFolder = getNotesFolder()
  const mdPath = path.join(notesFolder, `${title}.md`)
  if (existsSync(mdPath)) unlinkSync(mdPath)
  _contentCache.delete(title)
}
