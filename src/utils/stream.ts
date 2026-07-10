export interface StreamCallback {
    onContent: (content: string) => void
    onError?: (error: Error) => void
    onComplete?: () => void
}

export interface StreamResult<T> {
    data: T | null
    error: Error | null
}

async function processSSEStream(
    response: Response,
    callback?: StreamCallback
): Promise<string> {
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let fullText = ''

    while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
                const data: { type: string; content?: string; raw_json?: string } = JSON.parse(line.slice(6))
                if (data.type === 'content' && typeof data.content === 'string') {
                    fullText += data.content
                    callback?.onContent(data.content)
                } else if (data.type === 'done') {
                    if (data.raw_json && typeof data.raw_json === 'string') {
                        fullText = data.raw_json
                    }
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
    return fullText
}

function parseStreamResult<T>(fullText: string): T | null {
    try {
        return JSON.parse(fullText) as T
    } catch {
        return fullText as unknown as T
    }
}

async function executeStreamRequest<T>(
    url: string,
    body: object,
    callback?: StreamCallback,
    signal?: AbortSignal,
    headers?: Record<string, string>
): Promise<StreamResult<T>> {
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

        const fullText = await processSSEStream(response, callback)
        return { data: parseStreamResult<T>(fullText), error: null }

    } catch (error: any) {
        if (error?.name === 'AbortError') {
            return { data: null, error: new Error('Request aborted') }
        }
        callback?.onError?.(error)
        return { data: null, error }
    }
}

export async function streamFetch<T>(
    url: string,
    body: object,
    callback?: StreamCallback,
    headers?: Record<string, string>
): Promise<StreamResult<T>> {
    const controller = new AbortController()
    return executeStreamRequest<T>(url, body, callback, controller.signal, headers)
}

export function createAbortableStream<T>(
    url: string,
    body: object,
    callback?: StreamCallback,
    headers?: Record<string, string>
): { promise: Promise<StreamResult<T>>; abort: () => void } {
    const controller = new AbortController()
    const promise = executeStreamRequest<T>(url, body, callback, controller.signal, headers)
    return {
        promise,
        abort: () => controller.abort(),
    }
}
