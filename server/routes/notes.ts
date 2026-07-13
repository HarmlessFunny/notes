import { Router } from 'express'
import type { Request, Response } from 'express'
import { existsSync, unlinkSync } from 'fs'
import path from 'path'
import {
  fetchAllNotes, fetchNotesByDay, searchNotes, fetchNotesByTitles,
  addNote, updateNote, deleteNotes, getUploadsFolder
} from '../services/database.js'
import { saveImages } from '../services/noteFile.js'
import { sendSuccess, sendError } from '../middleware/apiResponse.js'
import { validateRequiredFields } from '../middleware/validate.js'

function sanitizeImageName(title: string): string {
  return title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 30) || `note_${Date.now()}`
}

// ========== /api/notes ==========

export const notesRouter = Router()

notesRouter.get('/', (_req: Request, res: Response) => {
  sendSuccess(res, { notes: fetchAllNotes() })
})

notesRouter.get('/search', (req: Request, res: Response) => {
  const keyword = (req.query.q as string || '').trim()
  sendSuccess(res, { notes: searchNotes(keyword) })
})

notesRouter.get('/:someday', (req: Request, res: Response) => {
  sendSuccess(res, { notes: fetchNotesByDay(req.params.someday as string) })
})

notesRouter.post('/batch', (req: Request, res: Response) => {
  const titles: string[] = req.body?.titles || []
  sendSuccess(res, { notes: fetchNotesByTitles(titles) })
})

notesRouter.delete('/delete', (req: Request, res: Response) => {
  const titles: string[] = req.body?.titles || []
  if (titles.length === 0) {
    sendError(res, '请选择要删除的笔记')
    return
  }
  const count = deleteNotes(titles)
  sendSuccess(res, { message: `已删除 ${count} 篇笔记`, deleted_count: count })
})

// ========== /api/note/:title ==========

export const noteRouter = Router()

noteRouter.get('/:title', (req: Request, res: Response) => {
  const result = fetchNotesByTitles([req.params.title as string])
  if (result.length > 0) {
    sendSuccess(res, { note: result[0] })
  } else {
    sendError(res, '笔记不存在', 404)
  }
})

noteRouter.put('/:title', validateRequiredFields(['title', 'subject']), (req: Request, res: Response) => {
  const oldTitle = req.params.title as string
  const newTitle = (req.body?.title || '').trim()
  const subject = (req.body?.subject || '').trim()
  const content = (req.body?.content || '').trim()

  const existingImages: string[] = req.body?.existing_images
    ? (typeof req.body.existing_images === 'string'
      ? JSON.parse(req.body.existing_images)
      : req.body.existing_images)
    : []

  const files: Express.Multer.File[] = (req.files as Express.Multer.File[]) || []
  const safeTitle = sanitizeImageName(newTitle)
  const savedImages = [...existingImages, ...saveImages(files, safeTitle)]

  const oldResult = fetchNotesByTitles([oldTitle])
  const oldImgs: string[] = oldResult.length > 0 ? (oldResult[0].imgs || []) : []

  const err = updateNote(oldTitle, newTitle, subject, content, savedImages)
  if (err) {
    sendError(res, err)
    return
  }

  const uploadsFolder = getUploadsFolder()
  for (const img of oldImgs) {
    if (!savedImages.includes(img)) {
      const imgPath = path.join(uploadsFolder, img)
      if (existsSync(imgPath)) unlinkSync(imgPath)
    }
  }

  sendSuccess(res, { message: '笔记更新成功' })
})

// ========== /api/submit ==========

export const submitRouter = Router()

submitRouter.post('/', validateRequiredFields(['title', 'subject']), (req: Request, res: Response) => {
  const title = (req.body?.title || '').trim()
  const subject = (req.body?.subject || '').trim()
  const timestamp = (req.body?.timestamp || '').trim() || String(Date.now())
  const content = (req.body?.content || '').trim()

  const files: Express.Multer.File[] = (req.files as Express.Multer.File[]) || []
  const safeTitle = sanitizeImageName(title)
  const savedImages = saveImages(files, safeTitle)

  const err = addNote({ title, subject, time: timestamp }, content, savedImages)
  if (err) {
    const uploadsFolder = getUploadsFolder()
    for (const img of savedImages) {
      const imgPath = path.join(uploadsFolder, img)
      if (existsSync(imgPath)) unlinkSync(imgPath)
    }
    sendError(res, err)
    return
  }

  sendSuccess(res, {
    message: '笔记发布成功',
    data: { title, subject, time: timestamp, imgs: savedImages }
  })
})
