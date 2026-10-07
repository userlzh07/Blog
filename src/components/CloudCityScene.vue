<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { clamp, sceneMood, sceneTime, smoothstep, solarDayProgress, solarDayWindow } from '../lib/sceneClock'

const props = defineProps({
  girlSrc: { type: String, required: true },
})

const baseUrl = import.meta.env.BASE_URL
const embraceSrc = `${baseUrl}cloud-city-embrace.png`
const frameAssets = {
  night: `${baseUrl}cloud-city-frames/night-watch.png`,
  predawn: `${baseUrl}cloud-city-frames/predawn.png`,
  dawn: `${baseUrl}cloud-city-frames/dawn.png`,
  morning: `${baseUrl}cloud-city-frames/morning.png`,
  noon: `${baseUrl}cloud-city-clean.png`,
  afternoon: `${baseUrl}cloud-city-frames/afternoon.png`,
  sunset: `${baseUrl}cloud-city-frames/sunset.png`,
  bluehour: `${baseUrl}cloud-city-frames/bluehour.png`,
  watch: `${baseUrl}cloud-city-frames/night-watch.png`,
}

const artStyle = computed(() => ({
  filter: `brightness(${0.88 + sceneMood.value.daylight * 0.12}) saturate(${0.96 + sceneMood.value.daylight * 0.08})`,
}))

const keyframeBlend = computed(() => {
  const date = sceneTime.value
  const minute = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60
  const { sunrise, sunset } = solarDayWindow(date)
  const solarNoon = (sunrise + sunset) / 2
  const at = (key, frameMinute) => ({ minute: (frameMinute + 1440) % 1440, src: frameAssets[key] })
  const frames = [
    at('night', 0),
    at('predawn', sunrise - 105),
    at('dawn', sunrise + 12),
    at('morning', sunrise + 180),
    at('noon', solarNoon),
    at('afternoon', solarNoon + 180),
    at('sunset', sunset - 24),
    at('bluehour', sunset + 75),
    at('watch', sunset + 90),
  ].sort((a, b) => a.minute - b.minute)
  let index = frames.findLastIndex((frame) => frame.minute <= minute)
  if (index < 0) index = frames.length - 1
  const current = frames[index]
  const next = frames[(index + 1) % frames.length]
  const start = current.minute
  const end = next.minute > start ? next.minute : next.minute + 1440
  const adjustedMinute = minute < start ? minute + 1440 : minute
  const progress = clamp((adjustedMinute - start) / (end - start), 0, 1)
  return { current: current.src, next: next.src, nextOpacity: smoothstep(0, 1, progress) }
})

function random01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return value - Math.floor(value)
}

const rainDrops = Array.from({ length: 96 }, (_, index) => ({
  key: index,
  x: 20 + random01(index + 1) * 1880,
  y: random01(index + 102) * 1980,
  length: 28 + random01(index + 203) * 48,
  slant: 4 + random01(index + 304) * 9,
  width: 1 + random01(index + 405) * 0.7,
  opacity: 0.11 + random01(index + 506) * 0.2,
  duration: 1.05 + random01(index + 607) * 0.8,
  delay: random01(index + 708) * 1.8,
}))

const motion = computed(() => {
  const date = sceneTime.value
  const { sunrise, sunset } = solarDayWindow(date)
  const minutes = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60
  const continuousMinutes = minutes < sunrise ? minutes + 1440 : minutes
  const progress = solarDayProgress(date)
  const eased = progress ** 1.25
  // The girl's reaching hand should meet the boy's raised hand at the torii.
  // A small easing pulse in the last minutes gives the landing a soft catch.
  const catchProgress = smoothstep(0.975, 1, progress)
  const embraceOpacity = catchProgress * (1 - smoothstep(sunset + 75, sunset + 90, continuousMinutes))
  const offsetY = -280 + 1250 * eased - 9 * Math.sin(catchProgress * Math.PI)
  const offsetX = -64 * eased
  const girlFootY = clamp(280 + offsetY, 0, 1930)
  const startX = 914 + offsetX * 0.18
  const endX = 914 + offsetX
  const control1 = { x: startX + 58, y: girlFootY * 0.3 }
  const control2 = { x: endX - 48, y: girlFootY * 0.68 }
  const beforeSunrise = minutes < sunrise
  const visible = !beforeSunrise
  const trailOpacity = visible ? 0.86 * (1 - smoothstep(0.88, 1, progress)) : 0
  return {
    progress,
    transform: `translate(${offsetX.toFixed(1)} ${offsetY.toFixed(1)})`,
    catchProgress,
    embraceOpacity,
    catchRotation: -8 * catchProgress,
    visible,
    trailOpacity,
    startX,
    endX,
    girlFootY,
    control1,
    control2,
  }
})

const particles = computed(() => {
  const state = motion.value
  if (!state.visible || state.girlFootY < 14 || state.trailOpacity < 0.02) return []
  const pointAt = (t) => {
    const u = 1 - t
    const x = u ** 3 * state.startX + 3 * u ** 2 * t * state.control1.x + 3 * u * t ** 2 * state.control2.x + t ** 3 * state.endX
    const y = 3 * u ** 2 * t * state.control1.y + 3 * u * t ** 2 * state.control2.y + t ** 3 * state.girlFootY
    const dx = 3 * u ** 2 * (state.control1.x - state.startX) + 6 * u * t * (state.control2.x - state.control1.x) + 3 * t ** 2 * (state.endX - state.control2.x)
    const dy = 3 * u ** 2 * state.control1.y + 6 * u * t * (state.control2.y - state.control1.y) + 3 * t ** 2 * (state.girlFootY - state.control2.y)
    const tangentLength = Math.hypot(dx, dy) || 1
    return { x, y, nx: -dy / tangentLength, ny: dx / tangentLength }
  }
  const colors = ['#ff83d4', '#c38cff', '#8a83ff', '#66c9ff', '#64efff', '#fff0ca']
  const count = Math.min(30, Math.max(3, Math.floor(state.girlFootY / 48)))
  const shimmer = sceneTime.value.getTime() / 1000
  const positions = Array.from({ length: count }, (_, index) => 0.03 + random01(index + 809) * 0.94).sort((a, b) => a - b)
  return positions.map((t, index) => {
    const point = pointAt(t)
    const side = (random01(index + 910) - 0.5) * 112
    const flicker = 0.76 + 0.24 * Math.sin(shimmer * 3 + index * 2.31) ** 2
    return {
      key: index,
      cx: point.x + point.nx * side,
      cy: point.y + point.ny * side,
      r: 3.4 + random01(index + 1011) * 5.2,
      rotation: (random01(index + 1112) - 0.5) * 24,
      color: colors[Math.floor(random01(index + 1213) * colors.length)],
      opacity: (0.42 + 0.48 * t) * flicker,
    }
  })
})

const warmLightStyle = computed(() => {
  const { warmth, sunX, nightDim } = sceneMood.value
  return {
    background: `radial-gradient(ellipse at ${sunX * 100}% 14%, rgba(255, 168, 118, ${warmth * 0.42}) 0%, rgba(236, 112, 177, ${warmth * 0.18}) 24%, transparent 62%), linear-gradient(180deg, rgba(30, 52, 118, ${nightDim * 0.12}), transparent 66%)`,
  }
})

const nightShadeStyle = computed(() => {
  const nightDim = sceneMood.value.nightDim * 0.42
  return {
    background: `linear-gradient(rgba(10, 16, 44, ${nightDim}), rgba(10, 16, 44, ${nightDim})), linear-gradient(180deg, rgba(12, 16, 46, 0.22) 0%, rgba(12, 16, 46, 0.1) 5%, rgba(12, 16, 46, 0.02) 15%, rgba(14, 22, 56, 0.02) 45%, rgba(11, 17, 48, 0.36) 100%)`,
  }
})

const fireworkNight = computed(() => {
  const date = sceneTime.value
  const minutes = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60
  const { sunrise, sunset } = solarDayWindow(date)
  return minutes >= sunset + 90 || minutes < sunrise - 30
})

const sceneElement = ref(null)
const motionSvg = ref(null)
const fireworkCanvas = ref(null)
const fireworks = ref([])
const retiredFireworkBounds = []
const fireworkSceneVisible = ref(false)
let fireworkFrame = 0
let fireworkTimer = 0
let fireworkMounted = false
let fireworkVisibilityObserver = null
let fireworkResizeObserver = null
let fireworkWidth = 0
let fireworkHeight = 0
const fireworkColors = [
  ['#a9faff', '#41dfff', '#6388ff', '#ce78ff', '#fff3db'],
  ['#fff1c5', '#ffc56f', '#ff70bd', '#c376ff', '#68eaff'],
  ['#dcfaff', '#78e9ff', '#5d9dff', '#ac7dff', '#ff9ed8'],
  ['#fff4df', '#ff9fba', '#ff65d5', '#a875ff', '#72eaff'],
  ['#f5f3ff', '#9d8bff', '#6be5ff', '#79a8ff', '#ffe49e'],
]

function range(min, max) {
  return min + Math.random() * (max - min)
}

function launchFirework(x, y, automatic = false) {
  if (!fireworkNight.value || !fireworkSceneVisible.value || !fireworkCanvas.value) return
  const colors = fireworkColors[Math.floor(Math.random() * fireworkColors.length)]
  const startX = clamp(x, 30, 1890)
  const startY = clamp(y, 80, 1960)
  const burstX = startX
  const burstY = clamp(startY - range(automatic ? 560 : 420, automatic ? 920 : 840), 90, Math.max(120, startY - 150))
  const isLarge = Math.random() < 0.28
  const burstScale = isLarge ? range(1.45, 1.9) : range(0.82, 1.16)
  const launchSpeed = range(190, 260)
  const launchDuration = ((startY - burstY) / launchSpeed) * 1000
  const sparks = Array.from({ length: Math.floor(isLarge ? range(112, 148) : range(72, 102)) }, () => ({
    angle: range(0, Math.PI * 2),
    speed: range(165, 425) * burstScale,
    gravity: range(55, 125),
    life: range(1.15, 2.05),
    radius: range(2.2, 4.1) * Math.sqrt(burstScale),
    color: colors[Math.floor(Math.random() * colors.length)],
    phase: range(0, Math.PI * 2),
  }))
  fireworks.value.push({
    startX,
    startY,
    burstX,
    burstY,
    burstScale,
    launchDuration,
    startedAt: performance.now(),
    totalDuration: launchDuration + 2050,
    colors,
    sparks,
    automatic,
  })
  // Keep the composition lively without letting bursts pile up over the couple.
  if (fireworks.value.length > 4) {
    const retired = fireworks.value.shift()
    if (retired?.bounds) retiredFireworkBounds.push(retired.bounds)
  }
  if (!fireworkFrame) fireworkFrame = requestAnimationFrame(drawFireworks)
}

function rocketPoint(firework, progress) {
  return {
    x: firework.startX + (firework.burstX - firework.startX) * progress,
    y: firework.startY + (firework.burstY - firework.startY) * progress,
  }
}

function sparkPoint(firework, spark, elapsed) {
  const t = Math.max(0, elapsed)
  const drag = 0.82
  const distance = spark.speed * (1 - Math.exp(-drag * t)) / drag
  return {
    x: firework.burstX + Math.cos(spark.angle) * distance,
    y: firework.burstY + Math.sin(spark.angle) * distance + spark.gravity * t * t * 0.5,
  }
}

function includeFireworkPoint(bounds, x, y, padding) {
  bounds.left = Math.min(bounds.left, x - padding)
  bounds.top = Math.min(bounds.top, y - padding)
  bounds.right = Math.max(bounds.right, x + padding)
  bounds.bottom = Math.max(bounds.bottom, y + padding)
}

function finishFireworkBounds(bounds) {
  if (!Number.isFinite(bounds.left)) return null
  const left = clamp(Math.floor(bounds.left), 0, 1920)
  const top = clamp(Math.floor(bounds.top), 0, 1980)
  const right = clamp(Math.ceil(bounds.right), 0, 1920)
  const bottom = clamp(Math.ceil(bounds.bottom), 0, 1980)
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function drawFireworks(now) {
  fireworkFrame = 0
  const canvas = fireworkCanvas.value
  if (!canvas || !fireworkSceneVisible.value || document.hidden) return
  if (!fireworkWidth || !fireworkHeight) {
    fireworkWidth = canvas.clientWidth
    fireworkHeight = canvas.clientHeight
  }
  if (fireworkWidth <= 0 || fireworkHeight <= 0) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const pixelWidth = Math.round(fireworkWidth * dpr)
  const pixelHeight = Math.round(fireworkHeight * dpr)
  const resized = canvas.width !== pixelWidth || canvas.height !== pixelHeight
  if (resized) {
    canvas.width = pixelWidth
    canvas.height = pixelHeight
    for (const firework of fireworks.value) firework.bounds = null
    retiredFireworkBounds.length = 0
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(canvas.width / 1920, 0, 0, canvas.height / 1980, 0, 0)
  // Fireworks occupy only a fraction of this high-DPI canvas. Erase their
  // previous bounds instead of clearing nearly four million logical pixels.
  ctx.globalCompositeOperation = 'source-over'
  for (const bounds of retiredFireworkBounds) {
    ctx.clearRect(bounds.x, bounds.y, bounds.width, bounds.height)
  }
  retiredFireworkBounds.length = 0
  for (const firework of fireworks.value) {
    if (!firework.bounds) continue
    const { x, y, width, height } = firework.bounds
    ctx.clearRect(x, y, width, height)
  }
  ctx.globalCompositeOperation = 'lighter'
  let alive = false

  for (const firework of fireworks.value) {
    const age = now - firework.startedAt
    if (age >= firework.totalDuration) continue
    alive = true
    const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }
    const launchProgress = clamp(age / firework.launchDuration, 0, 1)
    if (launchProgress < 1) {
      const head = rocketPoint(firework, launchProgress)
      const trailProgress = Math.max(0, launchProgress - 0.5)
      const trailStart = rocketPoint(firework, trailProgress)
      includeFireworkPoint(bounds, head.x, head.y, 72)
      includeFireworkPoint(bounds, trailStart.x, trailStart.y, 72)
      // 尾迹：分段渐细 + 闪烁，尾部还沿途洒落火星
      const segments = 22
      ctx.lineCap = 'round'
      for (let i = 0; i < segments; i++) {
        const p0 = trailProgress + (launchProgress - trailProgress) * (i / segments)
        const p1 = trailProgress + (launchProgress - trailProgress) * ((i + 1) / segments)
        const a = rocketPoint(firework, p0)
        const b = rocketPoint(firework, p1)
        const k = (i + 1) / segments // 0=尾 1=头
        const flicker = 0.72 + 0.28 * Math.sin(now / 30 + i * 1.7 + firework.burstX)
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.strokeStyle = k > 0.82 ? '#fff6dd' : firework.colors[1]
        ctx.globalAlpha = (k ** 1.4) * 0.98 * flicker
        ctx.lineWidth = 0.6 + 7.6 * (k ** 1.5)
        ctx.shadowBlur = 26 * k
        ctx.shadowColor = firework.colors[1]
        ctx.stroke()
      }
      // 尾迹沿途掉落的火星微粒
      for (let i = 0; i < 14; i++) {
        const k = Math.random()
        const p = trailProgress + (launchProgress - trailProgress) * k
        const pt = rocketPoint(firework, p)
        const sparkX = pt.x + range(-4, 4)
        const sparkY = pt.y + range(-3, 3)
        includeFireworkPoint(bounds, sparkX, sparkY, 32)
        ctx.globalAlpha = 0.6 * k * Math.random()
        ctx.beginPath()
        ctx.arc(sparkX, sparkY, range(0.8, 2.4), 0, Math.PI * 2)
        ctx.fillStyle = Math.random() < 0.5 ? '#fff3d6' : firework.colors[1]
        ctx.shadowBlur = 10
        ctx.fill()
      }
      ctx.globalAlpha = 1
      ctx.shadowBlur = 0
      const core = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 15)
      core.addColorStop(0, '#ffffff')
      core.addColorStop(0.22, firework.colors[0])
      core.addColorStop(1, `${firework.colors[1]}00`)
      ctx.fillStyle = core
      ctx.beginPath()
      ctx.arc(head.x, head.y, 15, 0, Math.PI * 2)
      ctx.fill()
    } else {
      const burstAge = (age - firework.launchDuration) / 1000
      for (const spark of firework.sparks) {
        const lifeProgress = burstAge / spark.life
        if (lifeProgress >= 1) continue
        const here = sparkPoint(firework, spark, burstAge)
        const before = sparkPoint(firework, spark, Math.max(0, burstAge - 0.15))
        includeFireworkPoint(bounds, here.x, here.y, 72)
        includeFireworkPoint(bounds, before.x, before.y, 72)
        const fade = (1 - lifeProgress) ** 1.25
        const twinkle = 0.65 + 0.35 * Math.sin(now / 72 + spark.phase) ** 2
        ctx.globalAlpha = fade * twinkle
        ctx.beginPath()
        ctx.moveTo(before.x, before.y)
        ctx.lineTo(here.x, here.y)
        ctx.strokeStyle = spark.color
        ctx.lineWidth = spark.radius
        ctx.lineCap = 'round'
        ctx.shadowBlur = 17
        ctx.shadowColor = spark.color
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(here.x, here.y, spark.radius * 0.72, 0, Math.PI * 2)
        ctx.fillStyle = spark.color
        ctx.fill()
      }
      ctx.globalAlpha = 1
      ctx.shadowBlur = 0
    }
    firework.bounds = finishFireworkBounds(bounds)
  }
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
  for (let index = fireworks.value.length - 1; index >= 0; index -= 1) {
    const firework = fireworks.value[index]
    if (now - firework.startedAt >= firework.totalDuration) fireworks.value.splice(index, 1)
  }
  if (alive) fireworkFrame = requestAnimationFrame(drawFireworks)
}

function sceneClick(event) {
  if (!fireworkNight.value || !fireworkCanvas.value) return
  const rect = fireworkCanvas.value.getBoundingClientRect()
  const x = (event.clientX - rect.left) / rect.width * 1920
  const y = (event.clientY - rect.top) / rect.height * 1980
  launchFirework(x, y)
}

function scheduleAutomaticFirework() {
  window.clearTimeout(fireworkTimer)
  if (!fireworkMounted || !fireworkSceneVisible.value || document.hidden || !fireworkNight.value) return
  fireworkTimer = window.setTimeout(() => {
    if (!fireworkNight.value || !fireworkSceneVisible.value || document.hidden) return
    const leftLane = Math.random() < 0.5
    const x = leftLane ? range(810, 900) : range(1220, 1770)
    launchFirework(x, range(1710, 1930), true)
    scheduleAutomaticFirework()
  }, range(1900, 3900))
}

function syncSceneActivity() {
  const active = fireworkSceneVisible.value && !document.hidden
  if (active) {
    motionSvg.value?.unpauseAnimations?.()
    if (fireworkNight.value) scheduleAutomaticFirework()
    if (fireworks.value.length && !fireworkFrame) {
      fireworkFrame = requestAnimationFrame(drawFireworks)
    }
    return
  }

  motionSvg.value?.pauseAnimations?.()
  window.clearTimeout(fireworkTimer)
  fireworkTimer = 0
  if (fireworkFrame) cancelAnimationFrame(fireworkFrame)
  fireworkFrame = 0
}

watch(fireworkNight, (isNight) => {
  if (!fireworkMounted) return
  if (isNight && fireworkSceneVisible.value && !document.hidden) {
    scheduleAutomaticFirework()
  } else if (!isNight) {
    window.clearTimeout(fireworkTimer)
    fireworkTimer = 0
    fireworks.value = []
    retiredFireworkBounds.length = 0
    if (fireworkFrame) cancelAnimationFrame(fireworkFrame)
    fireworkFrame = 0
    const ctx = fireworkCanvas.value?.getContext('2d')
    if (ctx && fireworkCanvas.value) {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, fireworkCanvas.value.width, fireworkCanvas.value.height)
    }
  }
})

onMounted(() => {
  fireworkMounted = true
  fireworkVisibilityObserver = new IntersectionObserver((entries) => {
    fireworkSceneVisible.value = Boolean(entries[0]?.isIntersecting)
    syncSceneActivity()
  }, { threshold: 0 })
  if (sceneElement.value) fireworkVisibilityObserver.observe(sceneElement.value)

  fireworkResizeObserver = new ResizeObserver((entries) => {
    const size = entries[0]?.contentRect
    if (!size) return
    fireworkWidth = size.width
    fireworkHeight = size.height
  })
  if (fireworkCanvas.value) fireworkResizeObserver.observe(fireworkCanvas.value)
  document.addEventListener('visibilitychange', syncSceneActivity)
})

onUnmounted(() => {
  fireworkMounted = false
  document.removeEventListener('visibilitychange', syncSceneActivity)
  window.clearTimeout(fireworkTimer)
  if (fireworkFrame) cancelAnimationFrame(fireworkFrame)
  fireworkVisibilityObserver?.disconnect()
  fireworkResizeObserver?.disconnect()
  fireworkVisibilityObserver = null
  fireworkResizeObserver = null
})

</script>

<template>
  <div
    ref="sceneElement"
    class="cloud-city-scene"
    :class="{ 'is-firework-night': fireworkNight }"
    :style="artStyle"
    aria-label="从日出到日落的云城相遇"
    @click="sceneClick"
  >
    <img class="city-base" :src="keyframeBlend.current" alt="" />
    <img class="city-frame-next" :src="keyframeBlend.next" :style="{ opacity: keyframeBlend.nextOpacity }" alt="" />
    <svg ref="motionSvg" class="city-motion" viewBox="0 0 1920 1980" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <filter id="droplet-glow" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <radialGradient id="catch-glow">
          <stop offset="0%" stop-color="#fff8dc" stop-opacity="0.7" />
          <stop offset="35%" stop-color="#ffd8a6" stop-opacity="0.35" />
          <stop offset="100%" stop-color="#ffb5de" stop-opacity="0" />
        </radialGradient>
      </defs>

      <g class="rainfall" stroke="#f4fbff" stroke-linecap="round">
        <g v-for="drop in rainDrops" :key="drop.key" :transform="`translate(${drop.x} ${drop.y})`">
          <line
            x1="0"
            :y1="-drop.length"
            :x2="-drop.slant"
            y2="0"
            :stroke-width="drop.width"
            :stroke-opacity="drop.opacity"
          >
            <animateTransform
              attributeName="transform"
              type="translate"
              :values="`0 ${-drop.y - drop.length}; 0 ${1980 - drop.y}`"
              :dur="`${drop.duration}s`"
              :begin="`${drop.delay}s`"
              repeatCount="indefinite"
            />
          </line>
        </g>
      </g>

      <g :opacity="motion.trailOpacity">
        <circle
          v-for="particle in particles"
          :key="particle.key"
          :cx="particle.cx"
          :cy="particle.cy"
          :r="particle.r * 1.55"
          :fill="particle.color"
          :opacity="particle.opacity * 0.28"
          filter="url(#droplet-glow)"
        />
        <g v-for="particle in particles" :key="`bead-${particle.key}`" :transform="`rotate(${particle.rotation} ${particle.cx} ${particle.cy})`">
          <ellipse :cx="particle.cx" :cy="particle.cy" :rx="particle.r * 0.72" :ry="particle.r * 1.12" :fill="particle.color" :opacity="particle.opacity" />
          <ellipse :cx="particle.cx - particle.r * 0.2" :cy="particle.cy - particle.r * 0.32" :rx="particle.r * 0.22" :ry="particle.r * 0.32" fill="#ffffff" :opacity="particle.opacity * 0.85" />
        </g>
      </g>

      <g v-if="motion.visible" :transform="motion.transform" class="falling-girl" :opacity="1 - motion.catchProgress">
        <!-- The extracted sprite is scaled and placed over its original figure bounds. -->
        <g :transform="`rotate(${motion.catchRotation} 910 758)`">
          <circle cx="910" cy="758" r="42" fill="url(#catch-glow)" :opacity="motion.catchProgress * 0.72" />
          <image :href="props.girlSrc" x="682" y="272" width="453" height="503" preserveAspectRatio="none" />
        </g>
      </g>
    </svg>
    <div class="city-time-wash" :style="warmLightStyle" aria-hidden="true"></div>
    <div class="city-night-shade" :style="nightShadeStyle" aria-hidden="true"></div>
    <canvas ref="fireworkCanvas" class="fireworks-canvas" aria-hidden="true"></canvas>
    <img
      class="city-embrace"
      :src="embraceSrc"
      :style="{ opacity: motion.embraceOpacity }"
      alt=""
    />
  </div>
</template>

<style scoped>
.cloud-city-scene {
  position: relative;
  width: 100%;
  overflow: hidden;
}

.city-base {
  display: block;
  width: 100%;
  height: auto;
}

.city-frame-next {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: fill;
  pointer-events: none;
}

.city-time-wash,
.city-night-shade,
.city-motion,
.city-embrace,
.fireworks-canvas {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.city-embrace {
  object-fit: fill;
}

.fireworks-canvas {
  z-index: 2;
  pointer-events: none;
}

.city-night-shade {
  z-index: 1;
}

.city-embrace {
  z-index: 3;
}

.is-firework-night {
  cursor: crosshair;
}

.city-time-wash {
  opacity: 0.96;
  mix-blend-mode: screen;
}

.falling-girl {
  filter: drop-shadow(0 0 9px rgba(91, 151, 255, 0.28)) drop-shadow(0 0 24px rgba(192, 66, 255, 0.2));
}
</style>
