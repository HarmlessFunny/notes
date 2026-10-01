import { version } from '../../package.json'
import { platform, arch } from '@tauri-apps/plugin-os'
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

/**
 * 各平台对应的产物名。没有对应产物的平台（macOS / *BSD 等）会返回 undefined，
 * 由调用方提示"暂无该平台安装包"，避免下载到错误的可执行文件。
 */
function artifactName(os: string, cpu: string): string | undefined {
  switch (os) {
    case 'android':
      return 'Notes-Android-arm64-v8a.apk'
    case 'windows':
      return 'Notes-Windows-x64.exe'
    case 'linux':
      return cpu === 'aarch64' ? 'Notes-Linux-aarch64' : 'Notes-Linux-x86_64'
    default:
      return undefined
  }
}

/**
 * 平台探测。优先用 Tauri 的 OS 插件（返回值已归一化），
 * 非 Tauri 环境或权限缺失时回退到 UA。
 * 注意 platform()/arch() 是同步的，这里用惰性求值避免探测失败被永久缓存。
 */
let cachedTarget: { os: string; cpu: string } | null = null

function detectTarget(): { os: string; cpu: string } {
  if (cachedTarget) return cachedTarget
  let os = ''
  let cpu = ''
  try {
    os = platform()
    cpu = arch()
  } catch {
    // ignore: 回退到 UA 判断
  }
  if (!os) {
    // Linux 桌面 WebKit 的 UA 里通常只有 X11、没有 "Linux" 字样，
    // 因此把 X11 也视作 Linux。
    const ua = navigator.userAgent
    if (/android/i.test(ua)) os = 'android'
    else if (/windows/i.test(ua)) os = 'windows'
    else if (/linux|x11/i.test(ua)) os = 'linux'
  }
  cachedTarget = { os, cpu }
  return cachedTarget
}

async function buildDownloadUrl(tag: string): Promise<string | null> {
  const { os, cpu } = detectTarget()
  const file = artifactName(os, cpu)
  if (!file) return null
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
    const downloadUrl = await buildDownloadUrl(tag)
    if (!downloadUrl) {
      if (showUpToDate) ElMessage.warning(i18n.global.t('update.unsupported'))
      return null
    }
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
