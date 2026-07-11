export async function exportNotesToZip(titles: string[]): Promise<void> {
  if (titles.length === 0) return
  const params = new URLSearchParams(titles.map(t => ['titles', t]))
  const url = `/api/export?${params}`

  const response = await fetch(url)
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    ElMessage.error(err.message || '导出失败')
    return
  }

  const blob = await response.blob()
  const blobUrl = URL.createObjectURL(blob)

  if ((window as any).pywebview?.api) {
    const reader = new FileReader()
    reader.onload = async () => {
      const base64data = (reader.result as string).split(',')[1]
      await (window as any).pywebview.api.download('notes.zip', base64data)
    }
    reader.readAsDataURL(blob)
  } else {
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = 'notes.zip'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(blobUrl)
  }
}

export async function exportNoteToZip(title: string): Promise<void> {
  return exportNotesToZip([title])
}
