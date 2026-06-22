<template>
  <UModal v-model:open="isOpen" :title="$t('export.title', { name: target?.name ?? '' })" :ui="{ content: 'max-w-xl' }">
    <template #body>
      <div class="space-y-5">
        <!-- format -->
        <div>
          <p class="mb-2 text-sm font-medium">{{ $t('export.format') }}</p>
          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="f in formats"
              :key="f.value"
              type="button"
              class="rounded-lg border px-3 py-2.5 text-left transition"
              :class="format === f.value ? 'border-primary-500 bg-primary-500/10' : 'border-default hover:border-neutral-500'"
              @click="format = f.value"
            >
              <div class="flex items-center gap-1.5 text-sm font-medium">
                <UIcon :name="f.icon" class="size-4" />
                {{ f.label }}
              </div>
              <div class="mt-0.5 text-xs text-muted">{{ f.desc }}</div>
            </button>
          </div>
        </div>

        <!-- mrpack metadata -->
        <template v-if="format === 'mrpack'">
          <div class="grid grid-cols-2 gap-3">
            <UFormField :label="$t('export.version')">
              <UInput v-model="version" placeholder="1.0.0" class="w-full" />
            </UFormField>
            <UFormField :label="$t('export.summary')">
              <UInput v-model="summary" :placeholder="$t('export.summaryPlaceholder')" class="w-full" />
            </UFormField>
          </div>
          <USwitch v-model="optionalDisabled" :label="$t('export.optionalDisabled')" :description="$t('export.optionalDisabledDesc')" />
        </template>

        <!-- file tree -->
        <div>
          <p class="mb-2 text-sm font-medium">{{ $t('export.include') }}</p>
          <div class="max-h-64 overflow-y-auto rounded-lg border border-default p-1.5">
            <FileTree
              v-if="target"
              :key="target.id"
              :instance-id="target.id"
              :excluded="excluded"
              :toggle="toggle"
            />
          </div>
          <p v-if="format === 'mrpack'" class="mt-2 text-xs text-muted">{{ $t('export.mrpackHint') }}</p>
        </div>

        <p v-if="error" class="text-sm text-error">{{ error }}</p>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton variant="ghost" color="neutral" :label="$t('common.cancel')" @click="close" />
        <UButton
          icon="i-lucide-package"
          :label="$t('export.exportBtn')"
          :loading="exporting"
          @click="doExport"
        />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'

const { isOpen, target, close } = useExportModal()
const activity = useActivityCenter()
const toast = useToast()
const { t } = useI18n()

type Format = 'mrpack' | 'backup'
const format = ref<Format>('mrpack')
const version = ref('1.0.0')
const summary = ref('')
const optionalDisabled = ref(false)
const excluded = ref<Set<string>>(new Set())
const exporting = ref(false)
const error = ref<string | null>(null)

// Personal/heavy folders excluded by default (harmless if they don't exist).
const DEFAULT_EXCLUDE = ['saves', 'screenshots', 'crash-reports', 'backups']

const formats = computed<{ value: Format, label: string, desc: string, icon: string }[]>(() => [
  { value: 'mrpack', label: 'Modrinth (.mrpack)', desc: t('export.mrpackDesc'), icon: 'i-lucide-package' },
  { value: 'backup', label: t('export.backup'), desc: t('export.backupDesc'), icon: 'i-lucide-archive' },
])

function toggle(path: string, _isDir: boolean) {
  const next = new Set(excluded.value)
  if (next.has(path)) {
    next.delete(path)
  } else {
    for (const e of [...next]) if (e === path || e.startsWith(path + '/')) next.delete(e)
    next.add(path)
  }
  excluded.value = next
}

watch(isOpen, (open) => {
  if (open && target.value) {
    format.value = 'mrpack'
    version.value = '1.0.0'
    summary.value = ''
    optionalDisabled.value = false
    error.value = null
    excluded.value = new Set(DEFAULT_EXCLUDE)
  }
})

async function doExport() {
  const tgt = target.value
  if (!tgt) return
  error.value = null

  const isMrpack = format.value === 'mrpack'
  const ext = isMrpack ? 'mrpack' : 'zip'
  const safe = tgt.name.replace(/[^\w.\- ]+/g, '_').trim() || 'instance'

  try {
    const dest = await save({
      defaultPath: `${safe}.${ext}`,
      filters: [{ name: isMrpack ? 'Modrinth modpack' : 'Mako backup', extensions: [ext] }],
    })
    if (typeof dest !== 'string') return

    exporting.value = true
    const tid = activity.startTask(t('activity.exportingInstance', { name: tgt.name }))
    const exclude = [...excluded.value]
    try {
      if (isMrpack) {
        await invoke('export_mrpack', {
          id: tgt.id,
          dest,
          version: version.value || null,
          summary: summary.value || null,
          exclude,
          optionalDisabled: optionalDisabled.value,
        })
      } else {
        await invoke('export_instance', { id: tgt.id, dest, exclude })
      }
      toast.add({ title: t('export.done'), color: 'success' })
      close()
    } finally {
      activity.endTask(tid)
      exporting.value = false
    }
  } catch (e) {
    error.value = String(e)
  }
}
</script>
