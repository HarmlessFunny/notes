import { ref } from 'vue'
import { useRouter } from 'vue-router'
import type { Note, NoteFormData, UploadFile } from '@/types'
import { useNotesStore } from '@/stores/notes'

export function useNoteDetail() {
    const notesStore = useNotesStore()
    const router = useRouter()

    const note = ref<Note | null>(null)
    const showPreview = ref(false)
    const previewIndex = ref(0)
    const showEditForm = ref(false)
    const editSubmitting = ref(false)

    async function getNote(title: string) {
        const found = await notesStore.getNote(title)
        if (found) {
            note.value = found
        } else {
            router.replace('/view/notes/all')
        }
    }

    async function handleEditSubmit(formData: NoteFormData, fileList: UploadFile[]): Promise<void> {
        if (!note.value) return
        editSubmitting.value = true

        const title = formData.title.trim()
        const subject = formData.subject.trim()
        const content = formData.content.trim()
        const submitFormData = new FormData()
        submitFormData.append('title', title)
        submitFormData.append('subject', subject)
        submitFormData.append('content', content)

        const existingImages: string[] = []
        fileList.forEach((item) => {
            if (item.raw) {
                submitFormData.append('images', item.raw)
            } else if (item.name) {
                existingImages.push(item.name)
            }
        })
        submitFormData.append('existing_images', JSON.stringify(existingImages))

        const success = await notesStore.updateNote(note.value.title, submitFormData)
        editSubmitting.value = false
        if (success) {
            showEditForm.value = false
            if (title !== note.value.title) {
                router.replace(`/view/detail/${encodeURIComponent(title)}`)
            } else {
                const updatedNote = await notesStore.getNote(note.value.title)
                if (updatedNote) {
                    Object.assign(note.value, updatedNote)
                }
            }
        }
    }

    async function deleteCurrentNote(): Promise<void> {
        if (!note.value) return
        const deleted = await notesStore.deleteNotes([note.value.title])
        if (deleted) {
            router.replace('/view/notes/all')
        }
    }

    return {
        note,
        showPreview,
        previewIndex,
        showEditForm,
        editSubmitting,
        getNote,
        handleEditSubmit,
        deleteCurrentNote,
    }
}
