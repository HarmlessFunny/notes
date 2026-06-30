import type { Note, LightNote, QuizData, GradeResponse, QuizQuestion, UserAnswer } from '@/types'
import axios from 'axios'
import { defineStore } from 'pinia'
import { computed, ref, type Ref } from 'vue'
import { useCacheStore } from '@/stores/cache'
import { handleApiError, handleApiSuccess } from '@/utils/error'
import { streamFetch } from '@/utils/stream'

export const useNotesStore = defineStore('notes', () => {
    const allNotes: Ref<LightNote[]> = ref([])

    const subjectsList = computed(() => {
        const set = new Set<string>()
        allNotes.value.forEach(note => note.subject && set.add(note.subject))
        return Array.from(set)
    })

    async function updateAllNotes() {
        try {
            const response = await axios.get('/api/notes')
            allNotes.value = response.data?.notes ?? []
        } catch (error: any) {
            handleApiError(error, '更新笔记失败')
        }
    }

    async function publishNote(formData: FormData) {
        try {
            await axios.post('/api/submit', formData)
            await updateAllNotes()
            handleApiSuccess('发布笔记成功')
            return true
        } catch (error: any) {
            handleApiError(error, '发布笔记失败')
            return false
        }
    }

    async function getNote(title: string): Promise<Note | null> {
        try {
            const response = await axios.get(`/api/note/${encodeURIComponent(title)}`)
            return response.data.note as Note
        } catch (error: any) {
            handleApiError(error, '获取笔记失败')
            return null
        }
    }

    async function getFilteredNotes(time: string): Promise<LightNote[]> {
        try {
            const response = await axios.get(`/api/notes/${time}`)
            return response.data?.notes ?? []
        } catch (error: any) {
            handleApiError(error, '获取筛选笔记失败')
            return []
        }
    }

    async function searchNotes(query: string): Promise<LightNote[]> {
        try {
            const res = await axios.get('/api/notes/search', { params: { q: query } })
            return res.data?.notes ?? []
        } catch (error: any) {
            handleApiError(error, '搜索笔记失败')
            return []
        }
    }

    async function deleteNote(titles: string[]) {
        try {
            const ok = await ElMessageBox.confirm('确认删除笔记吗？', '警告', {
                confirmButtonText: '确认',
                cancelButtonText: '取消',
                type: 'warning'
            }).then(() => true).catch(() => false)
            if (!ok) return false
        } catch {
            return false
        }
        try {
            const response = await axios.delete('/api/notes/delete', { data: { titles } })
            await updateAllNotes()
            const cacheStore = useCacheStore()
            cacheStore.checkedNotes = cacheStore.checkedNotes.filter(t => !titles.includes(t))
            handleApiSuccess(response.data.message)
            return true
        } catch (error: any) {
            handleApiError(error, '删除笔记失败')
            return false
        }
    }

    async function updateNote(title: string, formData: FormData) {
        try {
            await axios.put(`/api/note/${encodeURIComponent(title)}`, formData)
            await updateAllNotes()
            handleApiSuccess('笔记更新成功')
            return true
        } catch (error: any) {
            handleApiError(error, '更新笔记失败')
            return false
        }
    }

    async function streamSse(url: string, body: object): Promise<any> {
        const result = await streamFetch(url, body)
        if (!result.data) {
            throw result.error || new Error('Stream request failed')
        }
        return result.data
    }

    async function generateQuiz(noteContent: string): Promise<QuizData | null> {
        try {
            const data = await streamSse('/api/ai/quiz', { note_content: noteContent })
            return data as QuizData
        } catch (error: any) {
            handleApiError(error, '生成复习题失败')
            return null
        }
    }

    async function gradeQuiz(
        noteContent: string,
        questions: QuizQuestion[],
        userAnswers: UserAnswer[]
    ): Promise<GradeResponse | null> {
        try {
            const data = await streamSse('/api/ai/grade', {
                note_content: noteContent,
                questions,
                user_answers: userAnswers,
            })
            return data as GradeResponse
        } catch (error: any) {
            handleApiError(error, '批改答案失败')
            return null
        }
    }

    return {
        allNotes,
        subjectsList,
        publishNote,
        updateAllNotes,
        getNote,
        getFilteredNotes,
        searchNotes,
        deleteNote,
        updateNote,
        generateQuiz,
        gradeQuiz,
    }
})