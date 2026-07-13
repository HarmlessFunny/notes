import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { createApp } from './app.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
let mainWindow: BrowserWindow | null = null
let LOG_FILE = ''

ipcMain.handle('save-file', async (_event, filename: string, base64: string) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: filename,
    filters: [{ name: 'ZIP', extensions: ['zip'] }]
  })
  if (!canceled && filePath) {
    const buffer = Buffer.from(base64, 'base64')
    fs.writeFileSync(filePath, buffer)
    return true
  }
  return false
})

app.whenReady().then(async () => {
  try {
    const isPacked = app.isPackaged

    const baseDir = isPacked
      ? path.dirname(app.getPath('exe'))
      : process.cwd()

    const distDir = isPacked
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'server', 'dist')
      : undefined

    const expressApp = createApp(baseDir, distDir)
    LOG_FILE = path.join(app.getPath('userData'), 'port.log')

    const server = expressApp.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 3001
      fs.writeFileSync(LOG_FILE, `${port}`, 'utf-8')

      mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        resizable: true,
        show: false,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
        },
      })

      mainWindow.loadURL(`http://127.0.0.1:${port}`).then(() => {
        mainWindow?.show()
        mainWindow?.focus()
      }).catch(() => {
        mainWindow?.show()
      })

      mainWindow.on('closed', () => { mainWindow = null })
    })
  } catch (err) {
    console.error(err)
  }
})

app.on('window-all-closed', () => { app.quit() })
app.on('activate', () => { if (mainWindow === null) app.quit() })
