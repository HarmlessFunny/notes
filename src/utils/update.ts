import { version } from '../../package.json'
import { openUrl } from '@tauri-apps/plugin-opener'
import { i18n } from '@/locales'

const GITHUB_API = 'https://api.github.com/repos/HarmlessFunny/notes/releases/latest'
const MIRROR_PREFIX = 'https://gh-proxy.org/'

export interface UpdateInfo {
  latestVersion: string
  htmlUrl: string
  downloadUrl: string
  mirrorUrl: string
}

const isMobile = /android/i.test(navigator.userAgent)

function buildDownloadUrl(tag: string): string {
  const file = isMobile
    ? 'Notes-Android-arm64-v8a.apk'
    : 'Notes-Windows-x64.exe'
  return `https://github.com/HarmlessFunny/notes/releases/download/${tag}/${file}`
}

function parseVersion(v: string): number[] {
  return v.replace(/^v/i, '').split('.').map(Number)
}

function isNewer(latest: string, current: string): boolean {
  const l = parseVersion(latest)
  const c = parseVersion(current)
  for (let i = 0; i < Math.max(l.length, c.length); i++) {
    const a = l[i] ?? 0
    const b = c[i] ?? 0
    if (a !== b) return a > b
  }
  return false
}

export async function checkForUpdate(showUpToDate = false): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(GITHUB_API)
    if (!res.ok) return null
    const data = await res.json()
    const tag: string = data.tag_name ?? ''
    const latestVersion = tag.replace(/^v/i, '')

    if (!latestVersion) return null
    if (!isNewer(latestVersion, version)) {
      if (showUpToDate) ElMessage.info(i18n.global.t('update.upToDate'))
      return null
    }
    const downloadUrl = buildDownloadUrl(tag)
    return {
      latestVersion,
      htmlUrl: data.html_url ?? '',
      downloadUrl,
      mirrorUrl: MIRROR_PREFIX + downloadUrl
    }
  } catch {
    return null
  }
}

export async function openDownloadUrl(url: string) {
  openUrl(url).catch(() => {
    window.open(url, '_blank')
  })
}
