import type { Response } from 'express'
import type { ApiResponse } from '../types/index.js'

export function sendSuccess(res: Response, data: Record<string, unknown> | null = null, statusCode = 200): void {
  const body: Record<string, unknown> = { status: 'success' }
  if (data) {
    Object.assign(body, data)
  }
  res.status(statusCode).json(body)
}

export function sendError(res: Response, message: string, statusCode = 400, extra?: Record<string, unknown>): void {
  const body: Record<string, unknown> = { status: 'error', message }
  if (extra) Object.assign(body, extra)
  res.status(statusCode).json(body)
}


