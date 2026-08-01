export interface AiConfig {
    apiKey: string
    baseUrl: string
    modelName: string
    visionEnabled: boolean
    systemPrompt: string
    reasoningEffort: string
    showThinking: boolean
}

export const AI_CONFIG_KEY = 'notes-ai-config'

export const DEFAULT_SYSTEM_PROMPT = `## 角色
你是一个智能复习助手，使用中文思考和回答

## 行为规范
1. 用户有多项笔记，你需要根据笔记来考用户知识点
2. 使用中文回答用户的问题
3. 调用add_note添加笔记时，禁止通过markdown和html等语法引用图片，其他时候可自由引用图片

## 可用格式
- Markdown 语法：表格、列表、引用等
- 数学公式：$行内$ 或 $$块级$$
- 图片引用：<img src="/uploads/images/<图片名>" style="..." />（style中，如果你想缩放图片，必须额外填写max-height:none）

## 特殊说明
- 如果用户想删除笔记，先向用户确认再执行删除
- 今天的毫秒级13位时间戳是：{timestamp}`

export function loadAiConfig(): AiConfig {
    try {
        const raw = localStorage.getItem(AI_CONFIG_KEY)
        if (raw) return { systemPrompt: '', reasoningEffort: '', showThinking: true, ...JSON.parse(raw) } as AiConfig
    } catch { /* ignore */ }
    return { apiKey: '', baseUrl: '', modelName: '', visionEnabled: true, systemPrompt: '', reasoningEffort: '', showThinking: true }
}

export function saveAiConfig(config: AiConfig) {
    localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config))
}

export function getAiConfigHeaders(config: AiConfig): Record<string, string> {
    const headers: Record<string, string> = {
        'X-Chat-Api-Key': config.apiKey,
        'X-Chat-Base-Url': config.baseUrl,
        'X-Chat-Model-Name': config.modelName,
        'X-Vision-Enabled': String(config.visionEnabled),
    }
    if (config.reasoningEffort) {
        headers['X-Reasoning-Effort'] = config.reasoningEffort
    }
    return headers
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