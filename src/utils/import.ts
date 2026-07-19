import axios from 'axios'

export async function importNotesFromZip(): Promise<void> {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.zip'

  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await axios.post('/api/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      ElMessage.success(response.data?.message || '导入成功')
    } catch (error: any) {
      ElMessage.error(error?.response?.data?.message || '导入失败')
    }
  }

  input.click()
}
