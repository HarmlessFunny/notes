import type { Note, LightNote } from '@/types'
import axios from 'axios'
import { defineStore } from 'pinia'
import { computed, ref, type Ref } from 'vue'
import { useCacheStore } from '@/stores/cache'
import { handleApiError, handleApiSuccess } from '@/utils/error'
import i18n from '@/i18n'

export const useNotesStore = defineStore('notes', () => {
    const allNotes: Ref<LightNote[]> = ref([])

    const subjectsList = computed(() => {
        const set = new Set<string>()
        allNotes.value.forEach(note => note.subject && set.add(note.subject))
        return Array.from(set)
    })

    const t = i18n.global.t

    async function flashAllNotes() {
        try {
            const response = await axios.get('/api/notes')
            allNotes.value = response.data?.notes ?? []
        } catch (error: any) {
            handleApiError(error, t('notes.refreshFailed'))
        }
    }

    async function publishNote(formData: FormData) {
        try {
            await axios.post('/api/submit', formData)
            await flashAllNotes()
            handleApiSuccess(t('notes.publishSuccess'))
            return true
        } catch (error: any) {
            handleApiError(error, t('notes.publishFailed'))
            return false
        }
    }

    async function getNote(title: string): Promise<Note | null> {
        try {
            const response = await axios.get(`/api/note/${encodeURIComponent(title)}`)
            return response.data.note as Note
        } catch (error: any) {
            handleApiError(error, t('notes.fetchFailed'))
            return null
        }
    }

    async function getFilteredNotes(time: string): Promise<LightNote[]> {
        try {
            const response = await axios.get(`/api/notes/${time}`)
            return response.data?.notes ?? []
        } catch (error: any) {
            handleApiError(error, t('notes.fetchFilteredFailed'))
            return []
        }
    }

    async function searchNotes(query: string): Promise<LightNote[]> {
        try {
            const res = await axios.get('/api/notes/search', { params: { q: query } })
            return res.data?.notes ?? []
        } catch (error: any) {
            handleApiError(error, t('notes.searchFailed'))
            return []
        }
    }

    async function deleteNotes(titles: string[]) {
        try {
            const ok = await ElMessageBox.confirm(t('notes.deleteConfirm', { titles: titles.join('", "') }), t('notes.deleteWarning'), {
                confirmButtonText: t('notes.deleteConfirmBtn'),
                cancelButtonText: t('notes.deleteCancelBtn'),
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
            handleApiError(error, t('notes.deleteFailed'))
            return false
        }
    }

    async function updateNote(title: string, formData: FormData) {
        try {
            await axios.put(`/api/note/${encodeURIComponent(title)}`, formData)
            await flashAllNotes()
            handleApiSuccess(t('notes.updateSuccess'))
            return true
        } catch (error: any) {
            handleApiError(error, t('notes.updateFailed'))
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