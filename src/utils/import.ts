import axios from 'axios'
import { i18n } from '@/locales'

export async function importNotesFromZip(): Promise<boolean> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.zip'

    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) { resolve(false); return }

      try {
        const formData = new FormData()
        formData.append('file', file)

        const response = await axios.post('/api/import', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })

        ElMessage.success(response.data?.message || i18n.global.t('file.importSuccess'))
        resolve(true)
      } catch (error: any) {
        ElMessage.error(error?.response?.data?.message || i18n.global.t('file.importFailed'))
        resolve(false)
      }
    }

    input.click()
  })
}
