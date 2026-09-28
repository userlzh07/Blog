<script setup>
// 柔和的光标氛围光；全局覆盖层，不影响任何交互
import { onMounted, onUnmounted, ref } from 'vue'

const canvas = ref(null)
let ctx, raf
let W, H, dpr
let running = true
const particles = []
const MAX = 260
const cursor = { x: -100, y: -100, sx: -100, sy: -100, active: false }
let last = null

const rand = (a, b) => a + Math.random() * (b - a)

function spawn(x, y, vx, vy) {
  if (particles.length >= MAX) particles.shift()
  const angle = rand(0, Math.PI * 2)
  const speed = rand(0.05, 0.5)
  particles.push({
    x: x + rand(-2, 2),
    y: y + rand(-2, 2),
    vx: vx * 0.12 + Math.cos(angle) * speed * 0.3,
    vy: vy * 0.12 + Math.sin(angle) * speed * 0.3 - 0.15,
    life: 0,
    max: rand(35, 70),
    size: rand(0.9, 2.4),
    hue: rand(165, 190),
    sparkle: Math.random() > 0.85,
  })
}

function onPointerMove(e) {
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
}

function tick() {
  if (!running) return
  ctx.clearRect(0, 0, W, H)

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
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 3.2)
    glow.addColorStop(0, `hsla(${p.hue}, 85%, 82%, ${alpha})`)
    glow.addColorStop(0.4, `hsla(${p.hue}, 80%, 66%, ${alpha * 0.5})`)
    glow.addColorStop(1, `hsla(${p.hue}, 80%, 60%, 0)`)
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(p.x, p.y, radius * 3.2, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = `hsla(${p.hue}, 90%, 92%, ${alpha})`
    ctx.beginPath()
    ctx.arc(p.x, p.y, radius * 0.7, 0, Math.PI * 2)
    ctx.fill()

    if (p.sparkle && life > 0.4) {
      const length = radius * 5 * life
      ctx.strokeStyle = `hsla(${p.hue}, 90%, 88%, ${alpha * 0.5})`
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.moveTo(p.x - length, p.y)
      ctx.lineTo(p.x + length, p.y)
      ctx.moveTo(p.x, p.y - length)
      ctx.lineTo(p.x, p.y + length)
      ctx.stroke()
    }
  }
  ctx.restore()

  drawCursorHalo()
  raf = requestAnimationFrame(tick)
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  W = window.innerWidth
  H = window.innerHeight
  canvas.value.width = W * dpr
  canvas.value.height = H * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function onVisibility() {
  if (document.hidden) {
    running = false
    cancelAnimationFrame(raf)
  } else if (!running) {
    running = true
    raf = requestAnimationFrame(tick)
  }
}

onMounted(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduceMotion) return // 减少动态偏好的用户不启用
  ctx = canvas.value.getContext('2d')
  resize()
  window.addEventListener('resize', resize)
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  document.addEventListener('visibilitychange', onVisibility)
  raf = requestAnimationFrame(tick)
})

onUnmounted(() => {
  running = false
  cancelAnimationFrame(raf)
  window.removeEventListener('resize', resize)
  window.removeEventListener('pointermove', onPointerMove)
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
