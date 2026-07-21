import { save } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import i18n from '@/i18n'
import { handleApiError, handleApiSuccess } from '@/utils/error'

const isMobile = /android/i.test(navigator.userAgent)

export async function exportNotesToZip(titles: string[]): Promise<void> {
  if (titles.length === 0) return
  const params = new URLSearchParams(titles.map(t => ['titles', t]))
  const base = (window as any).__API_BASE__ || ''
  const url = `${base}/api/export?${params}`
  const t = i18n.global.t

  try {
    const response = await fetch(url)
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      let msg = t('export.failed')
      try { msg = JSON.parse(text).message || msg } catch {}
      handleApiError({ message: `${msg} (${response.status})` }, t('export.failed'))
      return
    }

    const arrayBuffer = await response.arrayBuffer()
    const data = Array.from(new Uint8Array(arrayBuffer))

    if (isMobile) {
      const savedPath = await invoke('save_export_file', { path: null, data })
      handleApiSuccess(t('export.successWithPath', { path: savedPath }))
    } else {
      const filePath = await save({
        defaultPath: 'notes.zip',
        filters: [{ name: t('export.filterName'), extensions: ['zip'] }]
      })
      if (!filePath) return
      await invoke('save_export_file', { path: filePath, data })
      handleApiSuccess(t('export.successWithPath', { path: filePath }))
    }
  } catch (e: any) {
    handleApiError(e, t('export.failed'))
  }
}

export async function exportNoteToZip(title: string): Promise<void> {
  return exportNotesToZip([title])
}
