<script setup>
// 「黄昏之时」天空 v2 ——《你的名字》×《天气之子》
// 黄昏渐变天幕 · 群星 · 彗星 · 穿透云层的阳光 · 逆光金边云 · 远山与城市剪影
import { onMounted, onUnmounted, ref } from 'vue'

const canvas = ref(null)
let ctx, raf
let W, H, dpr
let running = true

let stars = []
let cloudLayers = [[], [], []] // 远景剪影云 / 中层紫云 / 近景暖云
let particles = []
let ridges = []
let comet = null

const rand = (a, b) => a + Math.random() * (b - a)

/* ---------------- 云精灵（预渲染，高性能 + 逆光金边） ---------------- */

function makeCloudSprite(scale, topColor, bottomColor, rimColor) {
  const puffs = []
  const n = 6 + Math.floor(Math.random() * 4)
  for (let i = 0; i < n; i++) {
    puffs.push({
      dx: (i - n / 2) * 34 * scale + rand(-14, 14) * scale,
      dy: rand(-1, 1) * 18 * scale - Math.abs(i - n / 2) * 5 * scale,
      r: rand(24, 44) * scale,
    })
  }

  // 计算包围盒
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9
  for (const p of puffs) {
    minX = Math.min(minX, p.dx - p.r * 1.4)
    minY = Math.min(minY, p.dy - p.r * 1.4)
    maxX = Math.max(maxX, p.dx + p.r * 1.4)
    maxY = Math.max(maxY, p.dy + p.r * 1.4)
  }
  const pad = 8
  const w = maxX - minX + pad * 2
  const h = maxY - minY + pad * 2
  const off = document.createElement('canvas')
  off.width = w
  off.height = h
  const c = off.getContext('2d')
  c.translate(-minX + pad, -minY + pad)

  // 1) 云体：柔和的径向渐变团
  for (const p of puffs) {
    const g = c.createRadialGradient(p.dx, p.dy - p.r * 0.3, p.r * 0.1, p.dx, p.dy, p.r * 1.3)
    g.addColorStop(0, topColor)
    g.addColorStop(0.55, topColor)
    g.addColorStop(1, 'rgba(255,255,255,0)')
    c.fillStyle = g
    c.beginPath()
    c.arc(p.dx, p.dy, p.r * 1.3, 0, Math.PI * 2)
    c.fill()
  }

  // 2) 底部阴影：顶部受光（暖粉），底部沉入暮色（靛紫）
  c.globalCompositeOperation = 'source-atop'
  const shade = c.createLinearGradient(0, minY, 0, maxY)
  shade.addColorStop(0, 'rgba(0,0,0,0)')
  shade.addColorStop(0.6, 'rgba(0,0,0,0)')
  shade.addColorStop(1, bottomColor)
  c.fillStyle = shade
  c.fillRect(minX, minY, maxX - minX, maxY - minY)

  // 3) 逆光金边：只给靠上的云团描一道柔和的暖光（避免满屏描边感）
  c.globalCompositeOperation = 'lighter'
  const sorted = [...puffs].sort((a, b) => a.dy - b.dy)
  const rimmed = sorted.slice(0, Math.ceil(sorted.length / 2))
  for (const p of rimmed) {
    c.strokeStyle = rimColor
    c.lineWidth = Math.max(1.5, 1.8 * scale)
    c.lineCap = 'round'
    c.beginPath()
    c.arc(p.dx, p.dy, p.r * 0.88, Math.PI * 1.2, Math.PI * 1.8)
    c.stroke()
    // 柔化：用云色再盖一层
    c.strokeStyle = topColor
    c.lineWidth = Math.max(2.5, 3.2 * scale)
    c.globalAlpha = 0.5
    c.beginPath()
    c.arc(p.dx, p.dy + 1.5 * scale, p.r * 0.86, Math.PI * 1.2, Math.PI * 1.8)
    c.stroke()
    c.globalAlpha = 1
  }
  c.globalCompositeOperation = 'source-over'

  return { img: off, w, h }
}

function buildClouds() {
  cloudLayers = [[], [], []]
  // 远景：暮色剪影云（小而暗，压在天幕上）
  for (let i = 0; i < 7; i++) {
    cloudLayers[0].push({
      sprite: makeCloudSprite(
        rand(0.5, 0.9),
        'rgba(88, 74, 140, 0.85)',
        'rgba(45, 38, 90, 0.9)',
        'rgba(215, 155, 200, 0.25)',
      ),
      x: rand(-200, W),
      y: rand(H * 0.05, H * 0.3),
      speed: rand(0.06, 0.14),
      alpha: rand(0.5, 0.8),
      scale: rand(0.8, 1.4),
    })
  }
  // 中层：粉紫过渡云
  for (let i = 0; i < 8; i++) {
    cloudLayers[1].push({
      sprite: makeCloudSprite(
        rand(0.8, 1.4),
        'rgba(255, 214, 226, 0.92)',
        'rgba(120, 90, 170, 0.75)',
        'rgba(255, 200, 170, 0.35)',
      ),
      x: rand(-300, W),
      y: rand(H * 0.15, H * 0.5),
      speed: rand(0.1, 0.22),
      alpha: rand(0.5, 0.85),
      scale: rand(1, 1.8),
    })
  }
  // 近景：地平线附近的大朵暖云（被夕阳点燃的金边云）
  for (let i = 0; i < 5; i++) {
    cloudLayers[2].push({
      sprite: makeCloudSprite(
        rand(1.4, 2.2),
        'rgba(255, 240, 220, 0.98)',
        'rgba(160, 110, 170, 0.8)',
        'rgba(255, 235, 190, 0.55)',
      ),
      x: rand(-400, W),
      y: rand(H * 0.62, H * 0.85),
      speed: rand(0.16, 0.3),
      alpha: rand(0.5, 0.8),
      scale: rand(1.2, 1.9),
    })
  }
}

/* ---------------- 远山 / 城市剪影 ---------------- */

function buildRidges() {
  ridges = [
    { base: H * 0.86, amp: H * 0.1, step: 90, colorTop: '#4a3f7a', colorBottom: '#332b5c', points: [] },
    { base: H * 0.95, amp: H * 0.07, step: 55, colorTop: '#2c2452', colorBottom: '#1c1738', points: [] },
  ]
  for (const r of ridges) {
    r.points = []
    let y = r.base - rand(0, r.amp)
    for (let x = -r.step; x <= W + r.step; x += r.step) {
      r.points.push({ x, y })
      y = Math.min(r.base + 10, Math.max(r.base - r.amp, y + rand(-r.amp * 0.6, r.amp * 0.6)))
    }
  }
}

function drawRidge(r, withLights) {
  ctx.beginPath()
  ctx.moveTo(r.points[0].x, H + 4)
  for (let i = 0; i < r.points.length - 1; i++) {
    const p = r.points[i]
    const q = r.points[i + 1]
    ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2)
  }
  ctx.lineTo(W + 4, H + 4)
  ctx.closePath()
  const g = ctx.createLinearGradient(0, r.base - r.amp, 0, H)
  g.addColorStop(0, r.colorTop)
  g.addColorStop(1, r.colorBottom)
  ctx.fillStyle = g
  ctx.fill()

  // 城市灯火：山脊上零星的暖光点（《天气之子》的东京夜景感）
  if (withLights) {
    for (let i = 0; i < r.points.length; i++) {
      const p = r.points[i]
      const count = Math.floor(rand(0, 4))
      for (let k = 0; k < count; k++) {
        const lx = p.x + rand(0, r.step)
        const ly = p.y + rand(6, 26)
        ctx.fillStyle = `rgba(255, 210, 140, ${rand(0.3, 0.8)})`
        ctx.fillRect(lx, ly, 1.6, 1.6)
      }
    }
  }
}

/* ---------------- 星星 ---------------- */

function buildStars() {
  stars = Array.from({ length: 130 }, () => ({
    x: Math.random(),
    y: Math.random() * 0.55, // 星星集中在天空上半部
    r: rand(0.4, 1.4),
    phase: rand(0, Math.PI * 2),
    speed: rand(0.002, 0.01),
  }))
}

/* ---------------- 彗星 ---------------- */

function spawnComet() {
  const fromLeft = Math.random() > 0.5
  comet = {
    active: true,
    x: fromLeft ? W * rand(0.1, 0.4) : W * rand(0.6, 0.95),
    y: H * rand(0.03, 0.18),
    vx: (fromLeft ? 1 : -1) * rand(2.2, 3.2),
    vy: rand(1.1, 1.6),
    life: 0,
    next: null,
  }
}

function drawComet() {
  if (!comet) spawnComet()
  if (!comet.active) {
    comet.next -= 1
    if (comet.next <= 0) spawnComet()
    return
  }
  comet.life++
  comet.x += comet.vx
  comet.y += comet.vy

  const fade = Math.min(1, comet.life / 30)
  // 彗尾：沿运动反方向的渐变光束
  const tailLen = 130
  const tx = comet.x - comet.vx * (tailLen / 3)
  const ty = comet.y - comet.vy * (tailLen / 3)
  const g = ctx.createLinearGradient(comet.x, comet.y, tx, ty)
  g.addColorStop(0, `rgba(255, 245, 225, ${0.85 * fade})`)
  g.addColorStop(1, 'rgba(255, 245, 225, 0)')
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.strokeStyle = g
  ctx.lineWidth = 2.4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(comet.x, comet.y)
  ctx.lineTo(tx, ty)
  ctx.stroke()

  // 彗头光点
  const hg = ctx.createRadialGradient(comet.x, comet.y, 0, comet.x, comet.y, 7)
  hg.addColorStop(0, `rgba(255, 255, 245, ${fade})`)
  hg.addColorStop(1, 'rgba(255, 255, 245, 0)')
  ctx.fillStyle = hg
  ctx.beginPath()
  ctx.arc(comet.x, comet.y, 7, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  if (comet.x < -160 || comet.x > W + 160 || comet.y > H * 0.6) {
    comet = { active: false, next: Math.floor(rand(400, 900)) }
  }
}

/* ---------------- 光粒子 ---------------- */

function makeParticle(randomY = true) {
  return {
    x: Math.random() * W,
    y: randomY ? Math.random() * H : H + 10,
    r: rand(0.8, 2.6),
    vy: -rand(0.12, 0.45),
    vx: rand(-0.15, 0.15),
    phase: rand(0, Math.PI * 2),
    twinkle: rand(0.006, 0.02),
  }
}

/* ---------------- 主循环 ---------------- */

const SUN = () => ({ x: W * 0.5, y: H * 0.72 })

function drawSky() {
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#151538') // 深空靛蓝
  g.addColorStop(0.28, '#3d3a7d') // 蓝紫
  g.addColorStop(0.52, '#8a5aa0') // 紫罗兰
  g.addColorStop(0.72, '#d97ba6') // 茜粉
  g.addColorStop(0.88, '#f7a76c') // 落日橘
  g.addColorStop(1, '#ffdba8') // 地平线暖光
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
}

function drawStars(t) {
  for (const s of stars) {
    s.phase += s.speed
    const tw = 0.25 + Math.abs(Math.sin(s.phase)) * 0.75
    // 越靠上越亮，靠近地平线淡出
    const yFade = 1 - (s.y * H) / (H * 0.6)
    const a = tw * Math.max(0, yFade) * 0.9
    if (a <= 0.02) continue
    ctx.fillStyle = `rgba(230, 235, 255, ${a})`
    ctx.beginPath()
    ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawSunAndRays(t) {
  const { x: sx, y: sy } = SUN()
  const R = Math.max(W, H)

  // 大范围光晕
  let g = ctx.createRadialGradient(sx, sy, 0, sx, sy, R * 0.7)
  g.addColorStop(0, 'rgba(255, 200, 130, 0.75)')
  g.addColorStop(0.3, 'rgba(255, 170, 120, 0.28)')
  g.addColorStop(1, 'rgba(255, 170, 120, 0)')
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  // 穿透云层的光束（《天气之子》的陽光）
  const beams = 11
  ctx.translate(sx, sy)
  ctx.rotate(Math.sin(t / 9000) * 0.06) // 光束缓慢摆动
  for (let i = 0; i < beams; i++) {
    const angle = -Math.PI / 2 + (i - (beams - 1) / 2) * 0.22
    const spread = 0.05 + (i % 3) * 0.02
    const len = R * rand(0.85, 1)
    ctx.save()
    ctx.rotate(angle)
    const bg = ctx.createLinearGradient(0, 0, 0, -len)
    bg.addColorStop(0, 'rgba(255, 225, 170, 0.16)')
    bg.addColorStop(1, 'rgba(255, 225, 170, 0)')
    ctx.fillStyle = bg
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(-len * spread, -len)
    ctx.lineTo(len * spread, -len)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
  ctx.restore()

  // 太阳本体（低垂的夕阳）
  g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 60)
  g.addColorStop(0, 'rgba(255, 252, 235, 1)')
  g.addColorStop(0.5, 'rgba(255, 220, 160, 0.95)')
  g.addColorStop(1, 'rgba(255, 200, 140, 0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(sx, sy, 60, 0, Math.PI * 2)
  ctx.fill()
}

function drawCloudLayer(layer) {
  for (const c of layer) {
    c.x += c.speed
    const w = c.sprite.w * c.scale
    const h = c.sprite.h * c.scale
    if (c.x - w > W) {
      c.x = -w - rand(0, 150)
    }
    ctx.globalAlpha = c.alpha
    ctx.drawImage(c.sprite.img, c.x - w / 2, c.y - h / 2, w, h)
  }
  ctx.globalAlpha = 1
}

function drawParticles() {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const p of particles) {
    p.phase += p.twinkle
    p.x += p.vx + Math.sin(p.phase * 2) * 0.12
    p.y += p.vy
    if (p.y < -12 || p.x < -12 || p.x > W + 12) Object.assign(p, makeParticle(false))
    const tw = 0.3 + Math.abs(Math.sin(p.phase)) * 0.7
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3)
    g.addColorStop(0, `rgba(255, 236, 200, ${0.75 * tw})`)
    g.addColorStop(1, 'rgba(255, 236, 200, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function tick(t) {
  if (!running) return

  drawSky()
  drawStars(t)
  drawComet()
  drawSunAndRays(t)

  // 由远及近：剪影云 → 远山（后） → 中层云 → 近景暖云 → 远山（前，带灯火）
  drawCloudLayer(cloudLayers[0])
  drawRidge(ridges[0], false)
  drawCloudLayer(cloudLayers[1])
  drawCloudLayer(cloudLayers[2])
  drawRidge(ridges[1], true)

  drawParticles()

  raf = requestAnimationFrame(tick)
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  W = canvas.value.clientWidth
  H = canvas.value.clientHeight
  canvas.value.width = W * dpr
  canvas.value.height = H * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  buildStars()
  buildClouds()
  buildRidges()
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
  particles = Array.from({ length: reduceMotion ? 0 : 36 }, () => makeParticle())
  if (reduceMotion) {
    tick(0) // 只渲染一帧静态画面
    running = false
  } else {
    raf = requestAnimationFrame(tick)
  }
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
