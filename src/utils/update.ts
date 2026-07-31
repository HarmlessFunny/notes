import { version } from '../../package.json'

const GITHUB_API = 'https://api.github.com/repos/HarmlessFunny/notes/releases/latest'

export interface UpdateInfo {
  latestVersion: string
  htmlUrl: string
  downloadUrl: string
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
      if (showUpToDate) ElMessage.info('已是最新版本')
      return null
    }
    return { latestVersion, htmlUrl: data.html_url ?? '', downloadUrl: buildDownloadUrl(tag) }
  } catch {
    return null
  }
}
