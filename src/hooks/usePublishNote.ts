import { ref, computed } from 'vue'
import type { FormData, UploadFile } from '@/types'
import { useNotesStore } from '@/stores/notes'

export function usePublishNote() {
    const notesStore = useNotesStore()

    const formData = ref<FormData>({
        title: '',
        subject: '',
        content: ''
    })

    const canSubmit = computed(() => {
        const hasTitle = !!formData.value.title.trim()
        const hasSubject = !!formData.value.subject.trim()
        return hasTitle && hasSubject
    })

    const resetForm = () => {
        formData.value = { title: '', subject: '', content: '' }
    }

    const fileList = ref<UploadFile[]>([])
    const previewIndex = ref(0)
    const showPreview = ref(false)

    const handleFileChange = (file: UploadFile, newFileList: UploadFile[]) => {
        fileList.value = newFileList
        if (file.raw && !file.url) {
            file.url = URL.createObjectURL(file.raw)
        }
    }

    const handleFileRemove = (file: UploadFile, newFileList: UploadFile[]) => {
        fileList.value = newFileList
        if (file.url) URL.revokeObjectURL(file.url)
    }

    const handleFilePreview = (file: UploadFile) => {
        previewIndex.value = fileList.value.indexOf(file)
        showPreview.value = true
    }

    const clearFiles = () => {
        fileList.value.forEach(item => {
            if (item.url) URL.revokeObjectURL(item.url)
        })
        fileList.value = []
    }

    const closePreview = () => {
        showPreview.value = false
    }

    const submitting = ref(false)

    const submitForm = async (): Promise<boolean> => {
        if (!canSubmit.value) return false
        submitting.value = true

        try {
            const submitFormData = new FormData()
            submitFormData.append('title', formData.value.title)
            submitFormData.append('subject', formData.value.subject)
            submitFormData.append('content', formData.value.content)
            submitFormData.append('timestamp', Date.now().toString())

            fileList.value.forEach(item => {
                if (item.raw) submitFormData.append('images', item.raw)
            })

            const success = await notesStore.publishNote(submitFormData)
            submitting.value = false

            if (success) {
                resetForm()
                clearFiles()
                return true
            }
            return false
        } catch {
            submitting.value = false
            return false
        }
    }

    return {
        formData,
        canSubmit,
        resetForm,
        fileList,
        previewIndex,
        showPreview,
        handleFileChange,
        handleFileRemove,
        handleFilePreview,
        clearFiles,
        closePreview,
        submitting,
        submitForm
    }
}
