import type { Request, Response, NextFunction } from 'express'
import { sendError } from './apiResponse.js'

export function validateRequiredFields(fields: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const missing: string[] = []
    const data = req.method === 'POST' || req.method === 'PUT'
      ? (req.is('multipart/form-data') ? req.body : (req.body || {}))
      : req.query

    for (const field of fields) {
      const val = data[field]
      if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '')) {
        missing.push(field)
      }
    }

    if (missing.length > 0) {
      sendError(res, `缺少必要字段: ${missing.join(', ')}`)
      return
    }

    next()
  }
}
