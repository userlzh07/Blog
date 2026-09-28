<script setup>
// 鼠标彗星拖尾：光标划过之处洒出青蓝色光粒，如彗尾流转
// 全局覆盖层（pointer-events: none），不影响任何交互
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

function spawn(x, y, vx, vy, burst = false) {
  if (particles.length >= MAX) particles.shift()
  const angle = rand(0, Math.PI * 2)
  const speed = burst ? rand(0.4, 1.8) : rand(0.05, 0.5)
  particles.push({
    x: x + rand(-2, 2),
    y: y + rand(-2, 2),
    vx: vx * 0.12 + Math.cos(angle) * speed * 0.3,
    vy: vy * 0.12 + Math.sin(angle) * speed * 0.3 - 0.15,
    life: 0,
    max: burst ? rand(50, 90) : rand(35, 70),
    size: burst ? rand(1.4, 3.2) : rand(0.9, 2.4),
    hue: rand(165, 190), // 青蓝 → 青绿
    sparkle: Math.random() > 0.85,
  })
}

function onPointerMove(e) {
  const x = e.clientX
  const y = e.clientY
  cursor.x = x
  cursor.y = y
  cursor.active = true

  // 在上一个位置和当前位置之间插值，快速移动时拖尾也不断裂
  if (last) {
    const dx = x - last.x
    const dy = y - last.y
    const dist = Math.hypot(dx, dy)
    const steps = Math.min(8, Math.floor(dist / 6))
    for (let i = 1; i <= steps; i++) {
      const k = i / (steps + 1)
      spawn(last.x + dx * k, last.y + dy * k, dx * 0.06, dy * 0.06)
    }
    // 速度越快，光粒越大越亮
    if (dist > 4) spawn(x, y, dx * 0.06, dy * 0.06)
  } else {
    spawn(x, y, 0, 0)
  }
  last = { x, y }
}

function onPointerDown(e) {
  // 点击时迸发出一圈光粒
  for (let i = 0; i < 14; i++) spawn(e.clientX, e.clientY, 0, 0, true)
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
    p.vy -= 0.004 // 轻微上浮，像飘散的萤火
    p.vx *= 0.985
    p.vy *= 0.985

    const k = 1 - p.life / p.max
    const a = k * k * 0.85
    const r = p.size * (0.6 + k * 0.8)

    // 光晕
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.2)
    g.addColorStop(0, `hsla(${p.hue}, 85%, 82%, ${a})`)
    g.addColorStop(0.4, `hsla(${p.hue}, 80%, 66%, ${a * 0.5})`)
    g.addColorStop(1, `hsla(${p.hue}, 80%, 60%, 0)`)
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(p.x, p.y, r * 3.2, 0, Math.PI * 2)
    ctx.fill()

    // 亮核
    ctx.fillStyle = `hsla(${p.hue}, 90%, 92%, ${a})`
    ctx.beginPath()
    ctx.arc(p.x, p.y, r * 0.7, 0, Math.PI * 2)
    ctx.fill()

    // 少数光粒带十字星芒
    if (p.sparkle && k > 0.4) {
      const L = r * 5 * k
      ctx.strokeStyle = `hsla(${p.hue}, 90%, 88%, ${a * 0.5})`
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.moveTo(p.x - L, p.y)
      ctx.lineTo(p.x + L, p.y)
      ctx.moveTo(p.x, p.y - L)
      ctx.lineTo(p.x, p.y + L)
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
  window.addEventListener('pointerdown', onPointerDown, { passive: true })
  document.addEventListener('visibilitychange', onVisibility)
  raf = requestAnimationFrame(tick)
})

onUnmounted(() => {
  running = false
  cancelAnimationFrame(raf)
  window.removeEventListener('resize', resize)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerdown', onPointerDown)
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
