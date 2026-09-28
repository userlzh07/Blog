// 天空烘焙器 —— 离线生成新海诚风格分层场景图（纯 JS 软件光栅化，零依赖）
// 用法：node tools/bake-sky.mjs [back|clouds-mid|clouds-low|mountains|water|all]
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sky')
mkdirSync(OUT, { recursive: true })

const SEED = 20260926

/* ---------------- 随机与噪声 ---------------- */

function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 基于置换表的价值噪声（快）
function makeNoise(seed) {
  const rng = mulberry32(seed)
  const perm = Array.from({ length: 256 }, (_, i) => i)
  for (let i = 255; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0
    ;[perm[i], perm[j]] = [perm[j], perm[i]]
  }
  const p = new Uint8Array(512)
  const g = new Float32Array(256)
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255]
  for (let i = 0; i < 256; i++) g[i] = perm[i] / 255
  return function n2(x, y) {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = x - xi
    const yf = y - yi
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10)
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10)
    const X = xi & 255
    const Y = yi & 255
    const a = g[p[X + Y]]
    const b = g[p[X + 1 + Y]]
    const c = g[p[X + Y + 1]]
    const d = g[p[X + 1 + Y + 1]]
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
  }
}

// 分形噪声：逐 octave 旋转，消除轴向感
function makeFbm(n2, oct = 5, gain = 0.5, lac = 2) {
  const c = Math.cos(0.7)
  const s = Math.sin(0.7)
  return function fbm(x, y) {
    let sum = 0
    let amp = 0.5
    let tot = 0
    let px = x
    let py = y
    for (let i = 0; i < oct; i++) {
      sum += amp * n2(px, py)
      tot += amp
      amp *= gain
      const rx = (px * c - py * s) * lac
      const ry = (px * s + py * c) * lac
      px = rx
      py = ry
    }
    return sum / tot
  }
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
}
// 平滑最大值：puff 融合无棱
const smax = (a, b, k) => {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1)
  return lerp(a, b, h) + k * h * (1 - h)
}
const lerp = (a, b, t) => a + (b - a) * t
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]

/* ---------------- 图像缓冲 ---------------- */

class Img {
  constructor(w, h) {
    this.w = w
    this.h = h
    this.d = new Float32Array(w * h * 4) // 浮点线性空间，输出时转 8bit
  }
  // 前景色按 alpha 混合到已有像素上
  blend(x, y, r, g, b, a) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return
    const i = (y * this.w + x) * 4
    const d = this.d
    d[i] = r * a + d[i] * (1 - a)
    d[i + 1] = g * a + d[i + 1] * (1 - a)
    d[i + 2] = b * a + d[i + 2] * (1 - a)
    d[i + 3] = a + d[i + 3] * (1 - a)
  }
  set(x, y, r, g, b, a) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return
    const i = (y * this.w + x) * 4
    this.d[i] = r
    this.d[i + 1] = g
    this.d[i + 2] = b
    this.d[i + 3] = a
  }
  to8bit() {
    const out = new Uint8ClampedArray(this.w * this.h * 4)
    for (let i = 0; i < out.length; i++) out[i] = clamp(this.d[i], 0, 1) * 255
    return out
  }
}

// 超采样渲染 → 盒式降采样
function renderSupersampled(w, h, ss, painter) {
  const big = new Img(w * ss, h * ss)
  painter(big)
  if (ss === 1) return big
  const out = new Img(w, h)
  const area = ss * ss
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const i = ((y * ss + sy) * big.w + x * ss + sx) * 4
          r += big.d[i]; g += big.d[i + 1]; b += big.d[i + 2]; a += big.d[i + 3]
        }
      }
      const o = (y * w + x) * 4
      out.d[o] = r / area; out.d[o + 1] = g / area; out.d[o + 2] = b / area; out.d[o + 3] = a / area
    }
  }
  return out
}

// 可分离盒式模糊（多次叠加近似高斯）
function blur(img, radius, passes = 2) {
  const { w, h, d } = img
  const tmp = new Float32Array(Math.max(w, h) * 4)
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      const row = y * w * 4
      let r = 0, g = 0, b = 0, a = 0
      for (let x = -radius; x <= radius; x++) {
        const i = row + clamp(x, 0, w - 1) * 4
        r += d[i]; g += d[i + 1]; b += d[i + 2]; a += d[i + 3]
      }
      const n = radius * 2 + 1
      for (let x = 0; x < w; x++) {
        tmp[x * 4] = r / n; tmp[x * 4 + 1] = g / n; tmp[x * 4 + 2] = b / n; tmp[x * 4 + 3] = a / n
        const ia = row + clamp(x - radius, 0, w - 1) * 4
        const ib = row + clamp(x + radius + 1, 0, w - 1) * 4
        r += d[ib] - d[ia]; g += d[ib + 1] - d[ia + 1]; b += d[ib + 2] - d[ia + 2]; a += d[ib + 3] - d[ia + 3]
      }
      for (let x = 0; x < w; x++) {
        const i = row + x * 4
        d[i] = tmp[x * 4]; d[i + 1] = tmp[x * 4 + 1]; d[i + 2] = tmp[x * 4 + 2]; d[i + 3] = tmp[x * 4 + 3]
      }
    }
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let y = -radius; y <= radius; y++) {
        const i = (clamp(y, 0, h - 1) * w + x) * 4
        r += d[i]; g += d[i + 1]; b += d[i + 2]; a += d[i + 3]
      }
      const n = radius * 2 + 1
      for (let y = 0; y < h; y++) {
        tmp[y * 4] = r / n; tmp[y * 4 + 1] = g / n; tmp[y * 4 + 2] = b / n; tmp[y * 4 + 3] = a / n
        const ia = (clamp(y - radius, 0, h - 1) * w + x) * 4
        const ib = (clamp(y + radius + 1, 0, h - 1) * w + x) * 4
        r += d[ib] - d[ia]; g += d[ib + 1] - d[ia + 1]; b += d[ib + 2] - d[ia + 2]; a += d[ib + 3] - d[ia + 3]
      }
      for (let y = 0; y < h; y++) {
        const i = (y * w + x) * 4
        d[i] = tmp[y * 4]; d[i + 1] = tmp[y * 4 + 1]; d[i + 2] = tmp[y * 4 + 2]; d[i + 3] = tmp[y * 4 + 3]
      }
    }
  }
  return img
}

/* ---------------- PNG 编码器 ---------------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function savePNG(img, filename) {
  const { w, h } = img
  const rgba = img.to8bit()
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0
    Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
  const path = join(OUT, filename)
  writeFileSync(path, png)
  console.log(`✓ ${filename}  ${(png.length / 1024 / 1024).toFixed(2)} MB  ${w}×${h}`)
}

/* ---------------- 调色板 ---------------- */

const SKY = {
  stops: [
    [0.0, [0.07, 0.1, 0.26]], // 暮蓝（黄昏将尽）
    [0.22, [0.12, 0.19, 0.4]],
    [0.42, [0.2, 0.3, 0.52]],
    [0.6, [0.3, 0.42, 0.62]],
    [0.74, [0.45, 0.5, 0.66]], // 灰蓝
    [0.85, [0.75, 0.55, 0.58]], // 玫瑰灰过渡（窄）
    [0.93, [0.92, 0.6, 0.4]], // 落日橘
    [1.0, [1.0, 0.78, 0.52]], // 地平线暖金
  ],
}
const CLOUD = {
  lit: [0.76, 0.81, 0.94],
  mid: [0.4, 0.47, 0.69],
  shadow: [0.14, 0.19, 0.38],
  core: [0.075, 0.1, 0.24],
  rimWarm: [1.0, 0.83, 0.6],
  rimCool: [0.84, 0.88, 0.98],
}
const hex = (h) => [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255]

/* ---------------- 天空层（渐变 + 星 + 银河 + 高空卷云） ---------------- */

function paintBack(img) {
  const { w, h } = img
  const n2 = makeNoise(SEED)
  const fbm = makeFbm(n2, 4)
  const rng = mulberry32(SEED + 1)
  const stops = SKY.stops
  const mwy = (x) => 0.03 + 0.4 * (x / w)
  const mwFbm = makeFbm(makeNoise(SEED + 77), 3)

  for (let y = 0; y < h; y++) {
    const t = y / (h - 1)
    let c = stops[stops.length - 1][1]
    for (let s = 0; s < stops.length - 1; s++) {
      const [t0, c0] = stops[s]
      const [t1, c1] = stops[s + 1]
      if (t >= t0 && t <= t1) {
        c = mix3(c0, c1, smooth(t0, t1, t))
        break
      }
    }
    const glowKRow = Math.max(0, (t - 0.55) / 0.45)
    for (let x = 0; x < w; x++) {
      let [r, g, b] = c
      const hx = Math.abs(x / w - 0.5) * 2
      const glowK = Math.max(0, 1 - hx * 1.5) * glowKRow
      if (glowK > 0) {
        r = lerp(r, 0.98, glowK * 0.45)
        g = lerp(g, 0.74, glowK * 0.38)
        b = lerp(b, 0.52, glowK * 0.32)
      }
      img.set(x, y, r, g, b, 1)
    }
  }

  // 银河微光带
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const band = Math.exp(-(((y - mwy(x)) / (h * 0.05)) ** 2))
      if (band < 0.03) continue
      const neb = fbm(x / w * 3, y / h * 3)
      const a = band * 0.08 * (0.35 + neb)
      const i = (y * w + x) * 4
      const d = img.d
      d[i] = lerp(d[i], 0.56, a)
      d[i + 1] = lerp(d[i + 1], 0.63, a)
      d[i + 2] = lerp(d[i + 2], 0.88, a * 1.15)
    }
  }
  // 银河星尘
  for (let i = 0; i < 5200; i++) {
    const t = rng()
    const x = Math.floor((0.02 + 0.8 * t + (rng() + rng() + rng() - 1.5) * 0.05) * w)
    const y = Math.floor((mwy(t * w) + (rng() + rng() + rng() - 1.5) * 0.05 * h))
    if (x < 0 || y < 0 || x >= w || y >= h) continue
    img.blend(x, y, 0.82, 0.88, 1, rng() * rng() * 0.8)
  }

  // 普通星星（黄昏将尽，星星稀疏淡出）
  for (let i = 0; i < 1400; i++) {
    const y = Math.floor(rng() ** 1.6 * h * 0.55)
    const x = Math.floor(rng() * w)
    const bright = rng() ** 3
    const a = 0.08 + bright * 0.6
    img.blend(x, y, 0.85, 0.9, 1, a)
    if (bright > 0.5) img.blend(x + 1, y, 0.85, 0.9, 1, a * 0.5)
    if (bright > 0.86) {
      for (let k = 1; k <= 3; k++) {
        const fa = a * (0.45 - k * 0.11)
        img.blend(x - k, y, 0.85, 0.9, 1, fa)
        img.blend(x + k, y, 0.85, 0.9, 1, fa)
        img.blend(x, y - k, 0.85, 0.9, 1, fa)
        img.blend(x, y + k, 0.85, 0.9, 1, fa)
      }
    }
  }

  // 高空卷云：纤细斜向光带
  for (let s = 0; s < 10; s++) {
    const cx = rng() * w
    const cy = h * (0.05 + rng() * 0.3)
    const len = w * (0.2 + rng() * 0.42)
    const tilt = (rng() - 0.5) * 0.12
    const thick = h * (0.005 + rng() * 0.011)
    const a0 = 0.05 + rng() * 0.1
    const x0 = Math.max(0, Math.floor(cx - len / 2))
    const x1 = Math.min(w - 1, Math.ceil(cx + len / 2))
    const y0 = Math.max(0, Math.floor(cy - thick * 3))
    const y1 = Math.min(h - 1, Math.ceil(cy + thick * 3))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const u = (x - cx) / (len / 2)
        const yy = cy + u * len * tilt
        const a = Math.exp(-(((y - yy) / thick) ** 2)) * Math.max(0, 1 - u * u) * a0
        if (a > 0.004) img.blend(x, y, 0.7, 0.77, 0.96, a)
      }
    }
  }
}

/* ---------------- 山脊线（群山层与水面倒影共用） ---------------- */

function makeRidges(w, h) {
  const defs = [
    { base: 0.35, amp: 0.13, freq: 2.2, col: hex(0x707aa8), haze: 0.5 },
    { base: 0.53, amp: 0.16, freq: 1.7, col: hex(0x505c94), haze: 0.68 },
    { base: 0.74, amp: 0.18, freq: 1.4, col: hex(0x2c3a72), haze: 0.9 },
    { base: 0.95, amp: 0.14, freq: 2.0, col: hex(0x18224e), haze: 1 },
  ]
  return defs.map((d, di) => {
    const f = makeFbm(makeNoise(SEED + 300 + di), 4)
    const ys = new Float32Array(w)
    for (let x = 0; x < w; x++) {
      const u = x / w
      const edge = Math.abs(u - 0.5) * 2
      const bowl = smooth(0.15, 1, edge) * (0.08 - di * 0.012)
      ys[x] = (d.base - f(u * d.freq, di * 7.3) * d.amp * 2.4 - f(u * d.freq * 3.1, di * 3.1) * d.amp * 1.0 - bowl) * h
    }
    return { ...d, ys }
  })
}

/* ================= 动漫积云绘制器（puff 溅射成形） =================
 * 每朵云由几十个大小递变的圆团（puff）堆叠成塔状，
 * 密度场 → 法线推导演色：赛璐璐分带 + 轮廓光，边缘干净柔和。
 */

function paintCloudPuffs(img, opts) {
  const { w, h } = img
  const {
    seed,
    clusters,
    lit = [0.78, 0.83, 0.95],
    mid = [0.5, 0.57, 0.78],
    shadow = [0.26, 0.31, 0.54],
    core = [0.15, 0.18, 0.38],
    rimWarm = [1.0, 0.84, 0.62],
    rimCool = [0.87, 0.9, 0.99],
    lightFromTop = true, // 顶部受天光 / false = 底部被落日点亮
    warmBelow = 0,
    bandMix = 0.35, // 赛璐璐分带强度（越小越柔和）
  } = opts

  const rng = mulberry32(seed)
  const field = new Float32Array(w * h)

  // ---- 第一趟：把 puff 溅射进密度场（x 方向环绕保证无缝平铺） ----
  for (const c of clusters) {
    const cx = c.cx * w
    const baseY = c.cy * h
    const towerH = c.ry * h * 2
    const spread = c.rx * w
    const nPuffs = Math.floor(30 + c.size * 40)
    for (let i = 0; i < nPuffs; i++) {
      const t = rng() // 0=云底 1=云顶
      const sigma = spread * (0.34 + 0.72 * (1 - t) ** 1.3)
      const gx = (rng() + rng() + rng() - 1.5) * sigma
      const x = cx + gx
      const y = baseY - t * towerH + (rng() - 0.5) * towerH * 0.1
      const baseR = towerH * 0.28
      const topR = towerH * 0.13
      const r = (baseR + (topR - baseR) * t) * (0.72 + rng() * 0.55)
      if (r < 2) continue
      const R = Math.ceil(r * 1.1)
      for (let wy = Math.floor(y) - R; wy <= Math.floor(y) + R; wy++) {
        if (wy < 0 || wy >= h) continue
        for (let wx = Math.floor(x) - R; wx <= Math.floor(x) + R; wx++) {
          const xx = ((wx % w) + w) % w // 环绕
          const dx = wx - x
          const dy = wy - y
          const d2 = Math.sqrt(dx * dx + dy * dy) / r
          if (d2 >= 1.05) continue
          const v = 1 - smooth(0.5, 1.0, d2)
          field[wy * w + xx] = smax(field[wy * w + xx], v, 0.85)
        }
      }
    }
  }

  // ---- 1.5 趟：把密度场做一次盒式模糊，内部起伏被抹平，只保留整体剪影 ----
  const fb = new Float32Array(w * h)
  {
    const R = 9
    const tmp = new Float32Array(Math.max(w, h))
    const n = R * 2 + 1
    // 横向
    for (let y = 0; y < h; y++) {
      let s = 0
      for (let x = -R; x <= R; x++) s += field[y * w + clamp(x, 0, w - 1)]
      for (let x = 0; x < w; x++) {
        tmp[x] = s / n
        s += field[y * w + clamp(x + R + 1, 0, w - 1)] - field[y * w + clamp(x - R, 0, w - 1)]
      }
      for (let x = 0; x < w; x++) fb[y * w + x] = tmp[x]
    }
    // 纵向
    for (let x = 0; x < w; x++) {
      let s = 0
      for (let y = -R; y <= R; y++) s += fb[clamp(y, 0, h - 1) * w + x]
      for (let y = 0; y < h; y++) {
        tmp[y] = s / n
        s += fb[clamp(y + R + 1, 0, h - 1) * w + x] - fb[clamp(y - R, 0, h - 1) * w + x]
      }
      for (let y = 0; y < h; y++) fb[y * w + x] = tmp[y]
    }
  }

  // ---- 第二趟：着色（法线与轮廓光都基于模糊场，内部不留 puff 痕迹） ----
  const ly = lightFromTop ? 1 : -1
  for (let y = 0; y < h; y++) {
    const ny = y / h
    for (let x = 0; x < w; x++) {
      const i4 = y * w + x
      const f = fb[i4]
      if (f <= 0.03) continue
      const gx = fb[y * w + Math.max(0, x - 1)] - fb[y * w + Math.min(w - 1, x + 1)]
      const gy = fb[Math.max(0, y - 1) * w + x] - fb[Math.min(h - 1, y + 1) * w + x]
      let nxv = -gx
      let nyv = -gy
      const gl = Math.hypot(nxv, nyv) + 1e-6
      nxv /= gl
      nyv /= gl
    // 顶部受天光，底部被地平线暮光染暖
    const topLight = Math.max(0, nyv) * (1 - ny * 0.4)
    const bottomGlow = Math.max(0, -nyv) * smooth(0.25, 0.85, ny)
    let t = clamp(0.34 + topLight * 0.62 + bottomGlow * 0.42, 0, 1)
    // 赛璐璐分带（柔和版）
    const q1 = smooth(0.3, 0.45, t)
    const q2 = smooth(0.58, 0.75, t)
    const banded = 0.13 + 0.4 * q1 + 0.43 * q2
    t = lerp(banded, t, 1 - bandMix)

      let col = t < 0.5 ? mix3(shadow, mid, t * 2) : mix3(mid, lit, (t - 0.5) * 2)
      if (t < 0.2) col = mix3(core, col, t / 0.2)

      // 轮廓光：剪影边缘的受光侧
      const edge = smooth(0.015, 0.1, gl) * 4 * clamp(f, 0, 1) * (1 - clamp(f, 0, 1))
      const warmAmt = edge * (lightFromTop ? bottomGlow * 1.4 : clamp(nyv * -ly, 0, 1))
      if (warmAmt > 0.01) col = mix3(col, rimWarm, Math.min(warmAmt, 1) * 0.75)
      const coolAmt = edge * (lightFromTop ? topLight : 0.15)
      if (coolAmt > 0.01) col = mix3(col, rimCool, coolAmt * 0.4)

      // 底部暖色洗染
      if (warmBelow > 0) {
        col = mix3(col, rimWarm, warmBelow * smooth(0.4, 1, ny) * 0.3)
      }

      const a = smooth(0.08, 0.3, f)
      const i = i4 * 4
      img.d[i] = col[0]
      img.d[i + 1] = col[1]
      img.d[i + 2] = col[2]
      img.d[i + 3] = a
    }
  }
}

// 远景小积云：数量多、体积小，散布整条天空带
function midClusters(rng) {
  const cs = []
  const n = 6
  for (let i = 0; i < n; i++) {
    cs.push({
      cx: (i + rng()) / n,
      cy: 0.28 + rng() * 0.5,
      rx: 0.05 + rng() * 0.04,
      ry: 0.1 + rng() * 0.08,
      size: 0.28 + rng() * 0.3,
    })
  }
  return cs
}

// 低空云海团簇：扁而宽
function lowClusters(rng) {
  const cs = []
  const n = 5
  for (let i = 0; i < n; i++) {
    cs.push({
      cx: (i + rng()) / n,
      cy: 0.55 + rng() * 0.2,
      rx: 0.16 + rng() * 0.08,
      ry: 0.13 + rng() * 0.08,
      size: 1.4 + rng() * 1.0,
    })
  }
  return cs
}

function bakeCloudsMid() {
  const w = 2800
  const h = 1200
  const rng = mulberry32(SEED + 500)
  const img = renderSupersampled(w, h, 2, (big) =>
    paintCloudPuffs(big, {
      seed: SEED + 500,
      clusters: midClusters(rng),
      lit: [0.95, 0.86, 0.76], // 黄昏将尽：云被染成暖黄
      mid: [0.58, 0.52, 0.76], // 高饱和蓝紫中间调
      shadow: [0.28, 0.28, 0.56],
      core: [0.16, 0.17, 0.38],
      bandMix: 0.22,
      warmBelow: 0.5,
    }),
  )
  savePNG(img, 'clouds-mid.png')
}

function bakeCloudsLow() {
  const w = 2800
  const h = 620
  const rng = mulberry32(SEED + 900)
  const img = renderSupersampled(w, h, 2, (big) =>
    paintCloudPuffs(big, {
      seed: SEED + 900,
      clusters: lowClusters(rng),
      lit: [0.95, 0.76, 0.55], // 被落日染成橘金的受光面
      mid: [0.55, 0.45, 0.55],
      shadow: [0.24, 0.22, 0.4],
      core: [0.11, 0.11, 0.26],
      lightFromTop: false, // 底部受光
      warmBelow: 1,
      bandMix: 0.2,
    }),
  )
  savePNG(img, 'clouds-low.png')
}

/* ---------------- 群山层 ---------------- */

function bakeMountains() {
  const w = 3200
  const h = 480
  const img = new Img(w, h)
  const ridges = makeRidges(w, h)
  const rng = mulberry32(SEED + 700)

  for (let ri = 0; ri < ridges.length; ri++) {
    const r = ridges[ri]
    const nTex = makeFbm(makeNoise(SEED + 400 + ri), 4) // 细纹理
    const nPatch = makeFbm(makeNoise(SEED + 450 + ri), 3) // 大块植被/岩壁色斑
    for (let x = 0; x < w; x++) {
      const yTop = Math.max(0, Math.floor(r.ys[x]))
      // 坡向明暗：朝光源（右下）的坡面亮，背光坡面沉入阴影 → 体积感
      const slope = x > 0 && x < w - 1 ? (r.ys[x - 1] - r.ys[x + 1]) / 2 : 0
      const lightK = 1 + clamp(slope * 0.06, -0.38, 0.45)
      for (let y = yTop; y < h; y++) {
        const depthK = 1 - ((y - yTop) / (h - yTop)) * 0.28
        const tex = 0.9 + 0.16 * nTex(x / w * 8 + ri * 3, y / h * 8) + 0.14 * nPatch(x / w * 3, y / h * 3)
        img.blend(
          x, y,
          r.col[0] * depthK * tex * lightK,
          r.col[1] * depthK * tex * lightK,
          r.col[2] * depthK * Math.min(tex, 1.05),
          r.haze,
        )
      }
    }

    // 山谷间流动的暮霭（罩在更远的山层之上，营造纵深）
    if (ri < ridges.length - 1) {
      const mistH = h * 0.1
      for (let x = 0; x < w; x++) {
        const yTop = Math.max(0, Math.floor(r.ys[x]))
        for (let y = yTop; y < Math.min(h, yTop + mistH); y++) {
          const a = (1 - (y - yTop) / mistH) * 0.14 * r.haze
          img.blend(x, y, 0.74, 0.72, 0.88, a)
        }
      }
    }
    // 山脊线朝光源的轮廓光（落日金边）
    if (ri >= 0) {
      for (let x = 1; x < w - 1; x++) {
        const slope = r.ys[x - 1] - r.ys[x + 1] // 向右下降为正
        const facing = clamp(slope * 0.06, 0, 1)
        const yTop = Math.floor(r.ys[x])
        const glowA = (0.2 + facing * 0.55) * r.haze
        for (let k = 0; k < 2; k++) {
          img.blend(x, yTop + k, 0.95, 0.68, 0.45, glowA * (1 - k * 0.5))
        }
      }
    }
  }

  // 山脚小镇灯火：成簇的暖光点 + 微光晕
  const near = ridges[ridges.length - 1]
  const towns = 7
  for (let t = 0; t < towns; t++) {
    const tx = Math.floor(rng() * w)
    const baseY = Math.floor(near.ys[tx]) + 4 + Math.floor(rng() * 26)
    const nLights = 6 + Math.floor(rng() * 14)
    for (let i = 0; i < nLights; i++) {
      const lx = tx + Math.floor((rng() - 0.5) * 90)
      const ly2 = baseY + Math.floor((rng() - 0.5) * 14)
      const warm = rng() > 0.12
      const [lr, lg, lb] = warm ? [1, 0.82, 0.55] : [0.65, 0.8, 1]
      const a = 0.5 + rng() * 0.5
      img.blend(lx, ly2, lr, lg, lb, a)
      img.blend(lx - 1, ly2, lr, lg, lb, a * 0.3)
      img.blend(lx + 1, ly2, lr, lg, lb, a * 0.3)
      img.blend(lx, ly2 - 1, lr, lg, lb, a * 0.3)
      img.blend(lx, ly2 + 1, lr, lg, lb, a * 0.3)
    }
  }
  savePNG(img, 'mountains.png')
}

/* ---------------- 水面层 ---------------- */

function bakeWater() {
  const w = 1920
  const h = 340
  const img = new Img(w, h)
  const ridges = makeRidges(w, 480)
  const rng = mulberry32(SEED + 800)

  // 湖水基底：顶部一线暖金，向下沉入湖蓝
  const stops = [
    [0, [0.98, 0.72, 0.45]],
    [0.1, [0.75, 0.55, 0.5]],
    [0.28, [0.38, 0.42, 0.6]],
    [0.6, [0.16, 0.2, 0.4]],
    [1, [0.08, 0.1, 0.26]],
  ]
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1)
    let c = stops[stops.length - 1][1]
    for (let s = 0; s < stops.length - 1; s++) {
      if (t >= stops[s][0] && t <= stops[s + 1][0]) {
        c = mix3(stops[s][1], stops[s + 1][1], smooth(stops[s][0], stops[s + 1][0], t))
        break
      }
    }
    for (let x = 0; x < w; x++) {
      let [r, g, b] = c
      // 中央落日倒影光柱（烘焙底光，运行时再加动态波光）
      const hx = Math.abs(x / w - 0.5) * 2
      const beam = Math.max(0, 1 - hx * 1.8) * (1 - t) ** 1.3
      if (beam > 0) {
        r = lerp(r, 1, beam * 0.5)
        g = lerp(g, 0.8, beam * 0.4)
        b = lerp(b, 0.55, beam * 0.3)
      }
      img.set(x, y, r, g, b, 1)
    }
  }

  // 群山倒影（只取近山，顶部留出明亮的湖平线）
  const refl = new Img(w, h)
  for (let ri = 2; ri < ridges.length; ri++) {
    const r = ridges[ri]
    for (let x = 0; x < w; x++) {
      const hTop = 480 - r.ys[x] // 山高
      const rh = Math.min(h * 0.6, hTop * 0.55)
      for (let y = 8; y < rh; y++) {
        const fade = (1 - y / rh) * 0.55
        refl.blend(x, y, r.col[0], r.col[1], r.col[2], fade)
      }
    }
  }
  blur(refl, 3, 2)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      img.blend(x, y, refl.d[i], refl.d[i + 1], refl.d[i + 2], refl.d[i + 3])
    }
  }

  // 云影：几道横向的柔和亮暗带
  const f = makeFbm(makeNoise(SEED + 810), 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = f(x / w * 6, y / h * 14)
      const a = (v - 0.5) * 0.16 * (1 - y / h)
      if (a > 0) img.blend(x, y, 0.75, 0.8, 0.95, a)
      else img.blend(x, y, 0.05, 0.08, 0.2, -a)
    }
  }

  // 云的倒影：顶部几道柔和的亮斑
  for (let i = 0; i < 7; i++) {
    const bx = rng() * w
    const by = 8 + rng() * h * 0.3
    const br = 30 + rng() * 90
    const warm = rng() > 0.4
    const [cr, cg, cb] = warm ? [0.95, 0.75, 0.55] : [0.6, 0.68, 0.9]
    for (let y = Math.floor(by - br * 0.4); y < by + br * 0.4; y++) {
      for (let x = Math.floor(bx - br); x < bx + br; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue
        const dd = Math.sqrt(((x - bx) / br) ** 2 + ((y - by) / (br * 0.4)) ** 2)
        const a = Math.max(0, 1 - dd) * 0.14 * (1 - y / h)
        img.blend(x, y, cr, cg, cb, a)
      }
    }
  }

  // 静态波光（近地平线处细密，远处粗疏）
  for (let i = 0; i < 1800; i++) {
    const depth = rng() ** 1.8
    const y = Math.floor(depth * (h - 4)) + 2
    const x = Math.floor(rng() * w)
    const len = 4 + rng() * 26 * (0.4 + depth)
    const warm = depth < 0.35
    const a = 0.06 + rng() * 0.16
    const [sr, sg, sb] = warm ? [1, 0.83, 0.55] : [0.62, 0.72, 0.95]
    for (let k = 0; k < len; k++) {
      img.blend(x + k, y, sr, sg, sb, a * (1 - k / len))
    }
  }
  savePNG(img, 'water.png')
}

/* ---------------- 主入口 ---------------- */

const which = process.argv[2] || 'all'
const t0 = Date.now()

if (which === 'back' || which === 'all') {
  savePNG(renderSupersampled(1920, 1080, 2, paintBack), 'back.png')
}
if (which === 'clouds-mid' || which === 'all') bakeCloudsMid()
if (which === 'clouds-low' || which === 'all') bakeCloudsLow()
if (which === 'mountains' || which === 'all') bakeMountains()
if (which === 'water' || which === 'all') bakeWater()

console.log(`完成，耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`)
