import { save } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'

const isMobile = /android/i.test(navigator.userAgent)

export async function exportNotesToZip(titles: string[]): Promise<void> {
  if (titles.length === 0) return
  const params = new URLSearchParams(titles.map(t => ['titles', t]))
  const base = (window as any).__API_BASE__ || ''
  const url = `${base}/api/export?${params}`

  try {
    const response = await fetch(url)
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      let msg = '导出失败'
      try { msg = JSON.parse(text).message || msg } catch {}
      ElMessage.error(`${msg} (${response.status})`)
      return
    }

    const arrayBuffer = await response.arrayBuffer()
    const data = Array.from(new Uint8Array(arrayBuffer))

    if (isMobile) {
      const savedPath = await invoke('save_export_file', { path: null, data })
      ElMessage.success(`导出成功: ${savedPath}`)
    } else {
      const filePath = await save({
        defaultPath: 'notes.zip',
        filters: [{ name: 'ZIP', extensions: ['zip'] }]
      })
      if (!filePath) return
      await invoke('save_export_file', { path: filePath, data })
      ElMessage.success(`导出成功: ${filePath}`)
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '导出失败')
  }
}

export async function exportNoteToZip(title: string): Promise<void> {
  return exportNotesToZip([title])
}
