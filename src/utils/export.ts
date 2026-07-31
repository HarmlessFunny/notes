import { save } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { shareFile } from '@choochmeque/tauri-plugin-sharekit-api'

export async function exportNotesToZip(titles: string[]): Promise<void> {
  if (titles.length === 0) return

  try {
    const isAndroid = /android/i.test(navigator.userAgent)
    let path: string | null = null
    if (!isAndroid) {
      path = await save({
        defaultPath: 'notes.zip',
        filters: [{ name: 'ZIP', extensions: ['zip'] }]
      })
      if (!path) return
    }

    const savedPath = await invoke<string>('export_notes', { titles, path: path ?? null })

    if (isAndroid) {
      await shareFile(savedPath, { mimeType: 'application/zip', title: 'notes.zip' })
    } else {
      ElMessage.success(`导出成功: ${savedPath}`)
    }
  } catch (e: any) {
    console.error('导出失败:', e)
    if (/cancel/i.test(e?.message || '')) {
      ElMessage.info('已取消分享')
      return
    }
    ElMessage.error(e?.message || '导出失败')
  }
}

export async function exportNoteToZip(title: string): Promise<void> {
  return exportNotesToZip([title])
}
