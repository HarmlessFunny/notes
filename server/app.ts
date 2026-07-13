import express from 'express'
import cors from 'cors'
import multer from 'multer'
import path from 'path'
import { initDatabase, getUploadsFolder } from './services/database.js'
import { notesRouter, noteRouter, submitRouter } from './routes/notes.js'
import { exportRouter } from './routes/export.js'
import { aiRouter } from './routes/ai.js'

const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])

function fileFilter(_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  const ext = path.extname(file.originalname).toLowerCase()
  if (ALLOWED_EXTENSIONS.has(ext)) {
    cb(null, true)
  } else {
    cb(null, false)
  }
}

const upload = multer({ storage: multer.memoryStorage(), fileFilter })

export function createApp(baseDir: string, distDir?: string): express.Express {
  initDatabase(baseDir)

  const app = express()

  app.use(cors({ origin: true, credentials: true }))
  app.use(express.json({ limit: '50mb' }))
  app.use(express.urlencoded({ extended: true, limit: '50mb' }))

  // API routes
  app.use('/api/notes', notesRouter)
  app.use('/api/note', upload.any(), noteRouter)
  app.use('/api/submit', upload.any(), submitRouter)
  app.use('/api/ai', upload.any(), aiRouter)
  app.use('/api/export', exportRouter)

  // Serve uploaded images
  app.use('/uploads/images', express.static(getUploadsFolder()))

  // Serve frontend static files (built by Vite)
  const frontendDist = distDir || path.resolve(baseDir, 'server', 'dist')
  app.use(express.static(frontendDist))

  // SPA fallback
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
      if (err) res.status(404).send('Not Found')
    })
  })

  // Global error handler
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err)
    res.status(500).json({ status: 'error', message: '服务器内部错误' })
  })

  return app
}
