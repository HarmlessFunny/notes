import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import path from 'path'
import type { Note, DbData, ChatMessage } from '../types/index.js'
import { readNoteFile, readNoteImgs, saveNoteFile, getContentCache, refreshContentCache as _refreshContentCache } from './noteFile.js'

function refreshContentCache(): void {
  _refreshContentCache(loadDatabase().notes)
}

const REVIEW_INTERVAL_DAYS = [0, 1, 2, 4, 7, 15, 30, 60, 120, 240]

let _baseDir = ''
let _dbFile = ''
let _notesFolder = ''
let _uploadsFolder = ''

export function getBaseDir(): string { return _baseDir }
export function getNotesFolder(): string { return _notesFolder }
export function getUploadsFolder(): string { return _uploadsFolder }
export function getDbFile(): string { return _dbFile }
export function getReviewIntervalDays(): number[] { return REVIEW_INTERVAL_DAYS }

export function initDatabase(baseDir: string): void {
  _baseDir = baseDir
  _dbFile = path.join(baseDir, 'database.json')
  _notesFolder = path.join(baseDir, 'notes')
  _uploadsFolder = path.join(baseDir, 'uploads', 'images')

  mkdirSync(_uploadsFolder, { recursive: true })
  mkdirSync(_notesFolder, { recursive: true })

  if (!existsSync(_dbFile)) {
    writeFileSync(_dbFile, JSON.stringify({ notes: [], ai_chat: [] }, null, 2), 'utf-8')
  }

  refreshContentCache()
}

export function daysDifference(laterTimestamp: string, earlierTimestamp: string): number {
  const d1 = new Date(Number(laterTimestamp)).setHours(0, 0, 0, 0)
  const d2 = new Date(Number(earlierTimestamp)).setHours(0, 0, 0, 0)
  return Math.round((d1 - d2) / 86400000)
}

export function filterByDaysDifference(notes: Note[], targetTimestamp: string, targetDiffs: number[]): Note[] {
  const diffSet = new Set(targetDiffs)
  return notes.filter(n => diffSet.has(daysDifference(targetTimestamp, n.time)))
}

export function loadDatabase(): DbData {
  try {
    const raw = readFileSync(_dbFile, 'utf-8')
    const data = JSON.parse(raw) as DbData
    if (!data.ai_chat) {
      data.ai_chat = []
      saveDatabase(data)
    }
    return data
  } catch {
    return { notes: [], ai_chat: [] }
  }
}

export function saveDatabase(data: DbData): void {
  writeFileSync(_dbFile, JSON.stringify(data, null, 2), 'utf-8')
}

export function fetchAllNotes(): Note[] {
  return loadDatabase().notes
}

export function fetchNotesByDay(someday: string): Note[] {
  return filterByDaysDifference(loadDatabase().notes, someday, REVIEW_INTERVAL_DAYS)
}

export function searchNotes(keyword: string): Note[] {
  if (!keyword.trim()) return []
  const q = keyword.trim().toLowerCase()
  const cache = getContentCache()
  return loadDatabase().notes.filter(n =>
    n.title.toLowerCase().includes(q) ||
    n.subject.toLowerCase().includes(q) ||
    (cache.get(n.title) || '').toLowerCase().includes(q)
  )
}

export function fetchNotesByTitles(titles: string[]): Note[] {
  if (titles.length === 0) return []
  const titleSet = new Set(titles)
  const matched = loadDatabase().notes.filter(n => titleSet.has(n.title))
  for (const n of matched) {
    n.content = readNoteFile(n.title)
    n.imgs = readNoteImgs(n.title)
  }
  return matched
}

export function addNote(note: Note, content: string, imgs: string[]): string | null {
  const err = validateTitle(note.title)
  if (err) return err

  const dbData = loadDatabase()
  if (dbData.notes.some(n => n.title === note.title)) {
    return `标题「${note.title}」已存在，请更换标题`
  }

  dbData.notes.push({ title: note.title, subject: note.subject, time: note.time })
  saveDatabase(dbData)
  saveNoteFile(note.title, note.subject, content, imgs)
  return null
}

export function updateNote(oldTitle: string, newTitle: string, subject: string, content: string, imgs: string[]): string | null {
  const err = validateTitle(newTitle)
  if (err) return err

  const dbData = loadDatabase()
  const idx = dbData.notes.findIndex(n => n.title === oldTitle)
  if (idx === -1) return '笔记不存在'

  if (newTitle !== oldTitle) {
    const duplicate = dbData.notes.some((n, i) => i !== idx && n.title === newTitle)
    if (duplicate) return `标题「${newTitle}」已存在，请更换标题`
  }

  const titleChanged = newTitle !== oldTitle
  dbData.notes[idx].title = newTitle
  dbData.notes[idx].subject = subject
  saveDatabase(dbData)

  saveNoteFile(newTitle, subject, content, imgs)

  if (titleChanged) {
    getContentCache().delete(oldTitle)
    const oldMd = path.join(_notesFolder, `${oldTitle}.md`)
    if (existsSync(oldMd)) unlinkSync(oldMd)
  }

  return null
}

export function deleteNotes(titles: string[]): number {
  if (titles.length === 0) return 0
  const dbData = loadDatabase()
  const titleSet = new Set(titles)

  const toDelete = dbData.notes.filter(n => titleSet.has(n.title))
  for (const note of toDelete) {
    const imgs = readNoteImgs(note.title)
    for (const img of imgs) {
      const imgPath = path.join(_uploadsFolder, img)
      if (existsSync(imgPath)) unlinkSync(imgPath)
    }
    const mdPath = path.join(_notesFolder, `${note.title}.md`)
    if (existsSync(mdPath)) unlinkSync(mdPath)
  }

  dbData.notes = dbData.notes.filter(n => !titleSet.has(n.title))
  saveDatabase(dbData)
  refreshContentCache()
  return toDelete.length
}

// ========== AI Chat History ==========

export function fetchAiChat(): ChatMessage[] {
  return loadDatabase().ai_chat || []
}

export function saveAiChat(messages: ChatMessage[]): void {
  const dbData = loadDatabase()
  dbData.ai_chat = messages
  saveDatabase(dbData)
}

export function deleteAiChat(): void {
  const dbData = loadDatabase()
  dbData.ai_chat = []
  saveDatabase(dbData)
}

// ========== Validation ==========

const _ILLEGAL_TITLE_CHARS = /[\\/:*?"<>|]/

export function validateTitle(title: string): string | null {
  if (!title.trim()) return '标题不能为空'
  if (_ILLEGAL_TITLE_CHARS.test(title)) return '标题不能包含以下字符：\\ / : * ? " < > |'
  if (title.length > 200) return '标题过长（最多 200 字符）'
  return null
}
