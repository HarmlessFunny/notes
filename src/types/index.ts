export interface FormData {
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

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system'
    content: string
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