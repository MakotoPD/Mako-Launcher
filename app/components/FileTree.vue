<template>
  <div>
    <div v-if="loading" class="py-2 pl-2 text-xs text-muted" :style="indent">{{ $t('common.loading') }}</div>
    <template v-else>
      <div v-for="child in children" :key="child.name">
        <div
          class="flex items-center gap-1.5 rounded-md py-1 pr-2 hover:bg-white/5"
          :style="indent"
        >
          <!-- expand toggle (dirs only) -->
          <button
            v-if="child.is_dir"
            type="button"
            class="flex size-4 shrink-0 items-center justify-center text-neutral-500 hover:text-neutral-300"
            @click="toggleExpand(child.name)"
          >
            <UIcon :name="expanded[child.name] ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-3.5" />
          </button>
          <span v-else class="size-4 shrink-0" />

          <!-- tri-state checkbox -->
          <button
            type="button"
            class="flex size-4 shrink-0 items-center justify-center rounded border transition"
            :class="checkboxClass(child)"
            :disabled="parentExcluded"
            @click="onToggle(child)"
          >
            <UIcon v-if="state(child) === 'checked'" name="i-lucide-check" class="size-3 text-white" />
            <UIcon v-else-if="state(child) === 'indeterminate'" name="i-lucide-minus" class="size-3 text-white" />
          </button>

          <UIcon :name="child.is_dir ? 'i-lucide-folder' : 'i-lucide-file'" class="size-4 shrink-0 text-neutral-500" />
          <span class="min-w-0 flex-1 truncate text-sm" :class="{ 'text-neutral-500 line-through': effectiveExcluded(child) }">{{ child.name }}</span>
          <span v-if="!child.is_dir" class="shrink-0 font-mono text-[11px] text-muted">{{ fmtSize(child.size) }}</span>
        </div>

        <FileTree
          v-if="child.is_dir && expanded[child.name]"
          :instance-id="instanceId"
          :dir="childPath(child.name)"
          :excluded="excluded"
          :toggle="toggle"
          :parent-excluded="effectiveExcluded(child)"
          :level="level + 1"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import type { DirChild } from '~/types/launcher'

const props = withDefaults(defineProps<{
  instanceId: string
  dir?: string
  excluded: Set<string>
  toggle: (path: string, isDir: boolean) => void
  parentExcluded?: boolean
  level?: number
}>(), { dir: '', parentExcluded: false, level: 0 })

const children = ref<DirChild[]>([])
const loading = ref(false)
const expanded = ref<Record<string, boolean>>({})

const indent = computed(() => ({ paddingLeft: `${props.level * 16 + 4}px` }))

const childPath = (name: string) => (props.dir ? `${props.dir}/${name}` : name)

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

const effectiveExcluded = (c: DirChild) => props.parentExcluded || props.excluded.has(childPath(c.name))
const hasExcludedUnder = (path: string) => {
  const p = path + '/'
  for (const e of props.excluded) if (e.startsWith(p)) return true
  return false
}

type State = 'checked' | 'unchecked' | 'indeterminate'
function state(c: DirChild): State {
  if (effectiveExcluded(c)) return 'unchecked'
  if (c.is_dir && hasExcludedUnder(childPath(c.name))) return 'indeterminate'
  return 'checked'
}

function checkboxClass(c: DirChild) {
  if (props.parentExcluded) return 'border-white/15 bg-white/5 cursor-not-allowed opacity-50'
  const s = state(c)
  return s === 'unchecked' ? 'border-white/25 hover:border-white/40' : 'border-primary-500 bg-primary-500'
}

function onToggle(c: DirChild) {
  if (props.parentExcluded) return
  props.toggle(childPath(c.name), c.is_dir)
}

function toggleExpand(name: string) {
  expanded.value = { ...expanded.value, [name]: !expanded.value[name] }
}

async function load() {
  loading.value = true
  try {
    children.value = await invoke<DirChild[]>('list_dir', { id: props.instanceId, rel: props.dir })
  } catch {
    children.value = []
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>
