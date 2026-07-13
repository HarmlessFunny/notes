import { Router } from 'express'
import type { Request, Response } from 'express'
import OpenAI from 'openai'
import { fetchAiChat, saveAiChat, deleteAiChat } from '../services/database.js'
import { saveImages } from '../services/noteFile.js'
import { sendSuccess, sendError } from '../middleware/apiResponse.js'
import { tools, toolCallMap } from '../ai/tools.js'
import { streamAiResponse } from '../ai/stream.js'

export const aiRouter = Router()

function getAiConfigFromHeaders(req: Request): { apiKey: string; baseUrl: string; modelName: string; visionEnabled: boolean } {
  return {
    apiKey: req.headers['x-chat-api-key'] as string || '',
    baseUrl: req.headers['x-chat-base-url'] as string || '',
    modelName: req.headers['x-chat-model-name'] as string || '',
    visionEnabled: (req.headers['x-vision-enabled'] as string || 'true').toLowerCase() !== 'false',
  }
}

aiRouter.get('/status', (req: Request, res: Response) => {
  const config = getAiConfigFromHeaders(req)
  const available = !!(config.apiKey && config.baseUrl && config.modelName)
  sendSuccess(res, { ai_available: available, vision_enabled: config.visionEnabled })
})

aiRouter.post('/', async (req: Request, res: Response) => {
  const config = getAiConfigFromHeaders(req)
  if (!config.apiKey || !config.baseUrl || !config.modelName) {
    sendError(res, 'AI 功能未配置，请先设置 API 配置')
    return
  }

  const messages = req.body?.messages
  if (!messages || messages.length === 0) {
    sendError(res, '请输入问题')
    return
  }

  const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl })

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'X-Accel-Buffering': 'no',
    'Connection': 'keep-alive',
  })

  try {
    for await (const event of streamAiResponse(client, config.modelName, messages, { tools, toolCallMap })) {
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    }
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ type: 'error', content: err.message || 'AI 响应失败' })}\n\n`)
  } finally {
    res.end()
  }
})

aiRouter.post('/upload', (req: Request, res: Response) => {
  const files: Express.Multer.File[] = (req.files as Express.Multer.File[]) || []
  if (files.length === 0) {
    sendError(res, '请选择图片')
    return
  }
  const saved = saveImages(files, `ai_${Date.now()}`)
  const urls = saved.map(f => `/uploads/images/${f}`)
  sendSuccess(res, { urls })
})

aiRouter.get('/chat', (_req: Request, res: Response) => {
  sendSuccess(res, { messages: fetchAiChat() })
})

aiRouter.post('/chat', (req: Request, res: Response) => {
  const messages = req.body?.messages || []
  saveAiChat(messages)
  sendSuccess(res)
})

aiRouter.delete('/chat', (_req: Request, res: Response) => {
  deleteAiChat()
  sendSuccess(res)
})
