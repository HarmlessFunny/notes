import type { Note, LightNote, NoteFormData } from '@/types'
import axios from 'axios'
import { defineStore } from 'pinia'
import { computed, ref, type Ref } from 'vue'
import { useCacheStore } from '@/stores/cache'
import { handleApiError, handleApiSuccess } from '@/utils/error'
import { i18n } from '@/locales'

const t = (key: string, params?: Record<string, unknown>) => params ? i18n.global.t(key, params) : i18n.global.t(key)

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
            handleApiError(error, t('notes.toast.refreshFailed'))
        }
    }

    async function publishNote(formData: FormData) {
        try {
            await axios.post('/api/submit', formData)
            await flashAllNotes()
            handleApiSuccess(t('notes.toast.publishSuccess'))
            return true
        } catch (error: any) {
            handleApiError(error, t('notes.toast.publishFailed'))
            return false
        }
    }

    async function getNote(title: string): Promise<Note | null> {
        try {
            const response = await axios.get(`/api/note/${encodeURIComponent(title)}`)
            return response.data.note as Note
        } catch (error: any) {
            handleApiError(error, t('notes.toast.fetchFailed'))
            return null
        }
    }

    async function getFilteredNotes(time: string): Promise<LightNote[]> {
        try {
            const response = await axios.get(`/api/notes/${time}`)
            return response.data?.notes ?? []
        } catch (error: any) {
            handleApiError(error, t('notes.toast.filterFailed'))
            return []
        }
    }

    async function searchNotes(query: string): Promise<LightNote[]> {
        try {
            const res = await axios.get('/api/notes/search', { params: { q: query } })
            return res.data?.notes ?? []
        } catch (error: any) {
            handleApiError(error, t('notes.toast.searchFailed'))
            return []
        }
    }

    async function deleteNotes(titles: string[]) {
        if (titles.length === 0) return false
        try {
            const ok = await ElMessageBox.confirm(t('notes.confirmDelete', { titles: titles.join('"、"') }), t('common.warning'), {
                confirmButtonText: t('common.confirm'),
                cancelButtonText: t('common.cancel'),
                type: 'warning'
            }).then(() => true).catch(() => false)
            if (!ok) return false
        } catch {
            return false
        }
        try {
            for (const title of titles) {
                await axios.delete(`/api/note/${encodeURIComponent(title)}`)
            }
            await flashAllNotes()
            const cacheStore = useCacheStore()
            cacheStore.checkedNotes = cacheStore.checkedNotes.filter(t => !titles.includes(t))
            handleApiSuccess(t('notes.toast.deleted', { n: titles.length }))
            return true
        } catch (error: any) {
            handleApiError(error, t('notes.toast.deleteFailed'))
            return false
        }
    }

    async function updateNote(title: string, formData: FormData) {
        try {
            await axios.put(`/api/note/${encodeURIComponent(title)}`, formData)
            await flashAllNotes()
            handleApiSuccess(t('notes.toast.updateSuccess'))
            return true
        } catch (error: any) {
            handleApiError(error, t('notes.toast.updateFailed'))
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