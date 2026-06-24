import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'uptodate' | 'error'

/**
 * Discord-style background updater. Everything happens silently in-process:
 * `check()` → `downloadAndInstall()` (no installer UI thanks to
 * `installMode: "quiet"`) → `relaunch()`. The user only has to click "Update".
 */
export const useAutoUpdate = () => {
  // App-wide singleton state so the titlebar and settings page stay in sync.
  const status = useState<UpdateStatus>('autoupdate:status', () => 'idle')
  const newVersion = useState<string>('autoupdate:version', () => '')
  const error = useState<string>('autoupdate:error', () => '')
  const downloaded = useState<number>('autoupdate:downloaded', () => 0)
  const total = useState<number>('autoupdate:total', () => 0)
  const pending = useState<Update | null>('autoupdate:pending', () => null)

  const available = computed(() => status.value === 'available' || status.value === 'downloading' || status.value === 'ready')
  const progress = computed(() => (total.value > 0 ? Math.round((downloaded.value / total.value) * 100) : 0))

  /** Quietly look for a newer release. Safe to call on startup. */
  async function checkForUpdates(silent = true): Promise<boolean> {
    if (status.value === 'downloading') return true
    status.value = 'checking'
    error.value = ''
    try {
      const update = await check()
      if (update) {
        pending.value = update
        newVersion.value = update.version
        status.value = 'available'
        return true
      }
      pending.value = null
      status.value = silent ? 'idle' : 'uptodate'
      return false
    } catch (e) {
      status.value = 'error'
      error.value = String(e)
      return false
    }
  }

  /** Download + install in the background, then restart into the new version. */
  async function downloadAndInstall() {
    const update = pending.value
    if (!update) {
      const found = await checkForUpdates(true)
      if (!found) return
    }
    const upd = pending.value
    if (!upd) return

    status.value = 'downloading'
    downloaded.value = 0
    total.value = 0
    error.value = ''
    try {
      await upd.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            total.value = event.data.contentLength ?? 0
            break
          case 'Progress':
            downloaded.value += event.data.chunkLength
            break
          case 'Finished':
            status.value = 'ready'
            break
        }
      })
      status.value = 'ready'
      // Quiet install is done; relaunch into the freshly installed version.
      await relaunch()
    } catch (e) {
      status.value = 'error'
      error.value = String(e)
    }
  }

  return {
    status,
    newVersion,
    error,
    downloaded,
    total,
    available,
    progress,
    checkForUpdates,
    downloadAndInstall,
  }
}
