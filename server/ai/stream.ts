import OpenAI from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import type { SseEvent, ToolDefinition, ToolCallMap } from '../types/index.js'
import { getUploadsFolder } from '../services/database.js'

function convertImageUrlToBase64(url: string): string {
  const filename = path.basename(url)
  const filepath = path.join(getUploadsFolder(), filename)
  if (!existsSync(filepath)) return url
  const imgData = readFileSync(filepath)
  const ext = path.extname(filename).toLowerCase().replace('.', '')
  const mimeMap: Record<string, string> = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', gif: 'gif', webp: 'webp' }
  const mime = mimeMap[ext] || 'png'
  return `data:image/${mime};base64,${imgData.toString('base64')}`
}

function prepareMessagesForApi(messages: any[]): ChatCompletionMessageParam[] {
  return messages.map(msg => {
    if (Array.isArray(msg.content)) {
      const newContent = msg.content.map((part: any) => {
        if (part.type === 'image_url' && typeof part.image_url?.url === 'string' && part.image_url.url.startsWith('/uploads/images/')) {
          return { ...part, image_url: { ...part.image_url, url: convertImageUrlToBase64(part.image_url.url) } }
        }
        return part
      })
      return { ...msg, content: newContent }
    }
    return msg as ChatCompletionMessageParam
  })
}

export async function* streamAiResponse(
  client: OpenAI,
  model: string,
  messages: any[],
  options?: {
    responseFormat?: { type: string }
    tools?: ToolDefinition[]
    toolCallMap?: ToolCallMap
    reasoningEffort?: string
  }
): AsyncGenerator<SseEvent> {
  const currentMessages = prepareMessagesForApi(JSON.parse(JSON.stringify(messages)))

  while (true) {
    const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
      model,
      messages: currentMessages,
      stream: true,
      stream_options: { include_usage: true },
    }

    if (options?.reasoningEffort) {
      (params as any).reasoning_effort = options.reasoningEffort
    }
    if (options?.responseFormat) {
      (params as any).response_format = options.responseFormat
    }
    if (options?.tools) {
      params.tools = options.tools as any
    }

    const stream = await client.chat.completions.create(params)

    const toolCallsAcc: Record<number, { id: string; type: string; function: { name: string; arguments: string } }> = {}
    let fullContent = ''

    for await (const chunk of stream) {
      const choice = chunk.choices?.[0]
      if (!choice) continue

      const delta = choice.delta

      if (delta?.content) {
        fullContent += delta.content
        yield { type: 'content', content: delta.content }
      }

      if (delta?.tool_calls && options?.tools) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index
          if (!toolCallsAcc[idx]) {
            toolCallsAcc[idx] = { id: '', type: 'function', function: { name: '', arguments: '' } }
          }
          if (tc.id) toolCallsAcc[idx].id = tc.id
          if (tc.function) {
            if (tc.function.name) toolCallsAcc[idx].function.name += tc.function.name
            if (tc.function.arguments) toolCallsAcc[idx].function.arguments += tc.function.arguments
          }
        }
      }
    }

    if (Object.keys(toolCallsAcc).length === 0) {
      if (options?.responseFormat?.type === 'json_object') {
        yield { type: 'done', raw_json: fullContent }
      } else {
        yield { type: 'done' }
      }
      break
    }

    const assistantMsg: ChatCompletionMessageParam = {
      role: 'assistant',
      content: null,
      tool_calls: Object.values(toolCallsAcc).map(tc => ({
        id: tc.id,
        type: tc.type as 'function',
        function: { name: tc.function.name, arguments: tc.function.arguments }
      }))
    }
    currentMessages.push(assistantMsg)

    if (options?.toolCallMap) {
      for (const tc of Object.values(toolCallsAcc)) {
        const funcName = tc.function.name
        let funcArgs: Record<string, any> = {}
        try {
          funcArgs = tc.function.arguments ? JSON.parse(tc.function.arguments) : {}
        } catch {}

        const toolFunc = options.toolCallMap[funcName]
        if (toolFunc) {
          const result = await Promise.resolve(toolFunc(funcArgs))
          currentMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(result)
          } as any)
        } else {
          currentMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify({ status: 'error', message: `未知工具: ${funcName}` })
          } as any)
        }
      }
    }
  }
}
