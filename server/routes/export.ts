import { Router } from 'express'
import type { Request, Response } from 'express'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import AdmZip from 'adm-zip'
import { fetchNotesByTitles, getUploadsFolder } from '../services/database.js'
import { sendError } from '../middleware/apiResponse.js'

export const exportRouter = Router()

exportRouter.get('/', (req: Request, res: Response) => {
  const titlesParam = req.query.titles
  const titles: string[] = Array.isArray(titlesParam) ? titlesParam as string[] : [titlesParam as string].filter(Boolean)

  if (titles.length === 0) {
    sendError(res, '请选择要导出的笔记', 400)
    return
  }

  const notes = fetchNotesByTitles(titles)
  if (notes.length === 0) {
    sendError(res, '笔记不存在', 404)
    return
  }

  const multiple = notes.length > 1
  const label = multiple
    ? 'notes'
    : notes[0].title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 50)

  const zip = new AdmZip()
  const uploadsFolder = getUploadsFolder()

  for (const note of notes) {
    const safeName = note.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 30) || 'note'
    const lines: string[] = [note.content || '']

    for (const img of (note.imgs || [])) {
      const uniqueName = multiple ? `${safeName}_${img}` : img
      lines.push(`\n![${img}](images/${uniqueName})`)
      const imgPath = path.join(uploadsFolder, img)
      if (existsSync(imgPath)) {
        zip.addLocalFile(imgPath, 'images', uniqueName)
      }
    }

    zip.addFile(`${safeName}.md`, Buffer.from(lines.join('\n'), 'utf-8'))
  }

  const zipBuffer = zip.toBuffer()

  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(label)}.zip"`)
  res.setHeader('Content-Length', zipBuffer.length)
  res.send(zipBuffer)
})
