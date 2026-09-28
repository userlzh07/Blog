<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

const query = new URLSearchParams(window.location.search)
const enabled = query.get('preview') === '1'
const speedOptions = [
  { value: 1, label: '1×（实时）' },
  { value: 10, label: '10×' },
  { value: 60, label: '60×' },
  { value: 300, label: '300×' },
  { value: 500, label: '500×' },
  { value: 900, label: '900×' },
  { value: 1800, label: '1800×' },
  { value: 3600, label: '3600×' },
]

const clampSpeed = (value) => Math.min(3600, Math.max(1, Math.round(value)))
const speed = ref(clampSpeed(Number(query.get('timeScale')) || 60))
const previewTimeParam = query.get('previewTime')
const parsedPreviewTime = previewTimeParam ? new Date(previewTimeParam) : null
const fallbackTime = new Date()
fallbackTime.setHours(18, 30, 0, 0)
const timestamp = ref(
  parsedPreviewTime && !Number.isNaN(parsedPreviewTime.getTime())
    ? parsedPreviewTime.getTime()
    : fallbackTime.getTime(),
)

const pad = (value) => String(value).padStart(2, '0')
const toLocalInput = (value) => {
  const date = new Date(value)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

const timeInput = computed({
  get: () => toLocalInput(timestamp.value),
  set: (value) => {
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return
    timestamp.value = parsed.getTime()
    emitClock()
    syncUrl()
  },
})

const formattedTime = computed(() => new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
}).format(new Date(timestamp.value)))

let timer = 0
let suppressUrlSync = true

function emitClock() {
  if (!enabled) return
  window.dispatchEvent(new CustomEvent('sky:preview-clock', {
    detail: {
      timestamp: timestamp.value,
      timeScale: speed.value,
    },
  }))
}

function syncUrl() {
  if (!enabled || suppressUrlSync) return
  const url = new URL(window.location.href)
  url.searchParams.set('preview', '1')
  url.searchParams.set('previewTime', toLocalInput(timestamp.value))
  url.searchParams.set('timeScale', String(speed.value))
  window.history.replaceState(null, '', url)
}

watch(speed, () => {
  emitClock()
  syncUrl()
})

onMounted(() => {
  if (!enabled) return
  emitClock()
  suppressUrlSync = false
  timer = window.setInterval(() => {
    timestamp.value += 500 * speed.value
    emitClock()
  }, 500)
})

onUnmounted(() => {
  if (timer) window.clearInterval(timer)
})
</script>

<template>
  <aside v-if="enabled" class="time-preview-panel">
    <div class="panel-title">虚拟时间预览</div>

    <label class="field">
      <span>时间</span>
      <input v-model="timeInput" type="datetime-local" step="1">
    </label>

    <label class="field">
      <span>速度</span>
      <select v-model.number="speed">
        <option v-for="option in speedOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </label>

    <div class="readout">{{ formattedTime }}</div>
    <div class="hint">当前为虚拟时间，与现实时刻无关</div>
  </aside>
</template>

<style scoped>
.time-preview-panel {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 1001;
  width: min(300px, calc(100vw - 32px));
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 14px;
  background: rgba(11, 17, 42, 0.78);
  color: #edf4ff;
  box-shadow: 0 10px 34px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(12px);
  font-size: 13px;
}

.panel-title {
  margin-bottom: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.field {
  display: grid;
  grid-template-columns: 42px 1fr;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.field span {
  color: rgba(237, 244, 255, 0.72);
}

.field input,
.field select {
  min-width: 0;
  padding: 7px 9px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 8px;
  outline: none;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font: inherit;
}

.field input:focus,
.field select:focus {
  border-color: rgba(130, 220, 255, 0.75);
  box-shadow: 0 0 0 2px rgba(91, 190, 255, 0.16);
}

.field option {
  color: #17203e;
  background: #fff;
}

.readout {
  margin-top: 10px;
  font-variant-numeric: tabular-nums;
  color: #9fe8ff;
}

.hint {
  margin-top: 4px;
  color: rgba(237, 244, 255, 0.58);
  font-size: 12px;
}
</style>
