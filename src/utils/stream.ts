export interface ToolCallInfo {
    name: string
    arguments: Record<string, unknown>
    success: boolean
    summary: string
    round: number
}

export interface StreamCallback {
    onContent: (content: string) => void
    onThinking?: (content: string) => void
    onTool?: (info: ToolCallInfo) => void
    onError?: (error: Error) => void
    onComplete?: () => void
}

async function processSSEStream(
    response: Response,
    callback?: StreamCallback
): Promise<void> {
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
                const data: { type: string; content?: string } = JSON.parse(line.slice(6))
                if (data.type === 'content' && typeof data.content === 'string') {
                    callback?.onContent(data.content)
                } else if (data.type === 'thinking' && typeof data.content === 'string') {
                    callback?.onThinking?.(data.content)
                } else if (data.type === 'tool' && typeof data.content === 'string') {
                    try {
                        callback?.onTool?.(JSON.parse(data.content) as ToolCallInfo)
                    } catch { /* ignore malformed tool event */ }
                } else if (data.type === 'error') {
                    throw new Error(data.content)
                }
            } catch (e: any) {
                if (!(e instanceof SyntaxError)) {
                    throw e
                }
            }
        }
    }

    callback?.onComplete?.()
}

// 流式请求：错误通过返回值暴露（onError 回调也会触发），promise 永不 reject
async function executeStream(
    url: string,
    body: object,
    callback?: StreamCallback,
    signal?: AbortSignal,
    headers?: Record<string, string>
): Promise<Error | null> {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            signal,
            body: JSON.stringify(body),
        })

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
        }

        if (!response.body) {
            throw new Error('No response body')
        }

        await processSSEStream(response, callback)
        return null

    } catch (error: any) {
        if (error?.name === 'AbortError') {
            return new Error('Request aborted')
        }
        callback?.onError?.(error)
        return error as Error
    }
}

export function createAbortableStream(
    url: string,
    body: object,
    callback?: StreamCallback,
    headers?: Record<string, string>
): { promise: Promise<Error | null>; abort: () => void } {
    const controller = new AbortController()
    const promise = executeStream(url, body, callback, controller.signal, headers)
    return {
        promise,
        abort: () => controller.abort(),
    }
}