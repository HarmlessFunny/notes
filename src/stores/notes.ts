import type { Note, LightNote, NoteFormData } from '@/types'
import axios from 'axios'
import { defineStore } from 'pinia'
import { computed, ref, type Ref } from 'vue'
import { useCacheStore } from '@/stores/cache'
import { handleApiError, handleApiSuccess } from '@/utils/error'

export const useNotesStore = defineStore('notes', () => {
    const allNotes: Ref<LightNote[]> = ref([])

    const subjectsList = computed(() => {
        const set = new Set<string>()
        allNotes.value.forEach(note => note.subject && set.add(note.subject))
        return Array.from(set)
    })

    async function flashAllNotes() {
        try {
            const response = await axios.get('/api/notes')
            allNotes.value = response.data?.notes ?? []
        } catch (error: any) {
            handleApiError(error, '刷新笔记数据失败')
        }
    }

    async function publishNote(formData: FormData | NoteFormData) {
        try {
            await axios.post('/api/submit', formData)
            await flashAllNotes()
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

    async function deleteNotes(titles: string[]) {
        try {
            const ok = await ElMessageBox.confirm(`确认删除"${titles.join('"、"')}"笔记吗？`, '警告', {
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
            await flashAllNotes()
            const cacheStore = useCacheStore()
            cacheStore.checkedNotes = cacheStore.checkedNotes.filter(t => !titles.includes(t))
            handleApiSuccess(response.data.message)
            return true
        } catch (error: any) {
            handleApiError(error, '删除笔记失败')
            return false
        }
    }

    async function updateNote(title: string, formData: FormData | NoteFormData) {
        try {
            await axios.put(`/api/note/${encodeURIComponent(title)}`, formData)
            await flashAllNotes()
            handleApiSuccess('笔记更新成功')
            return true
        } catch (error: any) {
            handleApiError(error, '更新笔记失败')
            return false
        }
    }

    return {
        allNotes,
        subjectsList,
        publishNote,
        flashAllNotes,
        getNote,
        getFilteredNotes,
        searchNotes,
        deleteNotes,
        updateNote,
    }
})