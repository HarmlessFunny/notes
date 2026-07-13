import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  download: (filename: string, base64: string) =>
    ipcRenderer.invoke('save-file', filename, base64)
})
