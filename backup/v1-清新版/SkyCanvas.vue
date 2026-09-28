<script setup>
// 新海诚风格动态天空：流动的云 + 太阳光晕 + 漂浮的光之粒子
// 纯 Canvas 实现，无图片资源，轻量高性能
import { onMounted, onUnmounted, ref } from 'vue'

const canvas = ref(null)
let ctx, raf
let W, H, dpr
let clouds = []
let particles = []
let running = true

// 生成一朵"云"：若干团柔和的径向渐变
function makeCloud(randomX = true) {
  const scale = 0.6 + Math.random() * 1.6
  const puffs = []
  const n = 5 + Math.floor(Math.random() * 4)
  for (let i = 0; i < n; i++) {
    puffs.push({
      dx: (i - n / 2) * 38 * scale + (Math.random() - 0.5) * 20,
      dy: (Math.random() - 0.5) * 22 * scale,
      r: (26 + Math.random() * 22) * scale,
    })
  }
  return {
    x: randomX ? Math.random() * (W + 400) - 200 : -300,
    y: H * (0.08 + Math.random() * 0.45),
    scale,
    speed: 0.12 + Math.random() * 0.25,
    alpha: 0.35 + Math.random() * 0.4,
    puffs,
  }
}

// 生成漂浮的光粒子（逆光下的尘埃/花粉）
function makeParticle(randomY = true) {
  return {
    x: Math.random() * W,
    y: randomY ? Math.random() * H : H + 10,
    r: 0.8 + Math.random() * 2.4,
    vy: -(0.15 + Math.random() * 0.4),
    vx: (Math.random() - 0.5) * 0.2,
    phase: Math.random() * Math.PI * 2,
    twinkle: 0.008 + Math.random() * 0.02,
  }
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  W = canvas.value.clientWidth
  H = canvas.value.clientHeight
  canvas.value.width = W * dpr
  canvas.value.height = H * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function drawSun() {
  const sx = W * 0.78
  const sy = H * 0.22
  const R = Math.min(W, H) * 0.5

  // 外层光晕
  let g = ctx.createRadialGradient(sx, sy, 0, sx, sy, R)
  g.addColorStop(0, 'rgba(255, 244, 190, 0.85)')
  g.addColorStop(0.25, 'rgba(255, 230, 160, 0.35)')
  g.addColorStop(1, 'rgba(255, 230, 160, 0)')
  ctx.fillStyle = g
  ctx.fillRect(sx - R, sy - R, R * 2, R * 2)

  // 太阳本体
  g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 46)
  g.addColorStop(0, 'rgba(255, 253, 235, 1)')
  g.addColorStop(0.7, 'rgba(255, 246, 200, 0.95)')
  g.addColorStop(1, 'rgba(255, 240, 180, 0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(sx, sy, 46, 0, Math.PI * 2)
  ctx.fill()
}

function drawCloud(c) {
  for (const p of c.puffs) {
    const x = c.x + p.dx * c.scale
    const y = c.y + p.dy * c.scale
    const r = p.r * c.scale
    const g = ctx.createRadialGradient(x, y - r * 0.25, r * 0.1, x, y, r)
    // 云底部带一点暖色，模拟夕阳侧光
    g.addColorStop(0, `rgba(255, 255, 255, ${c.alpha})`)
    g.addColorStop(0.75, `rgba(255, 250, 240, ${c.alpha * 0.85})`)
    g.addColorStop(1, 'rgba(255, 235, 220, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawParticle(p, t) {
  p.phase += p.twinkle
  const tw = 0.35 + Math.abs(Math.sin(p.phase)) * 0.65
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3)
  g.addColorStop(0, `rgba(255, 252, 230, ${0.9 * tw})`)
  g.addColorStop(1, 'rgba(255, 252, 230, 0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2)
  ctx.fill()
}

function tick(t) {
  if (!running) return

  // 天空渐变背景（画在 canvas 上，保证全屏覆盖）
  const sky = ctx.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, '#1e5aa8')
  sky.addColorStop(0.45, '#63b3ed')
  sky.addColorStop(0.78, '#ffd9e8')
  sky.addColorStop(1, '#ffe9c9')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, H)

  drawSun()

  for (const c of clouds) {
    c.x += c.speed
    if (c.x - 300 * c.scale > W) Object.assign(c, makeCloud(false))
    drawCloud(c)
  }

  for (const p of particles) {
    p.x += p.vx + Math.sin(t / 3000 + p.phase) * 0.15
    p.y += p.vy
    if (p.y < -10 || p.x < -10 || p.x > W + 10) Object.assign(p, makeParticle(false))
    drawParticle(p, t)
  }

  raf = requestAnimationFrame(tick)
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
  ctx = canvas.value.getContext('2d')
  resize()
  window.addEventListener('resize', resize)
  document.addEventListener('visibilitychange', onVisibility)

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  clouds = Array.from({ length: 9 }, () => makeCloud())
  particles = Array.from({ length: reduceMotion ? 0 : 40 }, () => makeParticle())
  raf = requestAnimationFrame(tick)
})

onUnmounted(() => {
  running = false
  cancelAnimationFrame(raf)
  window.removeEventListener('resize', resize)
  document.removeEventListener('visibilitychange', onVisibility)
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
}
</style>
