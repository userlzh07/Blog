<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { currentSceneDate, calculateSolarPosition } from '../lib/sceneClock'
import { calculateMoonPosition } from '../lib/moonPhase'

const BASE = import.meta.env.BASE_URL
const DEMO_FLIGHT = new URLSearchParams(window.location.search).get('demoPlane') === '1'
const canvas = ref(null)
const starCanvas = ref(null)
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const flightVisible = ref(false)
const moonPhase = ref({ name: '月相计算中', illumination: 0, waxing: true })
const moonReady = ref(false)
const CANVAS_SIZE = 900
const MOON_CENTER = CANVAS_SIZE / 2
// The extracted lunar disc includes a little transparent breathing room.
const MOON_RADIUS = CANVAS_SIZE * 0.405

let moonImage
let clockTimer = 0
let flightTimer = 0
let flightStartPending = false
let previousClock = null
let lastPhaseMinute = null
let lastFlightDay = ''

function phaseName(illumination, waxing) {
  if (illumination < 0.035) return '新月'
  if (illumination > 0.965) return '满月'
  if (Math.abs(illumination - 0.5) < 0.035) return waxing ? '上弦月' : '下弦月'
  if (illumination < 0.5) return waxing ? '娥眉月' : '残月'
  return waxing ? '盈凸月' : '亏凸月'
}

function smoothstep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function renderMoon(date) {
  if (!canvas.value || !moonImage?.complete || !moonImage.naturalWidth) return
  const context = canvas.value.getContext('2d', { willReadFrequently: true })
  if (!context) return

  const solar = calculateSolarPosition(date)
  const moon = calculateMoonPosition(date, solar)
  const illumination = Math.max(0, Math.min(1, moon.illumination))
  const terminatorZ = illumination * 2 - 1
  const horizontalLight = Math.sqrt(Math.max(0, 1 - terminatorZ * terminatorZ))
  // Position angle keeps the illuminated side oriented with the actual Sun/Moon geometry.
  const lightX = horizontalLight * Math.sin(moon.brightLimbAngle)
  const lightY = -horizontalLight * Math.cos(moon.brightLimbAngle)

  context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
  context.drawImage(moonImage, 0, 0, CANVAS_SIZE, CANVAS_SIZE)
  const pixels = context.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE)
  const data = pixels.data
  const inverseRadius = 1 / MOON_RADIUS

  for (let y = 0; y < CANVAS_SIZE; y += 1) {
    const ny = (y + 0.5 - MOON_CENTER) * inverseRadius
    for (let x = 0; x < CANVAS_SIZE; x += 1) {
      const offset = (y * CANVAS_SIZE + x) * 4
      const alpha = data[offset + 3]
      if (alpha < 8) continue

      const nx = (x + 0.5 - MOON_CENTER) * inverseRadius
      const radiusSquared = nx * nx + ny * ny
      if (radiusSquared > 1.04) continue
      const nz = Math.sqrt(Math.max(0, 1 - radiusSquared))
      const incidence = nx * lightX + ny * lightY + nz * terminatorZ
      const daylight = smoothstep(-0.018, 0.018, incidence)
      const brightness = 0.075 + daylight * (0.925 + Math.max(0, incidence) * 0.08)
      const shadow = 1 - brightness

      // Leave a little blue night-side bounce so the original warm lunar texture remains visible.
      data[offset] = Math.min(255, data[offset] * brightness + 7 * shadow)
      data[offset + 1] = Math.min(255, data[offset + 1] * brightness + 11 * shadow)
      data[offset + 2] = Math.min(255, data[offset + 2] * brightness + 26 * shadow)
    }
  }

  context.putImageData(pixels, 0, 0)
  moonReady.value = true
  moonPhase.value = {
    name: phaseName(illumination, moon.waxing),
    illumination,
    waxing: moon.waxing,
  }
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function startAirplane() {
  if (flightTimer || flightStartPending) return
  flightVisible.value = false
  flightStartPending = true
  window.requestAnimationFrame(() => {
    flightStartPending = false
    flightVisible.value = true
    flightTimer = window.setTimeout(() => {
      flightVisible.value = false
      flightTimer = 0
    }, 13600)
  })
}

function updateFromClock() {
  const date = currentSceneDate()
  const minuteStamp = Math.floor(date.getTime() / 60000)
  if (minuteStamp !== lastPhaseMinute) {
    renderMoon(date)
    lastPhaseMinute = minuteStamp
  }

  const day = dateKey(date)
  const minuteOfDay = date.getHours() * 60 + date.getMinutes()
  const crossedTen = previousClock && previousClock.day === day && previousClock.minute < 22 * 60 && minuteOfDay >= 22 * 60
  const openedAtTen = !previousClock && date.getHours() === 22 && date.getMinutes() === 0
  if ((crossedTen || openedAtTen) && lastFlightDay !== day) {
    lastFlightDay = day
    startAirplane()
  }
  previousClock = { day, minute: minuteOfDay }
}

onMounted(() => {
  moonImage = new Image()
  moonImage.onload = () => {
    lastPhaseMinute = null
    updateFromClock()
  }
  moonImage.src = `${BASE}moon-disk.png`
  updateFromClock()
  if (DEMO_FLIGHT) startAirplane()
  clockTimer = window.setInterval(updateFromClock, 1000)
  startStars()
})

onUnmounted(() => {
  if (clockTimer) window.clearInterval(clockTimer)
  if (flightTimer) window.clearTimeout(flightTimer)
  stopStars()
})

// ===== 眨眼星空 =====
let starSeeds = []
let starRaf = 0
let starObserver = null

function seedStars() {
  const cvs = starCanvas.value
  if (!cvs) return
  const count = Math.max(64, Math.min(150, Math.round((cvs.clientWidth * cvs.clientHeight) / 5200)))
  starSeeds = Array.from({ length: count }, () => ({
    x: Math.random(),
    y: Math.random(),
    radius: 0.5 + Math.random() * 1.25,
    // 快慢不一的眨眼：基础闪烁 + 偶发的深闪
    speed: 0.5 + Math.random() * 1.8,
    blinkSpeed: 0.2 + Math.random() * 0.45,
    phase: Math.random() * Math.PI * 2,
    base: 0.35 + Math.random() * 0.55,
    warm: Math.random() < 0.16,
  }))
}

function sizeStarCanvas() {
  const cvs = starCanvas.value
  if (!cvs) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  cvs.width = Math.round(cvs.clientWidth * dpr)
  cvs.height = Math.round(cvs.clientHeight * dpr)
}

function drawStars(now) {
  const cvs = starCanvas.value
  if (!cvs) return
  const ctx = cvs.getContext('2d')
  if (!ctx) return
  const w = cvs.width
  const h = cvs.height
  ctx.clearRect(0, 0, w, h)
  const t = now / 1000
  for (const star of starSeeds) {
    const twinkle = 0.55 + 0.45 * Math.sin(t * star.speed + star.phase) ** 2
    const blink = 0.68 + 0.32 * Math.sin(t * star.blinkSpeed + star.phase * 2.3) ** 6
    const alpha = star.base * twinkle * blink
    const r = star.radius * (0.8 + 0.4 * twinkle)
    ctx.beginPath()
    ctx.arc(star.x * w, star.y * h, r, 0, Math.PI * 2)
    ctx.fillStyle = star.warm
      ? `rgba(255, 233, 205, ${alpha})`
      : `rgba(206, 224, 255, ${alpha})`
    ctx.fill()
    if (star.radius > 1.25) {
      ctx.shadowBlur = 6
      ctx.shadowColor = star.warm ? 'rgba(255, 226, 180, 0.8)' : 'rgba(180, 205, 255, 0.8)'
    }
  }
  ctx.shadowBlur = 0
  if (!reducedMotion) starRaf = requestAnimationFrame(drawStars)
}

function startStars() {
  const cvs = starCanvas.value
  if (!cvs) return
  seedStars()
  sizeStarCanvas()
  if (reducedMotion) {
    drawStars(0)
    return
  }
  // 滚出视口时暂停，省电
  starObserver = new IntersectionObserver((entries) => {
    if (entries[0]?.isIntersecting) {
      if (!starRaf) starRaf = requestAnimationFrame(drawStars)
    } else if (starRaf) {
      cancelAnimationFrame(starRaf)
      starRaf = 0
    }
  })
  starObserver.observe(cvs)
  starRaf = requestAnimationFrame(drawStars)
  window.addEventListener('resize', onStarResize)
}

function onStarResize() {
  if (!starCanvas.value) return
  sizeStarCanvas()
  if (reducedMotion) drawStars(0)
}

function stopStars() {
  if (starRaf) cancelAnimationFrame(starRaf)
  starRaf = 0
  if (starObserver) starObserver.disconnect()
  starObserver = null
  window.removeEventListener('resize', onStarResize)
}
</script>

<template>
  <div class="moon-scene" :style="{ '--moon-glow': 0.28 + moonPhase.illumination * 0.42 }">
    <canvas ref="starCanvas" class="star-field" aria-hidden="true"></canvas>
    <div class="moon-aura" aria-hidden="true"></div>
    <canvas
      ref="canvas"
      class="moon-face"
      width="900"
      height="900"
      role="img"
      :aria-label="`当前月相：${moonPhase.name}，受光面约 ${Math.round(moonPhase.illumination * 100)}%`"
      style="display: block; width: 100%; height: 100%"
      :style="{ opacity: moonReady ? 1 : 0, transition: 'opacity 1.2s ease' }"
    ></canvas>
    <img
      v-if="flightVisible"
      class="moon-airplane"
      :src="`${BASE}moon-airplane.png`"
      :style="{
        filter: moonPhase.illumination < 0.28
          ? 'drop-shadow(0 0 4px rgba(255, 226, 177, 0.95)) drop-shadow(0 0 12px rgba(246, 191, 111, 0.52))'
          : 'drop-shadow(0 1px 3px rgba(5, 8, 21, 0.38)) drop-shadow(0 0 4px rgba(255, 229, 183, 0.56))',
      }"
      alt=""
      aria-hidden="true"
    />
    <div class="moon-caption" aria-live="polite">
      <span class="phase-name">{{ moonPhase.name }}</span>
      <span class="phase-divider">·</span>
      <span class="phase-illumination">{{ Math.round(moonPhase.illumination * 100) }}% 受光</span>
    </div>
  </div>
</template>

<style scoped>
.moon-scene {
  position: relative;
  width: min(78vw, 640px, 72svh);
  aspect-ratio: 1;
  isolation: isolate;
  display: grid;
  place-items: center;
}

.star-field {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: -2;
  pointer-events: none;
}

.moon-aura {
  position: absolute;
  inset: 4%;
  border-radius: 50%;
  z-index: -1;
  background:
    radial-gradient(ellipse at 51% 48%, rgba(255, 217, 154, 0.2), rgba(230, 173, 112, 0.1) 34%, transparent 70%),
    radial-gradient(ellipse at 45% 53%, rgba(113, 139, 184, 0.1), transparent 69%);
  filter: blur(34px) saturate(1.18);
  opacity: var(--moon-glow);
  transition: opacity 1s ease;
}

.moon-aura::before,
.moon-aura::after {
  content: '';
  position: absolute;
  inset: -4%;
  border-radius: 50%;
  pointer-events: none;
}

.moon-aura::before {
  background:
    radial-gradient(ellipse at 31% 43%, rgba(255, 218, 159, 0.2), transparent 37%),
    radial-gradient(ellipse at 68% 36%, rgba(142, 170, 218, 0.14), transparent 34%),
    radial-gradient(ellipse at 62% 72%, rgba(242, 174, 114, 0.16), transparent 41%),
    radial-gradient(ellipse at 31% 70%, rgba(170, 183, 211, 0.1), transparent 35%);
  filter: blur(22px);
  opacity: 0.82;
  transform: rotate(-8deg) scale(1.08, 0.94);
}

.moon-aura::after {
  inset: 3%;
  background: conic-gradient(
    from 12deg,
    transparent 0deg,
    rgba(255, 213, 151, 0.12) 42deg,
    transparent 93deg,
    rgba(130, 158, 206, 0.1) 163deg,
    transparent 221deg,
    rgba(244, 180, 119, 0.1) 286deg,
    transparent 360deg
  );
  -webkit-mask-image: radial-gradient(circle, transparent 39%, #000 50%, #000 68%, transparent 80%);
  mask-image: radial-gradient(circle, transparent 39%, #000 50%, #000 68%, transparent 80%);
  filter: blur(19px);
  opacity: 0.75;
}

.moon-face {
  display: block;
  width: 100%;
  height: 100%;
  filter:
    drop-shadow(0 0 18px rgba(250, 207, 143, 0.13))
    drop-shadow(0 12px 55px rgba(247, 182, 99, 0.16));
}

.moon-caption {
  position: absolute;
  left: 50%;
  bottom: 6.5%;
  display: flex;
  align-items: center;
  gap: 12px;
  color: rgba(255, 237, 205, 0.76);
  white-space: nowrap;
  font-size: 0.82rem;
  letter-spacing: 0.11em;
  transform: translateX(-50%);
  text-shadow: 0 2px 16px rgba(0, 0, 0, 0.5);
  transition: opacity 0.65s ease;
}

.phase-name {
  color: #f7d69e;
}

.phase-divider {
  opacity: 0.45;
}

.moon-airplane {
  position: absolute;
  z-index: 2;
  left: 50%;
  top: 50%;
  width: 82%;
  height: auto;
  pointer-events: none;
  animation: moon-plane-cross 13.5s linear both;
  filter: drop-shadow(0 1px 3px rgba(5, 8, 21, 0.38));
}

@keyframes moon-plane-cross {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) translateX(-132%);
  }
  8% { opacity: 0.94; }
  90% { opacity: 0.94; }
  100% {
    opacity: 0;
    transform: translate(-50%, -50%) translateX(132%);
  }
}

@media (max-width: 600px) {
  .moon-scene { width: min(94vw, 560px, 70svh); }
  .moon-caption { bottom: 5%; font-size: 0.73rem; }
}

@media (prefers-reduced-motion: reduce) {
  .moon-airplane { animation-duration: 6s; }
}
</style>
