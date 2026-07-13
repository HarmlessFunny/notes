import { createApp } from './app.js'

const PORT = Number(process.env.PORT) || 3001
const baseDir = process.cwd()

const app = createApp(baseDir)

app.listen(PORT, () => {
  console.log(`[server] API server running at http://localhost:${PORT}`)
  console.log(`[server] Base directory: ${baseDir}`)
})
