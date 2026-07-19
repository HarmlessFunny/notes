export interface AiConfig {
    apiKey: string
    baseUrl: string
    modelName: string
    visionEnabled: boolean
}

export const AI_CONFIG_KEY = 'notes-ai-config'

export function loadAiConfig(): AiConfig {
    try {
        const raw = localStorage.getItem(AI_CONFIG_KEY)
        if (raw) return JSON.parse(raw) as AiConfig
    } catch { /* ignore */ }
    return { apiKey: '', baseUrl: '', modelName: '', visionEnabled: true }
}

export function saveAiConfig(config: AiConfig) {
    localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config))
}

export function getAiConfigHeaders(config: AiConfig): Record<string, string> {
    return {
        'X-Chat-Api-Key': config.apiKey,
        'X-Chat-Base-Url': config.baseUrl,
        'X-Chat-Model-Name': config.modelName,
        'X-Vision-Enabled': String(config.visionEnabled),
    }
}

export interface NoteFormData {
    title: string
    subject: string
    content: string
}

export interface UploadFile {
    uid: number
    name: string
    status: 'success' | 'error' | 'loading' | 'ready'
    url?: string
    raw?: File
}

export interface Note {
    title: string
    subject: string
    content: string
    time: string
    imgs: string[]
}

export interface LightNote {
    title: string
    subject: string
    time: string
}

export interface SubmissionStatus {
    type: 'success' | 'error' | 'info'
    title: string
    message: string
}

export type ContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system'
    content: string | ContentPart[]
}

export interface ApiResponse<T = any> {
    status: 'success' | 'error'
    message?: string
    data?: T
    notes?: Note[]
    note?: Note
}

export interface SseEvent {
    type: 'content' | 'error' | 'done'
    content?: string
    raw_json?: string
}

export type SubjectType = '语文' | '数学' | '英语' | '物理' | '化学' | '生物' | '历史' | '地理' | '政治' | '其他'

export const SUBJECTS: SubjectType[] = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治', '其他']

export type ThemeMode = 'system' | 'light' | 'dark'

export const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
    { value: 'system', label: '跟随系统' },
    { value: 'dark', label: '深色' },
    { value: 'light', label: '浅色' },
]