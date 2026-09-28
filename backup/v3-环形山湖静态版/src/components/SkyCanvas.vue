<script setup>
// 「黄昏之时」天空 v6 —— 环形山湖手绘底图 + 运行时动态层
// 静态场景：public/sky/crater-scene.png；动态层：彗星、光粒、湖面波光和胶片颗粒
// 动态层：彗星、光粒、飞鸟、湖面波光、彗星倒影、胶片颗粒、暗角、鼠标视差
import { onMounted, onUnmounted, ref } from 'vue'

const canvas = ref(null)
let ctx, raf
let W, H, dpr
let running = true
let frame = 0

const IMGS = {}
const layersReady = ref(false)

let particles = []
let shimmers = []
let flock = null
let comet = { active: false, next: 120 }

let grainCanvas = null
let grainPattern = null
let grainBlend = 'overlay'
let grainOffset = [0, 0]

const rand = (a, b) => a + Math.random() * (b - a)
const HORIZON = () => {
  const { cy, ry } = LAKE()
  return cy - ry
}

const BASE = import.meta.env.BASE_URL

function loadImages() {
  const names = ['back', 'mountains', 'water', 'crater-scene']
  return Promise.all(
    names.map(
      (n) =>
        new Promise((resolve) => {
          const img = new Image()
          img.onload = () => {
            IMGS[n === 'crater-scene' ? 'crater' : n] = img
            resolve()
          }
          img.onerror = () => resolve() // 加载失败则跳过该层
          img.src = `${BASE}sky/${n}.png`
        }),
    ),
  ).then(() => {
    layersReady.value = true
  })
}

/* ================= 陨石湖：椭圆湖面 + 环形山环带 ================= */

// 湖面范围跟随整幅插画的 cover 裁切，确保动态波光仍贴在湖里。
function LAKE() {
  if (IMGS.crater) {
    const img = IMGS.crater
    const scale = Math.max(W / img.width, H / img.height)
    const drawW = img.width * scale
    const drawH = img.height * scale
    return {
      cx: (W - drawW) / 2 + drawW * 0.5,
      cy: (H - drawH) / 2 + drawH * 0.51,
      rx: drawW * 0.49,
      ry: drawH * 0.264,
    }
  }
  return {
    cx: W / 2,
    cy: H * 0.57,
    rx: W * 0.59,
    ry: Math.min(H * 0.255, W * 0.22),
  }
}

function lakeEllipse() {
  const { cx, cy, rx, ry } = LAKE()
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
}

// 环形山：让远侧火山口沿、两侧内壁和脚下近侧坡面一起围住湖。
let rimPattern = null

function buildRimTexture() {
  const s = 256
  const c = document.createElement('canvas')
  c.width = s
  c.height = s
  const g = c.getContext('2d')
  const id = g.createImageData(s, s)
  for (let i = 0; i < id.data.length; i += 4) {
    // 大块 + 细粒混合的山体噪声
    const v = 100 + Math.random() * 55
    id.data[i] = v
    id.data[i + 1] = v
    id.data[i + 2] = v
    id.data[i + 3] = 255
  }
  g.putImageData(id, 0, 0)
  rimPattern = ctx.createPattern(c, 'repeat')
}

function drawRim() {
  const { cx, cy, rx, ry } = LAKE()

  // 岩壁只落在湖岸外，避免坡面盖住水面；上缘是一圈高起的远侧火山口。
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, W, H)
  lakeEllipse()
  ctx.clip('evenodd')

  const traceCraterSilhouette = () => {
    ctx.beginPath()
    ctx.moveTo(-W * 0.08, H * 0.48)
    ctx.bezierCurveTo(W * 0.06, H * 0.39, W * 0.16, H * 0.27, W * 0.31, H * 0.275)
    ctx.bezierCurveTo(W * 0.42, H * 0.235, W * 0.57, H * 0.235, W * 0.69, H * 0.275)
    ctx.bezierCurveTo(W * 0.84, H * 0.275, W * 0.95, H * 0.37, W * 1.08, H * 0.48)
    ctx.lineTo(W * 1.08, H + 2)
    ctx.lineTo(-W * 0.08, H + 2)
    ctx.closePath()
  }

  traceCraterSilhouette()
  ctx.save()
  ctx.clip()
  const wall = ctx.createLinearGradient(0, H * 0.23, 0, H)
  wall.addColorStop(0, '#58618a')
  wall.addColorStop(0.22, '#39466f')
  wall.addColorStop(0.5, '#27345d')
  wall.addColorStop(0.76, '#172347')
  wall.addColorStop(1, '#0a112c')
  ctx.fillStyle = wall
  ctx.fillRect(0, 0, W, H)

  // 山体细纹与分层岩壁，远侧受暮光照亮，近侧沉入冷色阴影。
  if (!rimPattern) buildRimTexture()
  ctx.globalAlpha = 0.15
  ctx.globalCompositeOperation = 'overlay'
  ctx.fillStyle = rimPattern
  ctx.fillRect(0, 0, W, H)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'

  // 远侧火山口沿的暖色轮廓，略带起伏，不再像一条规整椭圆线。
  ctx.beginPath()
  ctx.moveTo(-W * 0.08, H * 0.48)
  ctx.bezierCurveTo(W * 0.06, H * 0.39, W * 0.16, H * 0.27, W * 0.31, H * 0.275)
  ctx.bezierCurveTo(W * 0.42, H * 0.235, W * 0.57, H * 0.235, W * 0.69, H * 0.275)
  ctx.bezierCurveTo(W * 0.84, H * 0.275, W * 0.95, H * 0.37, W * 1.08, H * 0.48)
  const crest = ctx.createLinearGradient(0, H * 0.25, 0, H * 0.52)
  crest.addColorStop(0, 'rgba(255, 214, 159, 0.7)')
  crest.addColorStop(0.42, 'rgba(230, 173, 132, 0.36)')
  crest.addColorStop(1, 'rgba(141, 147, 195, 0.08)')
  ctx.strokeStyle = crest
  ctx.lineWidth = Math.max(2, H * 0.004)
  ctx.lineCap = 'round'
  ctx.stroke()

  // 顺着盆地铺开的岩层线，近侧弧线逐渐放大，形成脚下向湖面倾落的坡度。
  for (let i = 0; i < 6; i++) {
    const scale = 1.08 + i * 0.12
    const offset = H * i * 0.006
    ctx.beginPath()
    ctx.ellipse(cx, cy + offset, rx * scale, ry * (1.08 + i * 0.12) + offset, 0, 0.015 * Math.PI, 0.985 * Math.PI)
    ctx.strokeStyle = i % 2 === 0
      ? `rgba(184, 174, 201, ${0.15 - i * 0.014})`
      : `rgba(7, 14, 36, ${0.32 - i * 0.025})`
    ctx.lineWidth = Math.max(1, H * (0.0014 + i * 0.00055))
    ctx.stroke()
  }

  // 两侧内壁的斜向岩脊，把视线引向湖心。
  for (let side = 0; side < 2; side++) {
    const sign = side === 0 ? 1 : -1
    for (let i = 0; i < 5; i++) {
      const startX = side === 0 ? W * (0.02 + i * 0.018) : W * (0.98 - i * 0.018)
      const endX = cx + sign * rx * (0.77 - i * 0.07)
      ctx.beginPath()
      ctx.moveTo(startX, H * (0.48 + i * 0.025))
      ctx.quadraticCurveTo(cx + sign * rx * 0.82, H * (0.55 + i * 0.025), endX, cy + ry * 0.48)
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(184, 177, 205, 0.13)' : 'rgba(7, 13, 35, 0.22)'
      ctx.lineWidth = Math.max(1, H * 0.002)
      ctx.stroke()
    }
  }

  // 近侧岩坡的细碎草石剪影，保留大块留白，让湖仍是画面主角。
  for (let i = 0; i < 46; i++) {
    const x = ((i * 131.7) % 1000) / 1000 * W
    const depth = ((i * 47.3) % 100) / 100
    const y = H * (0.84 + depth * 0.18)
    const size = H * (0.0012 + ((i * 19) % 7) * 0.00035)
    ctx.fillStyle = i % 4 === 0 ? 'rgba(255, 205, 146, 0.28)' : 'rgba(5, 10, 28, 0.32)'
    ctx.beginPath()
    ctx.ellipse(x, y, size * 2.2, size * 0.7, (i % 5) * 0.12, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
  ctx.restore()

  // 湖岸明暗：近岸有一线暮光，远岸则薄而柔，强调盆地深度。
  ctx.save()
  lakeEllipse()
  ctx.strokeStyle = 'rgba(255, 205, 140, 0.2)'
  ctx.lineWidth = Math.max(1, H * 0.0015)
  ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0.06 * Math.PI, 0.94 * Math.PI)
  ctx.strokeStyle = 'rgba(255, 212, 152, 0.42)'
  ctx.lineWidth = Math.max(1.4, H * 0.0022)
  ctx.stroke()
  ctx.restore()
}

/* ================= 落日湖面反光（参考图里的金色光路） ================= */

function drawGlitter() {
  const y0 = HORIZON()
  const cx = W / 2
  const halfW = W * 0.2
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  const rows = 22
  for (let i = 0; i < rows; i++) {
    const k = i / rows // 0 近地平线 → 1 近屏幕下缘
    const yy = y0 + (H - y0) * k
    const hh = (H - y0) / rows + 1
    // 每一行的宽度随波光噪声抖动，形成破碎的闪光带
    const wob = Math.sin(frame * 0.03 + i * 1.7) * halfW * 0.25 * (0.3 + k)
    const wHalf = halfW * (0.55 + k * 0.7) + wob
    const flick = 0.5 + 0.5 * Math.sin(frame * 0.045 + i * 2.3)
    const a = (1 - k) * (0.13 + flick * 0.18)
    const g = ctx.createLinearGradient(cx - wHalf, 0, cx + wHalf, 0)
    g.addColorStop(0, 'rgba(255, 214, 150, 0)')
    g.addColorStop(0.5, `rgba(255, 218, 158, ${a})`)
    g.addColorStop(1, 'rgba(255, 214, 150, 0)')
    ctx.fillStyle = g
    ctx.fillRect(cx - wHalf, yy, wHalf * 2, hh)
  }
  ctx.restore()
}

/* ================= 动态元素 ================= */

function makeParticle(randomY = true) {
  return {
    x: Math.random() * W,
    y: randomY ? Math.random() * H : H + 10,
    r: rand(0.7, 2.1),
    vy: -rand(0.08, 0.3),
    vx: rand(-0.1, 0.1),
    phase: rand(0, Math.PI * 2),
    twinkle: rand(0.005, 0.015),
  }
}

function spawnComet() {
  const fromRight = Math.random() > 0.4
  comet = {
    active: true,
    x: fromRight ? W * rand(0.55, 0.92) : W * rand(0.08, 0.4),
    y: H * rand(0.05, 0.15),
    vx: (fromRight ? -1 : 1) * rand(0.5, 0.8),
    vy: rand(0.26, 0.4),
    life: 0,
    trail: [],
  }
}

function drawComet() {
  if (!comet.active) {
    comet.next -= 1
    if (comet.next <= 0) spawnComet()
    return
  }
  comet.life++
  comet.x += comet.vx
  comet.y += comet.vy
  comet.trail.push({ x: comet.x, y: comet.y })
  if (comet.trail.length > 26) comet.trail.shift()

  // 出场淡入、离场淡出，不再突然消失
  if (comet.fade === undefined) comet.fade = 0
  comet.fade = Math.min(1, comet.fade + 0.02)
  const leaving = comet.y > H * 0.42 || comet.x < 30 || comet.x > W - 30
  if (leaving) comet.fade = Math.max(0, comet.fade - 0.03)
  const fade = Math.min(comet.fade, Math.min(1, comet.life / 60))

  const { x, y, vx, vy } = comet
  const mag = Math.hypot(vx, vy)
  const ux = -vx / mag
  const uy = -vy / mag

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'

  // 沿轨迹的渐隐彗尾
  ctx.lineCap = 'round'
  for (let i = 1; i < comet.trail.length; i++) {
    const p0 = comet.trail[i - 1]
    const p1 = comet.trail[i]
    const k = i / comet.trail.length
    ctx.strokeStyle = `rgba(150, 235, 220, ${k * 0.35 * fade})`
    ctx.lineWidth = 1 + k * 2.2
    ctx.beginPath()
    ctx.moveTo(p0.x, p0.y)
    ctx.lineTo(p1.x, p1.y)
    ctx.stroke()
  }

  // 分裂双主尾
  const tailLen = Math.min(W, H) * 0.32
  for (const [spread, width, alpha] of [[-0.15, 2.2, 0.65], [0.13, 1.3, 0.45]]) {
    const px = -uy * spread
    const py = ux * spread
    const mx = x + ux * tailLen * 0.5 + px * tailLen * 0.5
    const my = y + uy * tailLen * 0.5 + py * tailLen * 0.5
    const ex = x + ux * tailLen + px * tailLen * 0.35
    const ey = y + uy * tailLen + py * tailLen * 0.35
    const g = ctx.createLinearGradient(x, y, ex, ey)
    g.addColorStop(0, `rgba(160, 240, 225, ${alpha * fade})`)
    g.addColorStop(0.6, `rgba(120, 210, 220, ${alpha * 0.4 * fade})`)
    g.addColorStop(1, 'rgba(120, 210, 220, 0)')
    ctx.strokeStyle = g
    ctx.lineWidth = width
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(mx, my, ex, ey)
    ctx.stroke()
  }

  // 彗头
  let hg = ctx.createRadialGradient(x, y, 0, x, y, 16)
  hg.addColorStop(0, `rgba(225, 255, 250, ${0.95 * fade})`)
  hg.addColorStop(0.35, `rgba(140, 235, 220, ${0.55 * fade})`)
  hg.addColorStop(1, 'rgba(140, 235, 220, 0)')
  ctx.fillStyle = hg
  ctx.beginPath()
  ctx.arc(x, y, 16, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = `rgba(255, 255, 255, ${fade})`
  ctx.beginPath()
  ctx.arc(x, y, 2, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()

  if (comet.fade <= 0 && leaving) {
    comet = { active: false, next: Math.floor(rand(700, 1500)) }
  }
}

function buildShimmers() {
  shimmers = Array.from({ length: 46 }, () => ({
    x: Math.random() * W,
    y: rand(HORIZON() + 6, H - 8),
    len: rand(10, 60),
    phase: rand(0, Math.PI * 2),
    speed: rand(0.004, 0.012),
    drift: rand(-0.08, 0.08),
  }))
}

function drawWaterShimmer() {
  const y0 = HORIZON()
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  for (const s of shimmers) {
    s.phase += s.speed
    s.x += s.drift
    if (s.x < -s.len) s.x = W
    if (s.x > W + s.len) s.x = -s.len
    const depth = (s.y - y0) / (H - y0)
    const a = (0.08 + Math.abs(Math.sin(s.phase)) * 0.22) * (1 - depth * 0.35)
    const warm = depth < 0.3
    ctx.strokeStyle = warm
      ? `rgba(255, 215, 150, ${a})`
      : `rgba(160, 190, 240, ${a * 0.7})`
    ctx.lineWidth = Math.max(0.6, 1.5 * (1 - depth))
    ctx.beginPath()
    ctx.moveTo(s.x, s.y)
    ctx.lineTo(s.x + s.len * (1 - depth * 0.5), s.y)
    ctx.stroke()
  }

  // 彗星在湖中的倒影
  if (comet.active && comet.y < HORIZON()) {
    const cw = 12
    const slices = 10
    for (let i = 0; i < slices; i++) {
      const yy = y0 + ((H - y0) * 0.45 * (i + 1)) / slices
      const hh = ((H - y0) * 0.45) / slices + 1
      const vFade = 1 - i / slices
      const wob = Math.sin(frame / 12 + i) * 5
      const g = ctx.createLinearGradient(comet.x - cw + wob, 0, comet.x + cw + wob, 0)
      g.addColorStop(0, 'rgba(150, 235, 220, 0)')
      g.addColorStop(0.5, `rgba(150, 235, 220, ${0.18 * vFade})`)
      g.addColorStop(1, 'rgba(150, 235, 220, 0)')
      ctx.fillStyle = g
      ctx.fillRect(comet.x - cw + wob, yy, cw * 2, hh)
    }
  }
  ctx.restore()
}

function spawnFlock() {
  const fromLeft = Math.random() > 0.5
  const n = 3 + Math.floor(Math.random() * 3)
  flock = {
    x: fromLeft ? -60 : W + 60,
    y: rand(H * 0.3, H * 0.48),
    vx: (fromLeft ? 1 : -1) * rand(0.7, 1.1),
    birds: Array.from({ length: n }, (_, i) => ({
      dx: -i * rand(18, 30) * (fromLeft ? 1 : -1),
      dy: rand(-14, 14) + i * rand(2, 8),
      size: rand(5, 8),
      phase: rand(0, Math.PI * 2),
    })),
    next: null,
  }
}

function drawFlock(t) {
  if (!flock) {
    flock = { next: Math.floor(rand(300, 700)) }
    return
  }
  if (!flock.birds) {
    flock.next -= 1
    if (flock.next <= 0) spawnFlock()
    return
  }
  flock.x += flock.vx
  ctx.strokeStyle = 'rgba(16, 22, 46, 0.7)'
  ctx.lineCap = 'round'
  for (const b of flock.birds) {
    const x = flock.x + b.dx
    const y = flock.y + b.dy
    const flap = Math.sin(t / 130 + b.phase) * b.size * 0.7
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.moveTo(x - b.size, y - flap)
    ctx.quadraticCurveTo(x - b.size * 0.4, y, x, y)
    ctx.quadraticCurveTo(x + b.size * 0.4, y, x + b.size, y - flap)
    ctx.stroke()
  }
  if (flock.x < -120 || flock.x > W + 120) flock = { next: Math.floor(rand(600, 1200)) }
}

/* ================= 胶片颗粒 / 暗角 ================= */

function buildGrain() {
  const s = 160
  grainCanvas = document.createElement('canvas')
  grainCanvas.width = s
  grainCanvas.height = s
  const g = grainCanvas.getContext('2d')
  const id = g.createImageData(s, s)
  for (let i = 0; i < id.data.length; i += 4) {
    const v = rand(105, 150)
    id.data[i] = v
    id.data[i + 1] = v
    id.data[i + 2] = v
    id.data[i + 3] = 255
  }
  g.putImageData(id, 0, 0)
  ctx.globalCompositeOperation = 'overlay'
  grainBlend = ctx.globalCompositeOperation === 'overlay' ? 'overlay' : 'soft-light'
}

function drawGrain() {
  if (!grainPattern) grainPattern = ctx.createPattern(grainCanvas, 'repeat')
  if (frame % 5 === 0) grainOffset = [Math.floor(rand(0, 160)), Math.floor(rand(0, 160))]
  ctx.save()
  ctx.globalAlpha = grainBlend === 'overlay' ? 0.05 : 0.08
  ctx.globalCompositeOperation = grainBlend
  ctx.translate(-grainOffset[0], -grainOffset[1])
  ctx.fillStyle = grainPattern
  ctx.fillRect(0, 0, W + 160, H + 160)
  ctx.restore()
}

function drawVignette() {
  const g = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.3, W / 2, H * 0.5, Math.max(W, H) * 0.82)
  g.addColorStop(0, 'rgba(6, 10, 30, 0)')
  g.addColorStop(1, 'rgba(6, 10, 30, 0.4)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
}

/* ================= 场景合成 ================= */

// 以覆盖方式绘制背景
function drawCover(img) {
  const s = Math.max(W / img.width, H / img.height)
  const dw = img.width * s
  const dh = img.height * s
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh)
}

function drawFallback() {
  // 图层加载中的底色
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#0a102e')
  g.addColorStop(0.5, '#1d3566')
  g.addColorStop(0.8, '#d98a5e')
  g.addColorStop(1, '#f7bd7d')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
}

function drawScene(t) {
  if (IMGS.crater) {
    drawCover(IMGS.crater)
    return
  }
  if (IMGS.back) drawCover(IMGS.back)
  else drawFallback()

  // 对岸山脊：环形山的远侧
  if (IMGS.mountains) {
    const img = IMGS.mountains
    const drawW = W * 1.12
    const s = drawW / img.width
    const drawH = img.height * s
    ctx.drawImage(img, -W * 0.06, H * 0.49 - drawH * 0.95, drawW, drawH)
  }
}

// 湖面内容（需在椭圆裁剪内调用）
function drawLake() {
  if (IMGS.water && !IMGS.crater) {
    const img = IMGS.water
    const { cx, cy, rx, ry } = LAKE()
    ctx.drawImage(img, cx - rx, cy - ry, rx * 2, ry * 2)
  }
  drawGlitter()
  drawWaterShimmer()
}

/* ================= 主循环 ================= */

function tick(t) {
  if (!running) return
  frame++

  drawScene(t)

  // 湖面（裁剪进椭圆）→ 环形山环带（两侧 + 脚下）
  ctx.save()
  lakeEllipse()
  ctx.clip()
  drawLake()
  ctx.restore()
  if (!IMGS.crater) drawRim()

  drawComet()
  drawFlock(t)

  // 光粒
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const p of particles) {
    p.phase += p.twinkle
    p.x += p.vx + Math.sin(p.phase * 2) * 0.1
    p.y += p.vy
    if (p.y < -12 || p.x < -12 || p.x > W + 12) Object.assign(p, makeParticle(false))
    const tw = 0.25 + Math.abs(Math.sin(p.phase)) * 0.6
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3)
    g.addColorStop(0, `rgba(190, 215, 255, ${0.55 * tw})`)
    g.addColorStop(1, 'rgba(190, 215, 255, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  drawGrain()
  drawVignette()

  raf = requestAnimationFrame(tick)
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  W = canvas.value.clientWidth
  H = canvas.value.clientHeight
  canvas.value.width = W * dpr
  canvas.value.height = H * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  buildShimmers()
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

onMounted(async () => {
  ctx = canvas.value.getContext('2d')
  buildGrain()
  resize()
  window.addEventListener('resize', resize)
  document.addEventListener('visibilitychange', onVisibility)

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  particles = Array.from({ length: reduceMotion ? 0 : 24 }, () => makeParticle())

  await loadImages()
  buildShimmers()

  if (reduceMotion) {
    drawScene(0)
    ctx.save()
    lakeEllipse()
    ctx.clip()
    drawLake()
    ctx.restore()
    if (!IMGS.crater) drawRim()
    drawVignette()
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
