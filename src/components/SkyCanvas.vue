<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { calculateSolarPosition, clamp, smoothstep } from '../lib/sceneClock'
import { calculateMoonPosition } from '../lib/moonPhase'

const BASE = import.meta.env.BASE_URL
const canvas = ref(null)
const COMETS_PER_HOUR = 10
const COMET_HORIZON_ALTITUDE = -0.2 // 太阳完全落到地平线下后才出现
const COMET_TAIL_SEGMENTS = 112
const RIPPLE_POINTS = 80
const RIPPLE_COS = new Float64Array(RIPPLE_POINTS)
const RIPPLE_SIN = new Float64Array(RIPPLE_POINTS)
const RIPPLE_TRIPLE_COS = new Float64Array(RIPPLE_POINTS)
const RIPPLE_TRIPLE_SIN = new Float64Array(RIPPLE_POINTS)
for (let point = 0; point < RIPPLE_POINTS; point++) {
  const angle = (point / RIPPLE_POINTS) * Math.PI * 2
  RIPPLE_COS[point] = Math.cos(angle)
  RIPPLE_SIN[point] = Math.sin(angle)
  RIPPLE_TRIPLE_COS[point] = Math.cos(angle * 3)
  RIPPLE_TRIPLE_SIN[point] = Math.sin(angle * 3)
}
// Reused scratch space for the tail mesh. The comet is drawn synchronously on
// one canvas, so these buffers can be shared by the main and split trails.
const cometTailX = new Float64Array(COMET_TAIL_SEGMENTS + 1)
const cometTailY = new Float64Array(COMET_TAIL_SEGMENTS + 1)
const cometTailNormalX = new Float64Array(COMET_TAIL_SEGMENTS + 1)
const cometTailNormalY = new Float64Array(COMET_TAIL_SEGMENTS + 1)
const cometTailHalfWidth = new Float64Array(COMET_TAIL_SEGMENTS + 1)
const COMET_PATHS = [
  { startX: 1.05, startY: -0.035, endX: 0.42, endY: 0.15, arc: 0.024, duration: 7.8 },
  { startX: -0.06, startY: -0.02, endX: 0.68, endY: 0.15, arc: -0.018, duration: 6.2 },
  { startX: 0.16, startY: -0.045, endX: 0.94, endY: 0.16, arc: 0.018, duration: 10.1 },
  { startX: 0.98, startY: -0.01, endX: 0.14, endY: 0.15, arc: -0.024, duration: 11.6 },
  { startX: 0.33, startY: -0.03, endX: 0.72, endY: 0.16, arc: 0.03, duration: 5.8 },
  { startX: 0.72, startY: -0.04, endX: 0.23, endY: 0.16, arc: -0.028, duration: 9.1 },
  { startX: -0.04, startY: 0.04, endX: 0.55, endY: 0.15, arc: 0.02, duration: 6.7 },
  { startX: 1.08, startY: -0.025, endX: 0.36, endY: 0.14, arc: -0.018, duration: 12.3 },
  { startX: 0.1, startY: -0.045, endX: 0.82, endY: 0.16, arc: 0.027, duration: 7.1 },
  { startX: 0.91, startY: -0.03, endX: 0.58, endY: 0.16, arc: -0.032, duration: 8.4 },
  { startX: 0.4, startY: -0.02, endX: 0.97, endY: 0.15, arc: 0.012, duration: 5.6 },
  { startX: 1.02, startY: 0.04, endX: 0.31, endY: 0.15, arc: 0.024, duration: 10.7 },
]
const SCENE_ASSETS = {
  dawn: `${BASE}sky/time-of-day/dawn.png`,
  noon: `${BASE}sky/time-of-day/noon.png`,
  afternoon: `${BASE}sky/time-of-day/afternoon.png`,
  sunset: `${BASE}sky/crater-base-no-sun.png`,
  blueHour: `${BASE}sky/time-of-day/blue-hour.png`,
  night: `${BASE}sky/time-of-day/night.png`,
}
const SCENE_ART_ANCHORS = [
  { minute: 0, scene: 'night' },
  { minute: 270, scene: 'night' },
  { minute: 300, scene: 'dawn' },
  { minute: 510, scene: 'noon' },
  { minute: 720, scene: 'noon' },
  { minute: 930, scene: 'afternoon' },
  { minute: 1050, scene: 'afternoon' },
  { minute: 1080, scene: 'sunset' },
  { minute: 1125, scene: 'sunset' },
  { minute: 1170, scene: 'blueHour' },
  { minute: 1230, scene: 'night' },
  { minute: 1440, scene: 'night' },
]
// ?preview=1 进入虚拟时间预览；可用 timeScale 调整流逝速度，用 previewTime 指定起点。
// 预览默认从今天 18:30 开始、以 60 倍速运行；正常访问始终使用真实时间。
const query = new URLSearchParams(window.location.search)
const PREVIEW_MODE = query.get('preview') === '1'
const requestedTimeScale = Number(query.get('timeScale')) || (PREVIEW_MODE ? 60 : 1)
const maxTimeScale = PREVIEW_MODE ? 3600 : 500
const TIME_SCALE = Math.min(maxTimeScale, Math.max(1, requestedTimeScale))
const DEMO_COMET = query.get('demoComet') === '1'
const parsedPreviewTime = query.get('previewTime') ? new Date(query.get('previewTime')) : null
const previewFallbackTime = new Date()
previewFallbackTime.setHours(18, 30, 0, 0)
const PREVIEW_START_TIMESTAMP = PREVIEW_MODE
  ? (parsedPreviewTime && !Number.isNaN(parsedPreviewTime.getTime()) ? parsedPreviewTime.getTime() : previewFallbackTime.getTime())
  : 0

let ctx
let backdropCanvas
let backdropContext
let backdropFrameKey = null
let image
let sceneImages = new Map()
const pendingSceneImages = new Map()
let neededSceneNames = new Set()
let sceneImageLoadPromise = null
let frameRect
let raf = 0
let timeInterval = 0
let running = false
let sceneVisible = false
let sceneObserver = null
let reducedMotion = false
let width = 0
let height = 0
let pixelRatio = 1
let lastRender = 0
let lastClockWallTime = 0
let simulatedTimestamp = 0
let simulatedSeconds = 0
let activeTimeScale = TIME_SCALE
let shimmerSeeds = []
let starSeeds = []
let clouds = []
let birdFlocks = []
let ripples = []
let nextAmbientRippleAt = 0
let grainCanvas
let grainPattern
let cloudPuffSprites = new Map()
let cloudPuffPaletteKey = ''
let cloudReflectionSprite = null
let cloudReflectionColorKey = ''
let lakeReflectionSprite = null
const cometBranchProgressCache = new WeakMap()
let cachedCometBranchPathIndex = null
let cachedCometBranchMotion = null

const quantizeCloudColor = (color) => color.map((channel) => Math.round(channel / 2) * 2)

const mix = (a, b, t) => a + (b - a) * t

function mixColor(a, b, t) {
  return a.map((channel, index) => Math.round(mix(channel, b[index], clamp(t, 0, 1))))
}

function rgba(color, alpha) {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${clamp(alpha, 0, 1)})`
}

function sceneLayersAtMinute(minute) {
  const nextIndex = SCENE_ART_ANCHORS.findIndex((anchor) => anchor.minute > minute)
  const before = SCENE_ART_ANCHORS[nextIndex === -1 ? SCENE_ART_ANCHORS.length - 2 : nextIndex - 1]
  const after = SCENE_ART_ANCHORS[nextIndex === -1 ? SCENE_ART_ANCHORS.length - 1 : nextIndex]
  const progress = smoothstep(before.minute, after.minute, minute)
  return [
    { scene: before.scene, weight: 1 - progress },
    { scene: after.scene, weight: progress },
  ]
}

// 48 half-hour scene samples, each blending full time-of-day paintings instead of tinting one sunset.
const SCENE_HALF_HOUR_FRAMES = Array.from({ length: 48 }, (_, index) => sceneLayersAtMinute(index * 30))

function sceneWeightsAt(date) {
  const minuteOfDay = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60 + date.getMilliseconds() / 60000
  const position = minuteOfDay / 30
  const index = Math.floor(position) % SCENE_HALF_HOUR_FRAMES.length
  const next = (index + 1) % SCENE_HALF_HOUR_FRAMES.length
  const blend = smoothstep(0, 1, position - Math.floor(position))
  const weights = new Map()
  for (const layer of SCENE_HALF_HOUR_FRAMES[index]) {
    weights.set(layer.scene, (weights.get(layer.scene) || 0) + layer.weight * (1 - blend))
  }
  for (const layer of SCENE_HALF_HOUR_FRAMES[next]) {
    weights.set(layer.scene, (weights.get(layer.scene) || 0) + layer.weight * blend)
  }
  return weights
}

function drawCover(source) {
  const scale = Math.max(width / source.width, height / source.height)
  const drawWidth = source.width * scale
  const drawHeight = source.height * scale
  frameRect = {
    left: (width - drawWidth) / 2,
    top: (height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  }
  ctx.drawImage(source, frameRect.left, frameRect.top, drawWidth, drawHeight)
}

function drawSceneAtTime(date) {
  const weights = sceneWeightsAt(date)
  ensureSceneImages(weights)
  let fallbackSource = image
  for (const [name, weight] of weights) {
    if (weight > 0 && sceneImages.has(name)) {
      fallbackSource = touchSceneImage(name)
      break
    }
  }

  let baseSource = null
  let accumulatedWeight = 0
  for (const [name, weight] of weights) {
    if (weight <= 0) continue
    const source = touchSceneImage(name) || fallbackSource
    if (!source) continue
    baseSource = source
    accumulatedWeight = weight
    break
  }
  if (!baseSource) baseSource = fallbackSource

  ctx.save()
  // The time-of-day plates are opaque RGB images with identical dimensions.
  // Copying the first plate replaces last frame's pixels, so drawFrame no
  // longer needs a separate full-screen clear before painting the scene.
  ctx.globalCompositeOperation = 'copy'
  ctx.globalAlpha = 1
  if (baseSource) drawCover(baseSource)

  // Source-over with a cumulative weight reproduces the same weighted RGB mix
  // as the old lighter blend, while retaining the full opacity of the base.
  let seenBase = false
  for (const [name, weight] of weights) {
    if (weight <= 0) continue
    const source = touchSceneImage(name) || fallbackSource
    if (!source) continue
    if (!seenBase) {
      seenBase = true
      continue
    }
    const nextWeight = accumulatedWeight + weight
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = nextWeight > 0 ? weight / nextWeight : 0
    drawCover(source)
    accumulatedWeight = nextWeight
  }
  ctx.restore()
}

function touchSceneImage(name) {
  const source = sceneImages.get(name)
  if (!source) return null
  // Map insertion order doubles as a tiny LRU list for decoded image resources.
  sceneImages.delete(name)
  sceneImages.set(name, source)
  return source
}

function trimSceneImageCache() {
  const keep = new Set([...neededSceneNames, 'sunset'])
  while (sceneImages.size > 4) {
    const oldestUnused = [...sceneImages.keys()].find((name) => !keep.has(name))
    if (!oldestUnused) break
    sceneImages.delete(oldestUnused)
  }
}

function ensureSceneImages(weights) {
  neededSceneNames = new Set(weights.keys())
  for (const name of neededSceneNames) {
    if (sceneImages.has(name) || pendingSceneImages.has(name)) continue
    const sourceUrl = SCENE_ASSETS[name]
    if (!sourceUrl) continue
    const request = loadImage(sourceUrl).then((source) => {
      if (neededSceneNames.has(name)) {
        const resolved = source || image
        if (!resolved) return
        sceneImages.set(name, resolved)
        trimSceneImageCache()
      }
    }).finally(() => pendingSceneImages.delete(name))
    pendingSceneImages.set(name, request)
  }
  trimSceneImageCache()
}

function currentSceneClock() {
  return {
    date: new Date(simulatedTimestamp || Date.now()),
    seconds: simulatedSeconds,
  }
}

function lakePath(begin = true) {
  const { left, top, width: w, height: h } = frameRect
  const p = (x, y) => [left + x * w, top + y * h]
  if (begin) ctx.beginPath()
  let q = p(0.19, 0.30)
  ctx.moveTo(...q)
  q = p(0.34, 0.25)
  let c1 = p(0.27, 0.26)
  let c2 = p(0.30, 0.25)
  ctx.bezierCurveTo(...c1, ...c2, ...q)
  q = p(0.80, 0.29)
  c1 = p(0.47, 0.25)
  c2 = p(0.68, 0.25)
  ctx.bezierCurveTo(...c1, ...c2, ...q)
  q = p(0.91, 0.42)
  c1 = p(0.95, 0.33)
  c2 = p(0.96, 0.38)
  ctx.bezierCurveTo(...c1, ...c2, ...q)
  q = p(0.83, 0.58)
  c1 = p(0.90, 0.49)
  c2 = p(0.86, 0.55)
  ctx.bezierCurveTo(...c1, ...c2, ...q)
  q = p(0.50, 0.76)
  c1 = p(0.68, 0.72)
  c2 = p(0.59, 0.76)
  ctx.bezierCurveTo(...c1, ...c2, ...q)
  q = p(0.22, 0.60)
  c1 = p(0.40, 0.76)
  c2 = p(0.31, 0.70)
  ctx.bezierCurveTo(...c1, ...c2, ...q)
  q = p(0.19, 0.30)
  c1 = p(0.12, 0.51)
  c2 = p(0.10, 0.39)
  ctx.bezierCurveTo(...c1, ...c2, ...q)
  ctx.closePath()
}

function dynamicSun(solar) {
  const x = 0.5 + Math.sin(solar.hourAngle) * 0.25
  const elevation = clamp(Math.sin(solar.altitude), 0, 1)
  const y = 0.17 - elevation * 0.125
  return { x, y }
}

function drawMovingSlopeLight(solar) {
  const { x: sunU } = dynamicSun(solar)
  const sourceX = frameRect.left + sunU * frameRect.width
  const oppositeX = sunU < 0.5 ? width : 0
  const alpha = 0.04 + solar.daylight * 0.12 + solar.twilight * 0.1
  const light = ctx.createLinearGradient(sourceX, 0, oppositeX, 0)
  light.addColorStop(0, rgba([255, 224, 174], alpha))
  light.addColorStop(0.42, rgba([198, 188, 201], alpha * 0.22))
  light.addColorStop(1, rgba([27, 40, 87], alpha * 0.48))

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, frameRect.top + frameRect.height * 0.2, width, height)
  ctx.clip()
  ctx.globalCompositeOperation = 'soft-light'
  ctx.fillStyle = light
  ctx.fillRect(0, 0, width, height)
  ctx.restore()
}

function drawSun(solar) {
  if (solar.altitudeDegrees < -7) return
  const point = dynamicSun(solar)
  const x = frameRect.left + point.x * frameRect.width
  const y = frameRect.top + point.y * frameRect.height
  const radius = Math.max(7.2, height * 0.0132)
  const sunColor = mixColor([255, 242, 204], [255, 178, 120], solar.twilight)
  const glowAlpha = clamp(solar.daylight * 0.27 + solar.twilight * 0.52, 0, 0.72)

  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  const glow = ctx.createRadialGradient(x, y, 0, x, y, height * 0.228)
  glow.addColorStop(0, rgba(sunColor, glowAlpha * 0.68))
  glow.addColorStop(0.16, rgba(sunColor, glowAlpha * 0.38))
  glow.addColorStop(0.5, rgba(sunColor, glowAlpha * 0.1))
  glow.addColorStop(1, rgba(sunColor, 0))
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(x, y, height * 0.192, 0, Math.PI * 2)
  ctx.fill()

  const diskAlpha = smoothstep(-0.5, 2, solar.altitudeDegrees) * 0.94
  if (diskAlpha > 0) {
    ctx.globalCompositeOperation = 'lighter'
    ctx.filter = `blur(${Math.max(3, height * 0.004)}px)`
    const disk = ctx.createRadialGradient(x - radius * 0.18, y - radius * 0.18, 0, x, y, radius * 1.7)
    disk.addColorStop(0, rgba([255, 250, 225], diskAlpha * 0.58))
    disk.addColorStop(0.48, rgba(sunColor, diskAlpha * 0.32))
    disk.addColorStop(1, rgba(sunColor, 0))
    ctx.fillStyle = disk
    ctx.beginPath()
    ctx.arc(x, y, radius * 1.7, 0, Math.PI * 2)
    ctx.fill()
    ctx.filter = 'none'
  }
  ctx.restore()
}

function drawCloudPuff(x, y, rx, ry, color, alpha) {
  const ratio = ry / rx
  const colorKey = color.join(',')
  const key = `${colorKey}|${alpha}|${ratio.toFixed(3)}`
  let sprite = cloudPuffSprites.get(key)
  if (!sprite) {
    // Cache the soft radial puff in local coordinates. Moving clouds then use
    // image blits instead of rebuilding dozens of gradients on every frame.
    const size = 512
    const spriteHeight = Math.max(8, Math.round(size * ratio))
    sprite = document.createElement('canvas')
    sprite.width = size
    sprite.height = spriteHeight
    const spriteContext = sprite.getContext('2d')
    const centerX = size / 2
    const centerY = spriteHeight / 2
    const radiusX = size / 2 - 1
    const radiusY = spriteHeight / 2 - 1
    const gradient = spriteContext.createRadialGradient(centerX, centerY, 0, centerX, centerY, radiusX)
    gradient.addColorStop(0, rgba(color, alpha))
    gradient.addColorStop(0.58, rgba(color, alpha * 0.5))
    gradient.addColorStop(1, rgba(color, 0))
    spriteContext.fillStyle = gradient
    spriteContext.beginPath()
    spriteContext.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2)
    spriteContext.fill()
    cloudPuffSprites.set(key, sprite)
  }
  ctx.drawImage(sprite, x - rx, y - ry, rx * 2, ry * 2)
}

function cloudPosition(cloud, seconds) {
  const u = ((cloud.u + seconds * cloud.speed) % 1.28 + 1.28) % 1.28 - 0.14
  return {
    u,
    x: frameRect.left + u * frameRect.width,
    y: frameRect.top + cloud.v * frameRect.height,
    rx: cloud.width * frameRect.width,
    ry: cloud.height * frameRect.height,
  }
}

function drawClouds(seconds, solar, moon) {
  const sunU = dynamicSun(solar).x
  const moonU = 0.5 + Math.sin(moon.hourAngle) * 0.25
  const moonLight = solar.night * moon.illumination * smoothstep(-2, 12, moon.altitudeDegrees)
  const sunLight = solar.daylight + solar.twilight * 0.55
  const lightU = moonLight > sunLight * 0.22 ? moonU : sunU
  const warmLight = clamp(solar.twilight * 0.9, 0, 1)
  const nightLight = solar.night * 0.72
  const body = mixColor(mixColor([192, 211, 239], [163, 143, 183], warmLight), [94, 111, 158], nightLight)
  const highlight = mixColor(mixColor([250, 250, 255], [255, 215, 174], warmLight), [150, 177, 234], nightLight)
  const underside = mixColor(mixColor([76, 94, 137], [105, 77, 119], warmLight), [39, 52, 91], nightLight)
  const cachedBody = quantizeCloudColor(body)
  const cachedHighlight = quantizeCloudColor(highlight)
  const cachedUnderside = quantizeCloudColor(underside)
  const paletteKey = `${cachedBody}|${cachedHighlight}|${cachedUnderside}`
  if (paletteKey !== cloudPuffPaletteKey) {
    cloudPuffSprites.clear()
    cloudPuffPaletteKey = paletteKey
  }
  const cloudAlpha = clamp((0.15 + solar.daylight * 0.08 + solar.twilight * 0.06) * (1 - solar.night * 0.68 + moonLight * 0.16), 0.025, 0.24)
  for (const cloud of clouds) {
    const position = cloudPosition(cloud, seconds)
    const lightDirection = lightU < position.u ? -1 : 1

    ctx.save()
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = cloudAlpha
    drawCloudPuff(position.x, position.y + position.ry * 0.08, position.rx * 0.62, position.ry * 0.73, cachedBody, 0.32)
    drawCloudPuff(position.x - position.rx * 0.31, position.y + position.ry * 0.02, position.rx * 0.4, position.ry * 0.62, cachedBody, 0.27)
    drawCloudPuff(position.x + position.rx * 0.32, position.y - position.ry * 0.06, position.rx * 0.42, position.ry * 0.65, cachedBody, 0.3)
    ctx.globalCompositeOperation = 'multiply'
    ctx.globalAlpha = cloudAlpha * 0.52
    drawCloudPuff(position.x - lightDirection * position.rx * 0.08, position.y + position.ry * 0.28, position.rx * 0.58, position.ry * 0.52, cachedUnderside, 0.42)
    ctx.restore()

    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    ctx.globalAlpha = cloudAlpha * (0.3 + solar.daylight * 0.7 + solar.twilight * 0.38 + moonLight * 0.22)
    drawCloudPuff(position.x + position.rx * lightDirection * 0.22, position.y - position.ry * 0.3, position.rx * 0.34, position.ry * 0.42, cachedHighlight, 0.34)
    drawCloudPuff(position.x + position.rx * lightDirection * 0.39, position.y - position.ry * 0.08, position.rx * 0.25, position.ry * 0.4, cachedHighlight, 0.25)
    ctx.restore()
  }
}

function drawCloudReflections(seconds, solar, moon) {
  const warmLight = clamp(solar.twilight * 0.9, 0, 1)
  const reflectionColor = mixColor(mixColor([139, 177, 230], [255, 201, 153], warmLight), [102, 131, 193], solar.night * 0.78)
  const cachedReflectionColor = quantizeCloudColor(reflectionColor)
  const nextReflectionColorKey = cachedReflectionColor.join(',')
  if (nextReflectionColorKey !== cloudReflectionColorKey) {
    cloudReflectionColorKey = nextReflectionColorKey
    cloudReflectionSprite = document.createElement('canvas')
    cloudReflectionSprite.width = 256
    cloudReflectionSprite.height = 4
    const reflectionContext = cloudReflectionSprite.getContext('2d')
    const reflectionGradient = reflectionContext.createLinearGradient(0, 0, 256, 0)
    reflectionGradient.addColorStop(0, rgba(cachedReflectionColor, 0))
    reflectionGradient.addColorStop(0.5, rgba(cachedReflectionColor, 1))
    reflectionGradient.addColorStop(1, rgba(cachedReflectionColor, 0))
    reflectionContext.fillStyle = reflectionGradient
    reflectionContext.fillRect(0, 0, 256, 4)
  }
  const moonLight = moon.illumination * smoothstep(-2, 12, moon.altitudeDegrees)
  const reflectionStrength = clamp(solar.daylight * 0.9 + solar.twilight * 0.65 + solar.night * moonLight * 0.45, 0, 1)
  ctx.save()
  lakePath()
  ctx.clip()
  ctx.globalCompositeOperation = 'screen'
  for (let i = 0; i < clouds.length; i++) {
    const cloud = clouds[i]
    const position = cloudPosition(cloud, seconds)
    const horizon = frameRect.top + (0.285 + (0.15 - cloud.v) * 0.42) * frameRect.height
    const visibility = (0.032 + solar.twilight * 0.024) * reflectionStrength
    for (let ripple = 0; ripple < 5; ripple++) {
      const spread = ripple / 4
      const y = horizon + spread * height * 0.052 + Math.sin(seconds * 0.7 + i * 1.9 + ripple) * height * 0.002
      const x = position.x + Math.sin(seconds * 0.33 + i + ripple * 0.8) * position.rx * 0.13
      const half = position.rx * (0.3 + (1 - spread) * 0.26) * (0.78 + 0.22 * Math.sin(i * 2 + ripple))
      const alpha = visibility * (1 - spread * 0.64)
      ctx.globalAlpha = alpha
      ctx.drawImage(cloudReflectionSprite, x - half, y, half * 2, Math.max(1, height * 0.0016))
    }
  }
  ctx.restore()
}

function drawStars(seconds, solar) {
  if (solar.night < 0.18) return
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  const skyLimit = Math.min(frameRect.top + frameRect.height * 0.12, height * 0.2)
  const realSeconds = seconds / activeTimeScale
  for (const star of starSeeds) {
    const driftPhase = realSeconds * star.driftSpeed + star.phase
    const x = frameRect.left + (star.x + Math.sin(driftPhase) * star.driftX) * frameRect.width
    const y = frameRect.top + (star.y + Math.cos(driftPhase * 0.73) * star.driftY) * frameRect.height
    if (x < 0 || x > width || y < 0 || y > skyLimit) continue
    const blink = 0.66 + 0.34 * Math.sin(realSeconds * star.speed * 0.16 + star.phase)
    ctx.globalAlpha = solar.night * (0.28 + blink * 0.54)
    ctx.fillStyle = star.warm ? '#ffe6c8' : '#d6e5ff'
    ctx.beginPath()
    ctx.arc(x, y, star.radius, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawMoon(moon, solar) {
  if (moon.altitudeDegrees < -1.5) return
  const x = frameRect.left + (0.5 + Math.sin(moon.hourAngle) * 0.25) * frameRect.width
  const elevation = clamp(Math.sin(moon.altitude), 0, 1)
  const y = frameRect.top + (0.17 - elevation * 0.125) * frameRect.height
  const radius = Math.max(6, height * 0.0108)
  const aboveHorizon = smoothstep(-1.5, 1.5, moon.altitudeDegrees)
  const visibility = aboveHorizon * (0.2 + (1 - solar.daylight) * 0.8)
  const brightness = 0.25 + moon.illumination * 0.75

  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  ctx.globalAlpha = visibility
  const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 6.6)
  glow.addColorStop(0, `rgba(207, 222, 255, ${0.23 * brightness})`)
  glow.addColorStop(0.34, `rgba(177, 199, 247, ${0.1 * brightness})`)
  glow.addColorStop(1, 'rgba(177, 199, 247, 0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(x, y, radius * 6.6, 0, Math.PI * 2)
  ctx.fill()

  ctx.globalAlpha = visibility * (0.16 + moon.illumination * 0.78)
  ctx.filter = `blur(${Math.max(2, height * 0.002)}px)`
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(49, 61, 99, 0.32)'
  ctx.fill()
  const phase = Math.acos(clamp(1 - 2 * moon.illumination, -1, 1))
  const direction = moon.waxing ? 1 : -1
  ctx.beginPath()
  if (moon.waxing) ctx.arc(x, y, radius, -Math.PI / 2, Math.PI / 2)
  else ctx.arc(x, y, radius, -Math.PI / 2, -Math.PI * 1.5, true)
  ctx.quadraticCurveTo(x + direction * radius * Math.cos(phase) * 2, y, x, y - radius)
  ctx.closePath()
  const disk = ctx.createRadialGradient(x - radius * 0.24, y - radius * 0.26, radius * 0.08, x, y, radius)
  disk.addColorStop(0, 'rgba(246, 246, 231, 0.94)')
  disk.addColorStop(0.72, 'rgba(205, 216, 238, 0.78)')
  disk.addColorStop(1, 'rgba(174, 195, 235, 0.2)')
  ctx.fillStyle = disk
  ctx.fill()
  ctx.filter = 'none'
  ctx.restore()
}

function birdPositions(flock, flightSeconds) {
  const travel = flightSeconds * flock.speed * flock.direction
  const u = ((flock.u + travel) % 1.2 + 1.2) % 1.2 - 0.1
  const centerX = frameRect.left + u * frameRect.width
  // Keep each flock on a stable flight line. Horizontal wrap happens beyond
  // the frame, so the birds never appear to jump vertically while crossing it.
  const centerY = frameRect.top + flock.v * frameRect.height
  const size = Math.max(4, height * flock.size)

  return Array.from({ length: flock.count }, (_, index) => {
    const spread = (index - (flock.count - 1) / 2) * size * 1.72
    return {
      x: centerX + spread,
      y: centerY + Math.abs(index - (flock.count - 1) / 2) * size * 0.34,
      size,
      wing: Math.sin(flightSeconds * 7.2 + flock.phase + index * 1.17) * 0.36,
      phase: flock.phase + index * 1.17,
    }
  })
}

function traceBird(x, y, size, wing) {
  ctx.beginPath()
  ctx.moveTo(x - size, y + wing * size * 0.18)
  ctx.quadraticCurveTo(x - size * 0.4, y - size * (0.22 + wing), x, y)
  ctx.quadraticCurveTo(x + size * 0.42, y - size * (0.22 - wing), x + size, y - wing * size * 0.18)
  ctx.stroke()
}

function lakeHorizonAt(x) {
  const u = clamp((x - frameRect.left) / frameRect.width, 0, 1)
  const curve = (u - 0.56) / 0.48
  return frameRect.top + frameRect.height * (0.255 + curve * curve * 0.045)
}

function drawBirds(seconds, solar) {
  const visibility = (0.3 + solar.daylight * 0.7) * (1 - solar.night * 0.78)
  if (visibility < 0.04) return
  const flightSeconds = seconds / activeTimeScale
  const flocks = birdFlocks.map((flock) => ({ flock, birds: birdPositions(flock, flightSeconds) }))

  ctx.save()
  lakePath()
  ctx.clip()
  ctx.globalCompositeOperation = 'multiply'
  ctx.lineCap = 'round'
  ctx.lineWidth = Math.max(1, height * 0.0015)
  ctx.filter = `blur(${Math.max(1, height * 0.0014)}px)`
  const reflectedColor = mixColor([48, 70, 111], [112, 86, 120], solar.twilight)
  for (const { flock, birds } of flocks) {
    for (let i = 0; i < birds.length; i++) {
      const bird = birds[i]
      const waterline = lakeHorizonAt(bird.x)
      const reflectedY = waterline * 2 - bird.y
      const wobbleX = Math.sin(flightSeconds * 0.72 + bird.phase) * bird.size * 0.12
      const wobbleY = Math.sin(flightSeconds * 0.9 + flock.phase + i) * height * 0.001
      ctx.save()
      ctx.translate(bird.x + wobbleX, reflectedY + wobbleY)
      ctx.scale(1, -0.34)
      const reflectionAlpha = visibility * (0.16 + solar.daylight * 0.035) * (1 - solar.night * 0.3)
      ctx.strokeStyle = rgba(reflectedColor, reflectionAlpha)
      traceBird(0, 0, bird.size * 0.88, bird.wing * 0.8)
      ctx.restore()
    }
  }
  ctx.restore()

  ctx.save()
  const birdInk = mixColor(mixColor([34, 45, 75], [74, 66, 84], solar.twilight), [195, 211, 242], solar.night * 0.72)
  ctx.strokeStyle = rgba(birdInk, visibility * 0.9)
  ctx.lineWidth = Math.max(1.5, height * 0.0021)
  ctx.lineCap = 'round'
  for (const { birds } of flocks) {
    for (const bird of birds) traceBird(bird.x, bird.y, bird.size, bird.wing)
  }
  ctx.restore()
}

function drawLakeReflection(seconds, solar) {
  const point = dynamicSun(solar)
  const x = frameRect.left + point.x * frameRect.width
  const top = frameRect.top + frameRect.height * 0.28
  const bottom = frameRect.top + frameRect.height * 0.8
  const strength = solar.daylight * 0.34 + solar.twilight * 0.28
  if (strength < 0.015) return

  ctx.save()
  lakePath()
  ctx.clip()
  ctx.globalCompositeOperation = 'screen'
  if (!lakeReflectionSprite) {
    lakeReflectionSprite = document.createElement('canvas')
    lakeReflectionSprite.width = 256
    lakeReflectionSprite.height = 4
    const reflectionContext = lakeReflectionSprite.getContext('2d')
    const reflectionGradient = reflectionContext.createLinearGradient(0, 0, 256, 0)
    reflectionGradient.addColorStop(0, 'rgba(255, 214, 156, 0)')
    reflectionGradient.addColorStop(0.5, 'rgba(255, 223, 171, 1)')
    reflectionGradient.addColorStop(1, 'rgba(255, 214, 156, 0)')
    reflectionContext.fillStyle = reflectionGradient
    reflectionContext.fillRect(0, 0, 256, 4)
  }
  for (let i = 0; i < 27; i++) {
    const k = i / 26
    const y = mix(top, bottom, k)
    const sway = Math.sin(seconds * 0.45 + i * 1.7) * width * (0.006 + k * 0.008)
    // Keep the reflected sun as a narrow, painterly column. A wide lower fan
    // reads as a separate curved surface on the lake.
    const half = width * (0.006 + k * 0.022) * (0.82 + Math.sin(i * 2.31 + seconds) * 0.12)
    const alpha = strength * (1 - k * 0.58) * (0.58 + 0.42 * Math.sin(i * 1.83 + seconds * 0.7) ** 2)
    ctx.globalAlpha = alpha
    ctx.drawImage(lakeReflectionSprite, x + sway - half, y, half * 2, Math.max(1, height * (0.0012 + k * 0.002)))
  }
  ctx.globalAlpha = 1

  for (const shimmer of shimmerSeeds) {
    const y = frameRect.top + shimmer.y * frameRect.height
    const x0 = frameRect.left + ((shimmer.x + seconds * shimmer.drift) % 1) * frameRect.width
    const k = (y - top) / (bottom - top)
    const alpha = (0.018 + Math.abs(Math.sin(seconds * shimmer.speed + shimmer.phase)) * 0.055) * (1 - k * 0.36)
    ctx.strokeStyle = rgba(k < 0.26 ? [255, 217, 163] : [191, 217, 255], alpha)
    ctx.lineWidth = Math.max(0.6, height * 0.0012 * (1 - k * 0.5))
    ctx.beginPath()
    ctx.moveTo(x0, y)
    ctx.lineTo(x0 + shimmer.length * width, y)
    ctx.stroke()
  }
  ctx.restore()
}

function onLakePointerDown(event) {
  if (!ctx || !canvas.value || !frameRect || (event.button !== undefined && event.button !== 0)) return
  const rect = canvas.value.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) return

  ctx.save()
  lakePath()
  const hitLake = ctx.isPointInPath(x, y)
  ctx.restore()
  if (!hitLake) return
  const verticalScale = rippleVerticalScale(y)

  ripples.push({
    x,
    y,
    startedAt: performance.now(),
    duration: 5200,
    maxRadius: rippleRadiusWithinLake(x, y, verticalScale, 0.17),
    verticalScale,
    strength: 0.55 + Math.random() * 0.08,
    kind: 'click',
    phase: Math.random() * Math.PI * 2,
  })
  if (ripples.length > 8) ripples = ripples.slice(-8)
}

function randomLakePoint() {
  for (let attempt = 0; attempt < 24; attempt++) {
    const x = frameRect.left + frameRect.width * (0.22 + Math.random() * 0.56)
    const y = frameRect.top + frameRect.height * (0.36 + Math.random() * 0.32)
    lakePath()
    if (ctx.isPointInPath(x, y)) return { x, y }
  }
  return {
    x: frameRect.left + frameRect.width * 0.52,
    y: frameRect.top + frameRect.height * 0.59,
  }
}

function rippleVerticalScale(y) {
  const lakeDepth = clamp((y - (frameRect.top + frameRect.height * 0.26)) / (frameRect.height * 0.57), 0, 1)
  return mix(0.34, 0.66, lakeDepth)
}

function rippleRadiusWithinLake(x, y, verticalScale, requestedRadius) {
  lakePath()
  let nearestShore = height * requestedRadius
  const angleSteps = 96
  for (let index = 0; index < angleSteps; index++) {
    const angle = (index / angleSteps) * Math.PI * 2
    for (let distance = 4; distance < nearestShore; distance += 4) {
      const px = x + Math.cos(angle) * distance
      const py = y + Math.sin(angle) * distance * verticalScale
      if (!ctx.isPointInPath(px, py)) {
        nearestShore = Math.min(nearestShore, distance)
        break
      }
    }
  }
  return Math.max(0.008, Math.min(requestedRadius, (nearestShore * 0.82) / height))
}

function drawRipples(solar) {
  const now = performance.now()
  if (!nextAmbientRippleAt) nextAmbientRippleAt = now + 500 + Math.random() * 500
  if (now >= nextAmbientRippleAt) {
    const activeAmbientRipples = ripples.filter((ripple) => ripple.kind === 'ambient' && now - ripple.startedAt < ripple.duration).length
    const capacity = Math.max(0, 5 - activeAmbientRipples)
    const spawnCount = Math.min(capacity, 1 + Math.floor(Math.random() * 5))
    for (let i = 0; i < spawnCount; i++) {
      const point = randomLakePoint()
      ripples.push({
        ...point,
        startedAt: now,
        duration: 10500,
        maxRadius: rippleRadiusWithinLake(point.x, point.y, rippleVerticalScale(point.y), 0.31),
        verticalScale: rippleVerticalScale(point.y),
        strength: 0.23 + Math.random() * 0.05,
        kind: 'ambient',
        phase: Math.random() * Math.PI * 2,
      })
    }
    nextAmbientRippleAt = now + 500 + Math.random() * 500
  }
  ripples = ripples.filter((ripple) => now - ripple.startedAt < ripple.duration)
  if (!ripples.length) return

  const color = mixColor(mixColor([175, 211, 255], [255, 221, 177], solar.twilight), [140, 172, 238], solar.night * 0.72)
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  // Precomputed unit-circle samples avoid hundreds of repeated trigonometric
  // calls per frame while preserving the same ripple contours.
  for (const ripple of ripples) {
    const age = clamp((now - ripple.startedAt) / ripple.duration, 0, 1)
    const expansion = smoothstep(0, 1, age)
    const fadeIn = smoothstep(0, 0.045, age)
    const fade = (1 - age) ** 1.55 * fadeIn * ripple.strength
    const radius = height * (0.003 + expansion * ripple.maxRadius)
    const verticalScale = ripple.verticalScale || rippleVerticalScale(ripple.y)
    const phase = ripple.phase + expansion * 1.3
    const phaseSin = Math.sin(phase)
    const phaseCos = Math.cos(phase)
    ctx.beginPath()
    for (let point = 0; point <= RIPPLE_POINTS; point++) {
      const sample = point === RIPPLE_POINTS ? 0 : point
      const roughness = (
        RIPPLE_TRIPLE_SIN[sample] * phaseCos + RIPPLE_TRIPLE_COS[sample] * phaseSin
      ) * 0.006
      const wave = radius * (1 + roughness)
      const px = ripple.x + RIPPLE_COS[sample] * wave
      const py = ripple.y + RIPPLE_SIN[sample] * wave * verticalScale
      if (point === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.strokeStyle = rgba(color, fade)
      ctx.lineWidth = ripple.kind === 'ambient' ? 2.7 : 3.5
    ctx.lineCap = 'round'
      ctx.filter = `blur(${Math.max(2.5, height * (ripple.kind === 'ambient' ? 0.0045 : 0.0034))}px)`
    ctx.stroke()
    ctx.filter = 'none'
  }
  ctx.restore()
}

function cometPositionAt(progress, path) {
  const t = clamp(progress, 0, 1)
  return {
    x: mix(width * path.startX, width * path.endX, t),
    y: mix(height * path.startY, height * path.endY, t) + 4 * t * (1 - t) * height * path.arc,
  }
}

function cometEventRandom(index, salt = 0) {
  const sample = Math.sin((index + 1) * 127.1 + (salt + 1) * 311.7) * 43758.5453
  return sample - Math.floor(sample)
}

function cometPathFor(index) {
  return COMET_PATHS[Math.floor(cometEventRandom(index) * COMET_PATHS.length)]
}

function cometEventAt(secondsOfDay, dayIndex) {
  // 每小时固定分 10 个 6 分钟槽位，并在槽位开头 2 分钟内抖动，
  // 流量稳定为约 10 颗/小时，同时不会挤在同一分钟。
  const slotSeconds = 3600 / COMETS_PER_HOUR
  const currentSlot = Math.floor(secondsOfDay / slotSeconds)
  for (let slot = currentSlot; slot >= Math.max(0, currentSlot - 1); slot--) {
    const pathIndex = dayIndex * 24 * COMETS_PER_HOUR + slot
    const path = cometPathFor(pathIndex)
    const flightDuration = path.duration
    const start = slot * slotSeconds + cometEventRandom(pathIndex, 4) * 120
    const progress = (secondsOfDay - start) / flightDuration
    if (progress >= 0 && progress <= 1 + 0.3276 / flightDuration) {
      return { pathIndex, progress, flightDuration }
    }
  }
  return null
}

function cometBranchProgress(path) {
  const cachedProgress = cometBranchProgressCache.get(path)
  if (cachedProgress !== undefined) return cachedProgress
  const visibleSplitY = Math.max(0.035, path.startY + 0.02)
  let low = 0
  let high = 1
  for (let step = 0; step < 18; step++) {
    const middle = (low + high) * 0.5
    if (cometPositionAt(middle, path).y / height < visibleSplitY) low = middle
    else high = middle
  }
  const progress = clamp(high, 0.06, 0.84)
  cometBranchProgressCache.set(path, progress)
  return progress
}

function cometColorAt(age) {
  // 参考图的尾迹不是单色光带：旧端带品红，向前依次过渡为紫、蓝、青，
  // 最后只在彗核附近收成近白色，避免整段都被加成发闷的蓝绿色。
  if (age < 0.18) return mixColor([255, 47, 158], [164, 52, 255], age / 0.18)
  if (age < 0.46) return mixColor([164, 52, 255], [62, 76, 255], (age - 0.18) / 0.28)
  if (age < 0.76) return mixColor([62, 76, 255], [0, 177, 255], (age - 0.46) / 0.3)
  if (age < 0.94) return mixColor([0, 177, 255], [52, 232, 255], (age - 0.76) / 0.18)
  return mixColor([52, 232, 255], [239, 255, 255], (age - 0.94) / 0.06)
}

function cometBranchColorAt(age) {
  // 分叉彗星带一点灼热的红橙色；旧尾仍与主尾保持连续的紫粉色。
  if (age < 0.42) return mixColor([255, 58, 88], [184, 51, 255], age / 0.42)
  if (age < 0.76) return mixColor([184, 51, 255], [76, 83, 255], (age - 0.42) / 0.34)
  return mixColor([76, 83, 255], [255, 119, 74], (age - 0.76) / 0.24)
}

const COMET_TAIL_COLOR_STOP_POSITIONS = [0, 0.18, 0.46, 0.76, 0.94, 1]

function makeCometTailColorStops(colorAt, alphaAt, tint = null, tintAmount = 0) {
  return COMET_TAIL_COLOR_STOP_POSITIONS.map((position) => {
    const amount = typeof tintAmount === 'function' ? tintAmount(position) : tintAmount
    const color = tint ? mixColor(colorAt(position), tint, amount) : colorAt(position)
    return { position, color: rgba(color, alphaAt(position)) }
  })
}

// Tail color ramps are constant across frames; cache their CSS colors instead
// of rebuilding dozens of RGB arrays and strings while the comet is visible.
const COMET_MAIN_TAIL_LAYERS = [
  {
    widthScale: 3.8,
    blur: 0.003,
    colors: makeCometTailColorStops(cometColorAt, (age) => 0.045 + 0.125 * age ** 1.35, [218, 44, 210], 0.42),
  },
  {
    widthScale: 1.32,
    blur: 0.00075,
    colors: makeCometTailColorStops(cometColorAt, (age) => 0.09 + 0.66 * age ** 1.08),
  },
  {
    widthScale: 0.52,
    blur: 0.0003,
    colors: makeCometTailColorStops(cometColorAt, (age) => 0.025 + 0.72 * age ** 3.6, [244, 255, 255], (age) => 0.36 + age * 0.52),
  },
]
const COMET_BRANCH_TAIL_LAYERS = [
  {
    widthScale: 3.8,
    blur: 0.003,
    colors: makeCometTailColorStops(cometBranchColorAt, (age) => 0.045 + 0.125 * age ** 1.35, [218, 44, 210], 0.42),
  },
  {
    widthScale: 1.32,
    blur: 0.00075,
    colors: makeCometTailColorStops(cometBranchColorAt, (age) => 0.09 + 0.66 * age ** 1.08),
  },
  {
    widthScale: 0.52,
    blur: 0.0003,
    colors: makeCometTailColorStops(cometBranchColorAt, (age) => 0.025 + 0.72 * age ** 3.6, [244, 255, 255], (age) => 0.36 + age * 0.52),
  },
]

function cometBranchMotion(path, pathIndex, branchPoint) {
  if (pathIndex === cachedCometBranchPathIndex) return cachedCometBranchMotion
  let side = cometEventRandom(pathIndex, 7) < 0.5 ? -1 : 1
  const roomInDirection = (direction) => direction > 0 ? 0.98 - path.endX : path.endX - 0.02
  if (roomInDirection(side) < 0.14) side *= -1
  const remaining = Math.max(0.08, 1 - branchPoint - 0.045)
  const horizontalSpeed = Math.min(
    0.2 + cometEventRandom(pathIndex, 8) * 0.12,
    Math.max(0.06, roomInDirection(side) / remaining),
  )
  const verticalRoom = Math.max(0, 0.22 - path.endY)
  const verticalSpeed = Math.min(
    0.075 + cometEventRandom(pathIndex, 9) * 0.035,
    verticalRoom / remaining,
  )
  cachedCometBranchPathIndex = pathIndex
  cachedCometBranchMotion = { x: side * horizontalSpeed, y: verticalSpeed, turnDuration: 0.09 }
  return cachedCometBranchMotion
}

function cometBranchOffset(progress, branchPoint, speed, turnDuration) {
  const elapsed = Math.max(0, progress - branchPoint)
  const turnProgress = clamp(elapsed / turnDuration, 0, 1)
  const easedDistance = turnDuration * (turnProgress ** 3 - 0.5 * turnProgress ** 4)
  const straightDistance = Math.max(0, elapsed - turnDuration)
  return speed * (easedDistance + straightDistance)
}

function cometPositionForBranch(progress, path, branch, branchPoint, branchMotion) {
  const point = cometPositionAt(progress, path)
  if (!branch) return point
  return {
    x: point.x + width * cometBranchOffset(progress, branchPoint, branchMotion.x, branchMotion.turnDuration),
    y: point.y + height * cometBranchOffset(progress, branchPoint, branchMotion.y, branchMotion.turnDuration),
  }
}

function drawComet(date, solar, seconds) {
  const secondsOfDay = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds() + date.getMilliseconds() / 1000
  const dayIndex = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000)
  // 仅在太阳完全落山后、再次升起前显示；preview=1 时这里的 solar 已来自虚拟时间。
  const visibleSolar = solar
  if (visibleSolar.altitudeDegrees >= COMET_HORIZON_ALTITUDE) return

  let pathIndex
  let progress
  let flightDuration
  if (DEMO_COMET) {
    const previewCycleSeconds = 14
    const previewTime = seconds / activeTimeScale
    const cycleIndex = Math.floor(previewTime / previewCycleSeconds)
    pathIndex = cycleIndex
    const path = cometPathFor(pathIndex)
    flightDuration = path.duration
    progress = (previewTime % previewCycleSeconds) / flightDuration
  } else {
    const event = cometEventAt(secondsOfDay, dayIndex)
    if (!event) return
    pathIndex = event.pathIndex
    progress = event.progress
    flightDuration = event.flightDuration
  }
  const path = cometPathFor(pathIndex)
  const entersFromLeft = path.startX < path.endX
  const trailWidthScale = entersFromLeft ? 1.08 : 1
  const cometVisualScale = 2
  const trailFraction = 12.6 / flightDuration
  const afterglowFraction = 0.3276 / flightDuration
  if (progress < 0 || progress > 1 + afterglowFraction) return

  const cometTime = seconds / activeTimeScale
  const tailEnd = clamp(progress, 0, 1)
  const tailStart = clamp(progress - trailFraction, 0, tailEnd)
  const trailLength = tailEnd - tailStart
  const trailFade = progress > 1 ? 1 - smoothstep(1, 1 + afterglowFraction, progress) : 1
  const trailVisibility = smoothstep(0, 0.1, tailEnd) * trailFade
  const headVisible = progress <= 1
  const headFade = headVisible
    ? smoothstep(0, 0.045, progress) * (1 - smoothstep(0.975, 0.993, progress))
    : 0
  // 仅“下午落日后的暮光”允许分叉；太阳时角大于 0 可排除清晨朝霞时段。
  const splitComet = visibleSolar.altitudeDegrees < 0
    && visibleSolar.twilight > 0.35
    && visibleSolar.hourAngle > 0
  const branchPoint = cometBranchProgress(path)
  const branchMotion = cometBranchMotion(path, pathIndex, branchPoint)
  const splitBlend = smoothstep(branchPoint, branchPoint + 0.075, progress)
  const primarySplitBrightness = 1 - 0.24 * splitBlend
  const branchSplitBrightness = 0.52 * splitBlend

  ctx.save()
  // Lighter preserves the saturated, neon-like magenta/cyan transition of the
  // reference without turning the whole comet into a flat green-cyan beam.
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = 1
  if (trailLength > 0.001 && trailVisibility > 0.001) {
    const drawTail = (branch = false) => {
      const drawStart = branch ? Math.max(tailStart, branchPoint) : tailStart
      const drawLength = Math.max(0, tailEnd - drawStart)
      if (drawLength <= 0.001) return
      const branchAlpha = branch ? branchSplitBrightness : primarySplitBrightness
      const segments = COMET_TAIL_SEGMENTS
      for (let index = 0; index <= segments; index++) {
        const age = index / segments
        const t = clamp(drawStart + drawLength * age, 0, 1)
        let x = mix(width * path.startX, width * path.endX, t)
        let y = mix(height * path.startY, height * path.endY, t) + 4 * t * (1 - t) * height * path.arc
        if (branch) {
          const offset = cometBranchOffset(t, branchPoint, branchMotion.x, branchMotion.turnDuration)
          x += width * offset
          y += height * cometBranchOffset(t, branchPoint, branchMotion.y, branchMotion.turnDuration)
        }
        cometTailX[index] = x
        cometTailY[index] = y
      }
      for (let index = 0; index <= segments; index++) {
        const beforeIndex = Math.max(0, index - 1)
        const afterIndex = Math.min(segments, index + 1)
        const dx = cometTailX[afterIndex] - cometTailX[beforeIndex]
        const dy = cometTailY[afterIndex] - cometTailY[beforeIndex]
        const tangentLength = Math.hypot(dx, dy) || 1
        let nx = -dy / tangentLength
        let ny = dx / tangentLength
        if (ny > 0) {
          nx *= -1
          ny *= -1
        }
        cometTailNormalX[index] = nx
        cometTailNormalY[index] = ny
        // 参考图的尾迹收得很窄：旧端近乎一条亮线，只在前端轻轻散开。
        cometTailHalfWidth[index] = height * (0.00004 + 0.00205 * (index / segments) ** 1.62)
          * trailWidthScale * cometVisualScale * (branch ? 0.66 : 1)
      }

      const traceRibbon = (widthScale) => {
        ctx.beginPath()
        const firstWidth = cometTailHalfWidth[0] * widthScale
        ctx.moveTo(
          cometTailX[0] + cometTailNormalX[0] * firstWidth,
          cometTailY[0] + cometTailNormalY[0] * firstWidth,
        )
        for (let index = 1; index <= segments; index++) {
          const scaledHalfWidth = cometTailHalfWidth[index] * widthScale
          ctx.lineTo(
            cometTailX[index] + cometTailNormalX[index] * scaledHalfWidth,
            cometTailY[index] + cometTailNormalY[index] * scaledHalfWidth,
          )
        }
        for (let index = segments; index >= 0; index--) {
          const scaledHalfWidth = cometTailHalfWidth[index] * widthScale
          ctx.lineTo(
            cometTailX[index] - cometTailNormalX[index] * scaledHalfWidth,
            cometTailY[index] - cometTailNormalY[index] * scaledHalfWidth,
          )
        }
        ctx.closePath()
      }

      const paintRibbon = (layer) => {
        traceRibbon(layer.widthScale)
        const gradient = ctx.createLinearGradient(
          cometTailX[0], cometTailY[0],
          cometTailX[segments], cometTailY[segments],
        )
        for (const stop of layer.colors) {
          gradient.addColorStop(stop.position, stop.color)
        }
        ctx.globalAlpha = trailVisibility * trailFade * branchAlpha
        ctx.filter = `blur(${Math.max(0.4, height * layer.blur * cometVisualScale)}px)`
        ctx.fillStyle = gradient
        ctx.fill()
      }

      // 三层宽度刻意拉开：最外层只提供紫色气辉，中间层承载蓝青渐变，
      // 极细的亮芯让彗星读起来像一道划过天空的光，而不是一条粗色带。
      const layers = branch ? COMET_BRANCH_TAIL_LAYERS : COMET_MAIN_TAIL_LAYERS
      for (const layer of layers) paintRibbon(layer)
    }
    drawTail()
    if (splitComet) drawTail(true)
    ctx.filter = 'none'
    ctx.globalAlpha = 1
  }

  if (headVisible && headFade > 0.001) {
    const drawHead = (branch = false) => {
      const branchBrightness = branch ? branchSplitBrightness : primarySplitBrightness
      if (branchBrightness <= 0.001) return
      const { x, y } = cometPositionForBranch(progress, path, branch, branchPoint, branchMotion)
      const scintillation = 0.88 + 0.12 * ((Math.sin(cometTime * 13 + 0.4) + 1) / 2) ** 5
      const intensity = headFade * scintillation * branchBrightness
      // 参考图里的彗核是一枚小而尖的“燃烧石”，不是一颗悬浮的圆球。
      // 顺着飞行方向拉长，并把辉光限制在尾端附近。
      const radius = Math.max(5, height * 0.0062) * cometVisualScale * (branch ? 0.84 : 1)
      const before = cometPositionForBranch(Math.max(0, progress - 0.004), path, branch, branchPoint, branchMotion)
      const after = cometPositionForBranch(Math.min(1, progress + 0.004), path, branch, branchPoint, branchMotion)
      const angle = Math.atan2(after.y - before.y, after.x - before.x)

      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = intensity
      ctx.translate(x, y)
      ctx.rotate(angle)
      const headCenter = radius * 0.26
      const rear = -radius * 2.45
      const front = radius * 1.32

      ctx.save()
      ctx.filter = `blur(${Math.max(1.2, height * 0.0015 * cometVisualScale)}px)`
      const halo = ctx.createRadialGradient(headCenter, 0, radius * 0.08, headCenter, 0, radius * 4.1)
      if (branch) {
        halo.addColorStop(0, rgba([255, 246, 226], 0.34))
        halo.addColorStop(0.22, rgba([255, 128, 72], 0.24))
        halo.addColorStop(0.52, rgba([188, 62, 255], 0.14))
        halo.addColorStop(0.78, rgba([83, 78, 255], 0.055))
        halo.addColorStop(1, rgba([255, 48, 160], 0))
      } else {
        halo.addColorStop(0, rgba([241, 255, 255], 0.34))
        halo.addColorStop(0.22, rgba([55, 233, 255], 0.25))
        halo.addColorStop(0.52, rgba([44, 104, 255], 0.14))
        halo.addColorStop(0.78, rgba([141, 55, 255], 0.06))
        halo.addColorStop(1, rgba([255, 48, 160], 0))
      }
      ctx.fillStyle = halo
      ctx.beginPath()
      ctx.arc(headCenter, 0, radius * 4.1, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      // 外层火焰提供体积感，内层亮芯保证缩略尺寸下仍清楚可读。
      ctx.filter = `blur(${Math.max(0.45, height * 0.00045 * cometVisualScale)}px)`
      ctx.beginPath()
      ctx.moveTo(rear, 0)
      ctx.bezierCurveTo(rear + radius * 0.48, -radius * 0.48, -radius * 0.38, -radius * 0.9, radius * 0.28, -radius * 0.66)
      ctx.bezierCurveTo(radius * 0.78, -radius * 0.48, front, -radius * 0.26, front + radius * 0.18, 0)
      ctx.bezierCurveTo(front, radius * 0.26, radius * 0.78, radius * 0.48, radius * 0.28, radius * 0.66)
      ctx.bezierCurveTo(-radius * 0.38, radius * 0.9, rear + radius * 0.48, radius * 0.48, rear, 0)
      ctx.closePath()
      const flame = ctx.createLinearGradient(rear, 0, front + radius * 0.18, 0)
      if (branch) {
        flame.addColorStop(0, rgba([112, 59, 255], 0))
        flame.addColorStop(0.3, rgba([214, 54, 255], 0.58))
        flame.addColorStop(0.62, rgba([255, 113, 66], 0.94))
        flame.addColorStop(0.84, rgba([255, 240, 218], 0.98))
        flame.addColorStop(1, rgba([255, 255, 255], 0))
      } else {
        flame.addColorStop(0, rgba([255, 52, 164], 0))
        flame.addColorStop(0.3, rgba([100, 75, 255], 0.55))
        flame.addColorStop(0.62, rgba([0, 210, 255], 0.94))
        flame.addColorStop(0.84, rgba([230, 255, 255], 0.98))
        flame.addColorStop(1, rgba([255, 255, 255], 0))
      }
      ctx.fillStyle = flame
      ctx.fill()

      ctx.filter = 'none'
      ctx.beginPath()
      ctx.moveTo(-radius * 2.2, 0)
      ctx.quadraticCurveTo(-radius * 0.5, -radius * 0.22, radius * 0.48, -radius * 0.12)
      ctx.quadraticCurveTo(front, 0, radius * 0.48, radius * 0.12)
      ctx.quadraticCurveTo(-radius * 0.5, radius * 0.22, -radius * 2.2, 0)
      ctx.closePath()
      const core = ctx.createLinearGradient(-radius * 2.2, 0, front, 0)
      core.addColorStop(0, rgba([255, 255, 255], 0.04))
      core.addColorStop(0.55, rgba([202, 255, 255], 0.68))
      core.addColorStop(0.86, rgba([255, 255, 255], 0.96))
      core.addColorStop(1, rgba([255, 255, 255], 0))
      ctx.fillStyle = core
      ctx.fill()

      const center = ctx.createRadialGradient(radius * 0.34, 0, 0, radius * 0.34, 0, radius * 0.82)
      center.addColorStop(0, rgba([255, 255, 255], 0.95))
      center.addColorStop(0.46, rgba(branch ? [255, 207, 158] : [220, 255, 255], 0.68))
      center.addColorStop(1, rgba(branch ? [255, 105, 67] : [44, 220, 255], 0))
      ctx.fillStyle = center
      ctx.beginPath()
      ctx.arc(radius * 0.34, 0, radius * 0.82, 0, Math.PI * 2)
      ctx.fill()

      ctx.restore()
    }
    drawHead()
    if (splitComet) drawHead(true)
  }
  ctx.filter = 'none'
  ctx.restore()
}

function drawVignette(solar) {
  const gradient = ctx.createRadialGradient(width * 0.5, height * 0.42, Math.min(width, height) * 0.28,
    width * 0.5, height * 0.48, Math.max(width, height) * 0.82)
  gradient.addColorStop(0, 'rgba(8, 14, 36, 0)')
  gradient.addColorStop(1, `rgba(8, 14, 36, ${0.16 + solar.night * 0.2})`)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
}

function buildGrain() {
  const size = 128
  grainCanvas = document.createElement('canvas')
  grainCanvas.width = size
  grainCanvas.height = size
  const grainCtx = grainCanvas.getContext('2d')
  const data = grainCtx.createImageData(size, size)
  let seed = 48271
  for (let i = 0; i < data.data.length; i += 4) {
    seed = (seed * 16807) % 2147483647
    const value = 112 + (seed % 40)
    data.data[i] = value
    data.data[i + 1] = value
    data.data[i + 2] = value
    data.data[i + 3] = 255
  }
  grainCtx.putImageData(data, 0, 0)
  grainPattern = ctx.createPattern(grainCanvas, 'repeat')
}

function drawGrain(seconds) {
  if (!grainPattern) return
  ctx.save()
  ctx.globalCompositeOperation = 'soft-light'
  ctx.globalAlpha = 0.035
  ctx.translate(-Math.floor(seconds * 3) % 128, -Math.floor(seconds * 2) % 128)
  ctx.fillStyle = grainPattern
  ctx.fillRect(-128, -128, width + 256, height + 256)
  ctx.restore()
}

function drawFrame(date, seconds) {
  if (!ctx || !backdropCanvas || !backdropContext || !image || !width || !height) return
  const solar = calculateSolarPosition(date)
  const moon = calculateMoonPosition(date, solar)
  // The painted plates and broad slope light move imperceptibly at real-time
  // speed. Cache them at 4 Hz; accelerated previews still refresh every frame.
  const nextBackdropFrameKey = activeTimeScale > 1
    ? date.getTime()
    : Math.floor(date.getTime() / 250)
  if (nextBackdropFrameKey !== backdropFrameKey) {
    const frameContext = ctx
    ctx = backdropContext
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    drawSceneAtTime(date)
    drawMovingSlopeLight(solar)
    // These large, softly blurred layers move imperceptibly at real-time
    // speed. Keep them in the cached plate instead of rasterizing them on
    // every animation frame. Accelerated previews still refresh per frame.
    drawMoon(moon, solar)
    drawClouds(seconds, solar, moon)
    drawCloudReflections(seconds, solar, moon)
    drawSun(solar)
    // The film-grain tile advances only a few pixels per second. Its position
    // is effectively unchanged between these cached frames, so composite it
    // here instead of blending a full-screen noise pass on every render.
    if (!reducedMotion) drawGrain(seconds)
    ctx = frameContext
    backdropFrameKey = nextBackdropFrameKey
  }

  // Replacing the opaque backdrop also clears last frame's animated overlays.
  ctx.save()
  ctx.globalCompositeOperation = 'copy'
  ctx.globalAlpha = 1
  ctx.drawImage(backdropCanvas, 0, 0, width, height)
  ctx.restore()

  // Fast, small-area effects remain live at the scene frame rate.
  drawBirds(seconds, solar)
  drawStars(seconds, solar)
  drawLakeReflection(seconds, solar)
  drawRipples(solar)
  drawComet(date, solar, seconds)
  drawVignette(solar)
}

function seedDetails() {
  shimmerSeeds = Array.from({ length: 38 }, (_, i) => ({
    x: ((i * 73.37) % 1000) / 1000,
    y: 0.31 + ((i * 39.71) % 480) / 1000,
    length: 0.003 + ((i * 17) % 30) / 1000,
    drift: 0.00012 + ((i * 29) % 10) / 100000,
    speed: 0.028 + ((i * 29) % 12) / 100,
    phase: i * 2.37,
  }))
  starSeeds = Array.from({ length: 105 }, () => ({
    x: 0.015 + Math.random() * 0.97,
    // Keep the stars above the highest crater ridges across the whole panorama.
    y: 0.012 + Math.random() * 0.095,
    radius: 0.5 + Math.random() * 1.3,
    speed: 0.5 + Math.random() * 2.3,
    driftX: 0.0015 + Math.random() * 0.002,
    driftY: 0.0006 + Math.random() * 0.0008,
    driftSpeed: 0.025 + Math.random() * 0.02,
    phase: Math.random() * Math.PI * 2,
    warm: Math.random() < 0.14,
  }))
  clouds = Array.from({ length: 6 }, (_, i) => ({
    u: (i * 0.217 + 0.03) % 1,
    v: 0.045 + ((i * 19) % 11) / 100,
    width: 0.055 + ((i * 11) % 5) / 100,
    height: 0.008 + ((i * 7) % 4) / 1000,
    speed: 0.00045 + ((i * 17) % 20) / 100000,
  }))
  birdFlocks = Array.from({ length: 5 }, (_, i) => ({
    u: (i * 0.293 + 0.14) % 1,
    v: 0.105 + ((i * 17) % 38) / 1000,
    speed: 0.022 + ((i * 13) % 9) / 1000,
    direction: i % 2 === 0 ? 1 : -1,
    slope: (i % 2 === 0 ? 1 : -1) * (0.012 + (i % 3) * 0.009),
    wave: 0.0018 + (i % 3) * 0.0007,
    size: 0.009 + (i % 4) * 0.0012,
    count: 4 + (i % 3),
    phase: i * 1.73,
  }))
}

function resize() {
  if (!canvas.value || !ctx) return
  width = canvas.value.clientWidth
  height = canvas.value.clientHeight
  if (!width || !height) return
  pixelRatio = Math.min(window.devicePixelRatio || 1, 1.6)
  canvas.value.width = Math.round(width * pixelRatio)
  canvas.value.height = Math.round(height * pixelRatio)
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  if (!backdropCanvas) {
    backdropCanvas = document.createElement('canvas')
    backdropContext = backdropCanvas.getContext('2d', { alpha: false })
  }
  backdropCanvas.width = canvas.value.width
  backdropCanvas.height = canvas.value.height
  backdropContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  backdropFrameKey = null
  cloudPuffSprites.clear()
  const clock = currentSceneClock()
  drawFrame(clock.date, clock.seconds)
}

function onPreviewClock(event) {
  if (!PREVIEW_MODE) return
  const { timestamp, timeScale } = event.detail || {}
  if (Number.isFinite(timeScale)) {
    activeTimeScale = clamp(timeScale, 1, 3600)
  }
  if (Number.isFinite(timestamp)) {
    simulatedTimestamp = timestamp
    lastClockWallTime = Date.now()
    if (reducedMotion && image) drawFrame(new Date(simulatedTimestamp), simulatedSeconds)
  }
}

function advanceSceneClock() {
  const wallTime = Date.now()
  if (!lastClockWallTime) {
    lastClockWallTime = wallTime
    simulatedTimestamp = PREVIEW_MODE ? PREVIEW_START_TIMESTAMP : wallTime
  }
  const elapsed = Math.max(0, (wallTime - lastClockWallTime) / 1000)
  lastClockWallTime = wallTime
  simulatedTimestamp += elapsed * activeTimeScale * 1000
  simulatedSeconds += elapsed * activeTimeScale
  return currentSceneClock()
}

function tick(now) {
  if (!running) return
  raf = requestAnimationFrame(tick)
  if (now - lastRender < 33) return
  lastRender = now
  const clock = advanceSceneClock()
  drawFrame(clock.date, clock.seconds)
}

function stopAnimation() {
  running = false
  cancelAnimationFrame(raf)
  clearInterval(timeInterval)
  timeInterval = 0
}

function startAnimation() {
  if (!image || document.hidden || !sceneVisible || running) return
  running = true
  if (!lastClockWallTime) {
    lastClockWallTime = Date.now()
    simulatedTimestamp = PREVIEW_MODE ? PREVIEW_START_TIMESTAMP : lastClockWallTime
  }
  if (reducedMotion) {
    drawFrame(new Date(simulatedTimestamp), simulatedSeconds)
    timeInterval = window.setInterval(() => {
      const clock = advanceSceneClock()
      drawFrame(clock.date, clock.seconds)
    }, 60000)
  } else {
    lastRender = 0
    raf = requestAnimationFrame(tick)
  }
}

function startWhenReady() {
  if (!sceneVisible || document.hidden) return
  if (image) {
    const clock = advanceSceneClock()
    drawFrame(clock.date, clock.seconds)
    startAnimation()
    return
  }
  if (sceneImageLoadPromise) return
  sceneImageLoadPromise = loadSceneImages().then(() => {
    image = sceneImages.get('sunset') || sceneImages.values().next().value || null
    if (!sceneVisible || document.hidden || !image) return
    resize()
    startAnimation()
  }).finally(() => {
    sceneImageLoadPromise = null
  })
}

function onVisibilityChange() {
  if (document.hidden) stopAnimation()
  else startWhenReady()
}

function onSceneVisibility(entries) {
  sceneVisible = Boolean(entries[0]?.isIntersecting)
  if (sceneVisible) startWhenReady()
  else stopAnimation()
}

function loadImage(sourceUrl) {
  return new Promise((resolve) => {
    const source = new Image()
    source.onload = () => resolve(source)
    source.onerror = () => resolve(null)
    source.src = sourceUrl
  })
}

async function loadSceneImages() {
  const initialWeights = sceneWeightsAt(currentSceneClock().date)
  neededSceneNames = new Set(initialWeights.keys())
  const initialNames = new Set([...neededSceneNames, 'sunset'])
  const loaded = await Promise.all(
    [...initialNames].map(async (name) => [name, await loadImage(SCENE_ASSETS[name])]),
  )
  const resolved = new Map(loaded.filter(([, source]) => source))
  const fallback = resolved.get('sunset') || resolved.values().next().value || null
  for (const name of neededSceneNames) {
    if (!resolved.has(name) && fallback) resolved.set(name, fallback)
  }
  sceneImages = resolved
  trimSceneImageCache()
  return fallback
}

onMounted(async () => {
  ctx = canvas.value.getContext('2d', { alpha: false })
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  buildGrain()
  seedDetails()
  window.addEventListener('resize', resize)
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pointerdown', onLakePointerDown)
  if (PREVIEW_MODE) {
    simulatedTimestamp = PREVIEW_START_TIMESTAMP
    window.addEventListener('sky:preview-clock', onPreviewClock)
  }
  sceneObserver = new IntersectionObserver(onSceneVisibility, { threshold: 0 })
  sceneObserver.observe(canvas.value)
})

onUnmounted(() => {
  stopAnimation()
  window.removeEventListener('resize', resize)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('pointerdown', onLakePointerDown)
  window.removeEventListener('sky:preview-clock', onPreviewClock)
  if (sceneObserver) sceneObserver.disconnect()
  sceneObserver = null
  if (backdropCanvas) {
    backdropCanvas.width = 1
    backdropCanvas.height = 1
  }
  backdropCanvas = null
  backdropContext = null
})
</script>

<template>
  <canvas ref="canvas" class="sky-canvas"></canvas>
</template>

<style scoped>
.sky-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
}
</style>
