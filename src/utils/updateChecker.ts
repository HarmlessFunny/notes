import axios from 'axios'

declare const __APP_VERSION__: string

export interface UpdateInfo {
  hasUpdate: true
  latestVersion: string
  downloadUrl: string
}

const OWNER = 'HarmlessFunny'
const REPO = 'notes'
const CACHE_KEY = 'update-check-cache'
const CACHE_TTL = 24 * 60 * 60 * 1000

interface CacheData {
  data: UpdateInfo | null
  timestamp: number
}

function getPlatform(): 'windows' | 'android' {
  return navigator.userAgent.toLowerCase().includes('android') ? 'android' : 'windows'
}

function compareVersions(a: string, b: string): number {
  // strip pre-release suffix for base comparison
  const [aBase = '', aPre] = a.split('-', 2)
  const [bBase = '', bPre] = b.split('-', 2)

  const aParts = aBase.split('.').map(Number)
  const bParts = bBase.split('.').map(Number)

  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const an = aParts[i] || 0
    const bn = bParts[i] || 0
    if (an > bn) return 1
    if (an < bn) return -1
  }

  // base versions equal — pre-release is lower
  if (aPre && !bPre) return -1
  if (!aPre && bPre) return 1
  return 0
}

function stripV(tag: string): string {
  return tag.startsWith('v') ? tag.slice(1) : tag
}

function getCachedResult(): UpdateInfo | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { data, timestamp }: CacheData = JSON.parse(raw)
    if (Date.now() - timestamp > CACHE_TTL) return null
    return data
  } catch {
    return null
  }
}

function setCachedResult(info: UpdateInfo | null): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data: info, timestamp: Date.now() }))
  } catch { /* ignore */ }
}

export async function checkForUpdate(force = false): Promise<UpdateInfo | null> {
  try {
    if (!force) {
      const cached = getCachedResult()
      if (cached) return cached
    }

    const currentVersion = __APP_VERSION__
    const isPrerelease = currentVersion.includes('-')

    let tagName: string

    if (isPrerelease) {
      const { data } = await axios.get(`https://api.github.com/repos/${OWNER}/${REPO}/releases?per_page=5`)
      if (!data || data.length === 0) return null
      tagName = data[0].tag_name
    } else {
      const { data } = await axios.get(`https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`)
      tagName = data.tag_name
    }

    const latestVersion = stripV(tagName)
    if (currentVersion === latestVersion) return null
    if (compareVersions(currentVersion, latestVersion) >= 0) return null

    const platform = getPlatform()
    const assetName = platform === 'windows' ? 'Notes-Windows-x64.exe' : 'Notes-Android-arm64-v8a.apk'
    const downloadUrl = `https://github.com/${OWNER}/${REPO}/releases/download/${tagName}/${assetName}`

    const info: UpdateInfo = { hasUpdate: true, latestVersion: tagName, downloadUrl }
    setCachedResult(info)
    return info
  } catch {
    return null
  }
}
