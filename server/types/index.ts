export interface Note {
  title: string
  subject: string
  time: string
  content?: string
  imgs?: string[]
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | ChatContentPart[]
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export interface ChatContentPart {
  type: 'text' | 'image_url'
  text?: string
  image_url?: { url: string }
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface DbData {
  notes: Note[]
  ai_chat: ChatMessage[]
}

export interface ApiSuccess<T = unknown> {
  status: 'success'
  message?: string
  data?: T
  notes?: Note[]
  note?: Note
  urls?: string[]
  ai_available?: boolean
  vision_enabled?: boolean
  messages?: ChatMessage[]
  deleted_count?: number
}

export interface ApiError {
  status: 'error'
  message: string
  path?: string
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError

export interface SseEvent {
  type: 'content' | 'error' | 'done'
  content?: string
  raw_json?: string
}

export interface AiConfig {
  apiKey: string
  baseUrl: string
  modelName: string
  visionEnabled: boolean
}

export type ToolDefinition = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export type ToolCallMap = Record<string, (...args: any[]) => ApiResponse>
