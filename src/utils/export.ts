import { save } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { shareFile } from '@choochmeque/tauri-plugin-sharekit-api'
import { i18n, currentLang } from '@/locales'

const t = (key: string, params?: Record<string, unknown>) => params ? i18n.global.t(key, params) : i18n.global.t(key)

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

    const savedPath = await invoke<string>('export_notes', { titles, path: path ?? null, lang: currentLang() })

    if (isAndroid) {
      await shareFile(savedPath, { mimeType: 'application/zip', title: 'notes.zip' })
    } else {
      ElMessage.success(t('file.exportSuccess', { path: savedPath }))
    }
  } catch (e: any) {
    console.error('Export failed:', e)
    if (/cancel/i.test(e?.message || '')) {
      ElMessage.info(t('file.shareCancelled'))
      return
    }
    ElMessage.error(e?.message || t('file.exportFailed'))
  }
}

export async function exportNoteToZip(title: string): Promise<void> {
  return exportNotesToZip([title])
}