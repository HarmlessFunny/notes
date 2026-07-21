import axios from 'axios'
import i18n from '@/i18n'
import { handleApiSuccess, handleApiError } from '@/utils/error'

export async function importNotesFromZip(): Promise<boolean> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.zip'
    const t = i18n.global.t

    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) { resolve(false); return }

      try {
        const formData = new FormData()
        formData.append('file', file)

        const response = await axios.post('/api/import', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })

        handleApiSuccess(response.data?.message || t('import.success'))
        resolve(true)
      } catch (error: any) {
        handleApiError(error, t('import.failed'))
        resolve(false)
      }
    }

    input.click()
  })
}
