<script setup>
// 柔和的光标氛围光；全局覆盖层，不影响任何交互
import { onMounted, onUnmounted, ref } from 'vue'

const canvas = ref(null)
let ctx, raf
let W, H, dpr
let backingStoreReady = false
let running = false
let reducedMotion = false
const particles = []
const retiredParticles = []
const MAX = 260
const cursor = { x: -100, y: -100, sx: -100, sy: -100, active: false, haloDrawn: false, haloX: -100, haloY: -100 }
let last = null
const glowSprites = new Map()

const rand = (a, b) => a + Math.random() * (b - a)

function spawn(x, y, vx, vy) {
  if (particles.length >= MAX) {
    const retired = particles.shift()
    if (retired.wasDrawn) retiredParticles.push(retired)
  }
  const angle = rand(0, Math.PI * 2)
  const speed = rand(0.05, 0.5)
  const hue = rand(165, 190)
  const sparkle = Math.random() > 0.85
  particles.push({
    x: x + rand(-2, 2),
    y: y + rand(-2, 2),
    vx: vx * 0.12 + Math.cos(angle) * speed * 0.3,
    vy: vy * 0.12 + Math.sin(angle) * speed * 0.3 - 0.15,
    life: 0,
    max: rand(35, 70),
    size: rand(0.9, 2.4),
    hue,
    sparkle,
    glow: glowSprite(hue),
    dotColor: `hsla(${hue}, 90%, 92%, 1)`,
    sparkleColor: `hsla(${hue}, 90%, 88%, 1)`,
    wasDrawn: false,
  })
}

function onPointerMove(e) {
  if (!backingStoreReady) {
    backingStoreReady = true
    resize()
  }
  const x = e.clientX
  const y = e.clientY
  cursor.x = x
  cursor.y = y
  cursor.active = true

  if (last) {
    const dx = x - last.x
    const dy = y - last.y
    const distance = Math.hypot(dx, dy)
    const steps = Math.min(8, Math.floor(distance / 6))
    for (let i = 1; i <= steps; i++) {
      const t = i / (steps + 1)
      spawn(last.x + dx * t, last.y + dy * t, dx * 0.06, dy * 0.06)
    }
    if (distance > 4) spawn(x, y, dx * 0.06, dy * 0.06)
  } else {
    spawn(x, y, 0, 0)
  }
  last = { x, y }
  ensureAnimation()
}

function ensureAnimation() {
  if (reducedMotion || running || document.hidden || !ctx) return
  running = true
  raf = requestAnimationFrame(tick)
}

function onPointerLeave(event) {
  // `pointerout` bubbles when moving between page elements; only stop at the viewport edge.
  if (event.relatedTarget) return
  cursor.active = false
  last = null
  if (particles.length) {
    ensureAnimation()
  } else if (ctx) {
    if (cursor.haloDrawn) {
      ctx.clearRect(cursor.haloX - 27, cursor.haloY - 27, 54, 54)
      cursor.haloDrawn = false
    }
    releaseCanvasBackingStore()
  }
}

function glowSprite(hue) {
  const bucket = Math.round(hue / 5) * 5
  if (glowSprites.has(bucket)) return glowSprites.get(bucket)

  const size = 96
  const center = size / 2
  const sprite = document.createElement('canvas')
  sprite.width = size
  sprite.height = size
  const spriteContext = sprite.getContext('2d')
  const glow = spriteContext.createRadialGradient(center, center, 0, center, center, center - 4)
  glow.addColorStop(0, `hsla(${bucket}, 85%, 82%, 1)`)
  glow.addColorStop(0.4, `hsla(${bucket}, 80%, 66%, 0.5)`)
  glow.addColorStop(1, `hsla(${bucket}, 80%, 60%, 0)`)
  spriteContext.fillStyle = glow
  spriteContext.fillRect(0, 0, size, size)
  glowSprites.set(bucket, sprite)
  return sprite
}

function drawCursorHalo() {
  if (!cursor.active) return
  cursor.sx += (cursor.x - cursor.sx) * 0.2
  cursor.sy += (cursor.y - cursor.sy) * 0.2
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const g = ctx.createRadialGradient(cursor.sx, cursor.sy, 0, cursor.sx, cursor.sy, 26)
  g.addColorStop(0, 'rgba(170, 240, 228, 0.14)')
  g.addColorStop(1, 'rgba(170, 240, 228, 0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cursor.sx, cursor.sy, 26, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  cursor.haloX = cursor.sx
  cursor.haloY = cursor.sy
  cursor.haloDrawn = true
}

function clearPreviousFrame() {
  // Erase only pixels touched by last frame's particles and halo. The overlay
  // remains transparent elsewhere, avoiding a full viewport clear per frame.
  for (const p of particles) {
    if (!p.wasDrawn) continue
    const radius = p.previousBoundsRadius
    ctx.clearRect(p.previousX - radius, p.previousY - radius, radius * 2, radius * 2)
    p.wasDrawn = false
  }
  for (const p of retiredParticles) {
    const radius = p.previousBoundsRadius
    ctx.clearRect(p.previousX - radius, p.previousY - radius, radius * 2, radius * 2)
  }
  retiredParticles.length = 0
  if (cursor.haloDrawn) {
    ctx.clearRect(cursor.haloX - 27, cursor.haloY - 27, 54, 54)
    cursor.haloDrawn = false
  }
}

function releaseCanvasBackingStore() {
  if (!canvas.value || !ctx || cursor.active || particles.length || !backingStoreReady) return
  // Nothing is visible after the last particle has faded. Drop the full-window
  // high-DPI backing store until the next pointer movement needs it again.
  canvas.value.width = 1
  canvas.value.height = 1
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  backingStoreReady = false
}

function tick() {
  if (!running) return
  raf = 0
  clearPreviousFrame()

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.life++
    if (p.life >= p.max) {
      particles.splice(i, 1)
      continue
    }
    p.x += p.vx
    p.y += p.vy
    p.vy -= 0.004
    p.vx *= 0.985
    p.vy *= 0.985

    const life = 1 - p.life / p.max
    const alpha = life * life * 0.85
    const radius = p.size * (0.6 + life * 0.8)
    const glowRadius = radius * 3.2
    ctx.globalAlpha = alpha
    ctx.drawImage(p.glow, p.x - glowRadius, p.y - glowRadius, glowRadius * 2, glowRadius * 2)

    ctx.fillStyle = p.dotColor
    ctx.beginPath()
    ctx.arc(p.x, p.y, radius * 0.7, 0, Math.PI * 2)
    ctx.fill()

    let sparkleLength = 0
    if (p.sparkle && life > 0.4) {
      sparkleLength = radius * 5 * life
      ctx.globalAlpha = alpha * 0.5
      ctx.strokeStyle = p.sparkleColor
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.moveTo(p.x - sparkleLength, p.y)
      ctx.lineTo(p.x + sparkleLength, p.y)
      ctx.moveTo(p.x, p.y - sparkleLength)
      ctx.lineTo(p.x, p.y + sparkleLength)
      ctx.stroke()
    }
    p.previousX = p.x
    p.previousY = p.y
    p.previousBoundsRadius = Math.max(glowRadius, sparkleLength + 0.4)
    p.wasDrawn = true
  }
  ctx.restore()

  drawCursorHalo()
  const cursorSettled = Math.abs(cursor.x - cursor.sx) < 0.15 && Math.abs(cursor.y - cursor.sy) < 0.15
  if (particles.length || (cursor.active && !cursorSettled)) {
    raf = requestAnimationFrame(tick)
  } else {
    running = false
    releaseCanvasBackingStore()
  }
}

function resize() {
  if (!canvas.value || !ctx || !backingStoreReady) return
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  W = window.innerWidth
  H = window.innerHeight
  canvas.value.width = W * dpr
  canvas.value.height = H * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  for (const p of particles) p.wasDrawn = false
  retiredParticles.length = 0
  cursor.haloDrawn = false
  if (particles.length || cursor.active) ensureAnimation()
}

function onVisibility() {
  if (document.hidden) {
    running = false
    cancelAnimationFrame(raf)
    raf = 0
  } else if (particles.length || cursor.active) {
    ensureAnimation()
  }
}

onMounted(() => {
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reducedMotion) return // 减少动态偏好的用户不启用
  ctx = canvas.value.getContext('2d')
  window.addEventListener('resize', resize)
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('pointerout', onPointerLeave)
  document.addEventListener('visibilitychange', onVisibility)
})

onUnmounted(() => {
  running = false
  cancelAnimationFrame(raf)
  window.removeEventListener('resize', resize)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerout', onPointerLeave)
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<template>
  <canvas ref="canvas" class="comet-trail"></canvas>
</template>

<style scoped>
.comet-trail {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 999;
}
</style>
