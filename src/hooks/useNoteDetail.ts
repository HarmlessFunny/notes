import { ref } from 'vue'
import { useRouter } from 'vue-router'
import type { Note, FormData, UploadFile } from '@/types'
import { useNotesStore } from '@/stores/notes'
import { handleApiWarning } from '@/utils/error'

export function useNoteDetail() {
    const notesStore = useNotesStore()
    const router = useRouter()

    const note = ref<Note | null>(null)
    const showPreview = ref(false)
    const previewIndex = ref(0)
    const showEditForm = ref(false)
    const editSubmitting = ref(false)
    const showQuizDialog = ref(false)

    async function getNote(id: string) {
        const found = await notesStore.getNote(id)
        if (found) {
            note.value = found
        } else {
            router.replace('/view/notes/all')
        }
    }

    async function handleEditSubmit(formData: FormData, fileList: UploadFile[]): Promise<void> {
        if (!note.value) return
        editSubmitting.value = true

        // 构建提交表单数据
        const submitFormData = new FormData()
        submitFormData.append('title', formData.title)
        submitFormData.append('subject', formData.subject)
        submitFormData.append('content', formData.content)
        submitFormData.append('id', note.value.id)
        submitFormData.append('tags', JSON.stringify(formData.tags))

        // 分离已有图片和新上传的图片
        const existingImages: string[] = []
        fileList.forEach((item) => {
            if (item.raw) {
                submitFormData.append('images', item.raw)
            } else if (item.name) {
                existingImages.push(item.name)
            }
        })
        submitFormData.append('existing_images', JSON.stringify(existingImages))

        const success = await notesStore.updateNote(note.value.id, submitFormData)
        editSubmitting.value = false
        if (success) {
            showEditForm.value = false
            const updatedNote = await notesStore.getNote(note.value.id)
            if (updatedNote) {
                Object.assign(note.value, updatedNote)
            }
        }
    }

    async function deleteCurrentNote(): Promise<void> {
        if (!note.value) return
        const deleted = await notesStore.deleteNote([note.value.id])
        if (deleted) {
            router.replace('/view/notes/all')
        }
    }

    function openQuiz(): boolean {
        if (!note.value?.content) {
            handleApiWarning('笔记没有正文内容，无法生成复习题')
            return false
        }
        showQuizDialog.value = true
        return true
    }

    return {
        // state
        note,
        showPreview,
        previewIndex,
        showEditForm,
        editSubmitting,
        showQuizDialog,
        // methods
        getNote,
        handleEditSubmit,
        deleteCurrentNote,
        openQuiz,
    }
}
