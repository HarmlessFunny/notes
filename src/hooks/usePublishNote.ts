import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import type { UploadFile } from '@/types'
import { useNotesStore } from '@/stores/notes'
import { useCacheStore } from '@/stores/cache'

export function usePublishNote() {
    const notesStore = useNotesStore()
    const cache = useCacheStore()
    const {
        publishFormData: formData,
        publishFileList: fileList,
        publishPreviewIndex: previewIndex,
        publishShowPreview: showPreview,
        publishSubmitting: submitting,
    } = storeToRefs(cache)

    const canSubmit = computed(() => {
        const hasTitle = !!formData.value.title.trim()
        const hasSubject = !!formData.value.subject.trim()
        return hasTitle && hasSubject
    })

    const resetForm = () => {
        cache.resetPublishForm()
    }

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
