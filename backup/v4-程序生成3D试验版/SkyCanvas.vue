<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

const BASE = import.meta.env.BASE_URL
const canvas = ref(null)
const fallbackVisible = ref(true)
const fallbackStyle = { backgroundImage: `url("${BASE}sky/crater-scene.png")` }

// 可按拍摄地修改。默认位置取合肥附近，时间使用设备本地时钟和时区。
const SOLAR_LOCATION = { latitude: 31.82, longitude: 117.23 }
// 每晚本地时间 22:00 掠过一次，后续可按你想要的时间微调。
const COMET_SCHEDULE = { hour: 22, minute: 0, durationSeconds: 12 }

const CRATER = { radiusX: 21, radiusZ: 15, shoreline: 0.59, crest: 1.02 }
const LAKE = { radiusX: 12.1, radiusZ: 8.1, level: 0.16 }

let renderer
let composer
let scene
let camera
let sunLight
let fillLight
let hemisphereLight
let skyDome
let skyMaterial
let sunDisk
let sunGlow
let stars
let cloudSprites = []
let waterMaterial
let cometGroup
let cometLine
let cometPositions
let animationFrame = 0
let lastClockUpdate = 0
let running = false
let elapsedTime = 0
let resizeObserver

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const smoothstep = (min, max, value) => {
  const t = clamp((value - min) / (max - min), 0, 1)
  return t * t * (3 - 2 * t)
}
const lerp = (a, b, t) => a + (b - a) * t
const radians = (degrees) => (degrees * Math.PI) / 180

/* -------------------- terrain -------------------- */

function hash2(x, z) {
  const value = Math.sin(x * 127.1 + z * 311.7 + 74.7) * 43758.5453123
  return value - Math.floor(value)
}

function valueNoise(x, z) {
  const x0 = Math.floor(x)
  const z0 = Math.floor(z)
  const fx = x - x0
  const fz = z - z0
  const u = fx * fx * (3 - 2 * fx)
  const v = fz * fz * (3 - 2 * fz)
  const a = hash2(x0, z0)
  const b = hash2(x0 + 1, z0)
  const c = hash2(x0, z0 + 1)
  const d = hash2(x0 + 1, z0 + 1)
  return lerp(lerp(a, b, u), lerp(c, d, u), v)
}

function fbm(x, z) {
  let total = 0
  let weight = 0.5
  let sum = 0
  for (let octave = 0; octave < 5; octave++) {
    total += valueNoise(x, z) * weight
    sum += weight
    const nextX = (x * 1.91 - z * 0.37) * 2.03
    const nextZ = (x * 0.31 + z * 1.73) * 1.97
    x = nextX
    z = nextZ
    weight *= 0.5
  }
  return total / sum
}

function terrainHeight(x, z) {
  const nx = x / CRATER.radiusX
  const nz = z / CRATER.radiusZ
  const radius = Math.hypot(nx, nz)
  const broad = fbm(x * 0.055 + 20, z * 0.055 - 10) - 0.5
  const detail = fbm(x * 0.28 - 9, z * 0.28 + 11) - 0.5
  const crags = fbm(x * 0.13 + 3, z * 0.13 + 15) - 0.5

  if (radius < CRATER.shoreline - 0.04) {
    return -0.28 + detail * 0.11
  }

  if (radius < CRATER.crest + 0.02) {
    const slope = smoothstep(CRATER.shoreline - 0.04, CRATER.crest, radius)
    const lip = Math.exp(-Math.pow((radius - CRATER.crest) / 0.075, 2))
    return -0.08 + slope * 7.25 + lip * (0.5 + broad * 1.0) + detail * (0.18 + slope * 0.48)
  }

  const falloff = smoothstep(CRATER.crest, 1.42, radius)
  const distantRidge = Math.max(0, fbm(nx * 5 + 3, nz * 5 - 6) - 0.48) * 5.8
  const ridgeVariation = Math.sin(Math.atan2(nz, nx) * 11 + broad * 4) * 0.7
  return 7.65 - falloff * 4.6 + broad * 2.1 + crags * 1.1 + distantRidge + ridgeVariation
}

function terrainColor(height, radius, x, z) {
  const shadow = new THREE.Color('#39445d')
  const lowSlope = new THREE.Color('#59677e')
  const highSlope = new THREE.Color('#8b8996')
  const crest = new THREE.Color('#c79b91')
  const farRock = new THREE.Color('#59677f')
  const color = new THREE.Color()

  if (radius > 1.03) {
    color.copy(farRock).lerp(highSlope, clamp((height - 2.5) / 9, 0, 0.4))
  } else if (height < 3.9) {
    color.copy(shadow).lerp(lowSlope, smoothstep(-0.5, 4.2, height))
  } else {
    color.copy(lowSlope).lerp(highSlope, smoothstep(2.5, 8.4, height))
    color.lerp(crest, smoothstep(7.0, 8.6, height) * 0.42)
  }

  const grain = (fbm(x * 0.42 + 30, z * 0.42 - 17) - 0.5) * 0.15
  const strata = Math.sin(height * 4.3 + fbm(x * 0.15, z * 0.15) * 3) * 0.035
  color.multiplyScalar(1 + grain + strata)
  return color
}

function buildTerrain() {
  const width = 78
  const depth = 64
  const segmentsX = 280
  const segmentsZ = 230
  const vertexCount = (segmentsX + 1) * (segmentsZ + 1)
  const positions = new Float32Array(vertexCount * 3)
  const colors = new Float32Array(vertexCount * 3)
  const indices = []
  let index = 0

  for (let iz = 0; iz <= segmentsZ; iz++) {
    const z = (iz / segmentsZ - 0.5) * depth
    for (let ix = 0; ix <= segmentsX; ix++) {
      const x = (ix / segmentsX - 0.5) * width
      const height = terrainHeight(x, z)
      const radius = Math.hypot(x / CRATER.radiusX, z / CRATER.radiusZ)
      const color = terrainColor(height, radius, x, z)
      const offset = index * 3
      positions[offset] = x
      positions[offset + 1] = height
      positions[offset + 2] = z
      colors[offset] = color.r
      colors[offset + 1] = color.g
      colors[offset + 2] = color.b

      if (ix < segmentsX && iz < segmentsZ) {
        const a = index
        const b = index + 1
        const c = index + segmentsX + 1
        const d = c + 1
        indices.push(a, c, b, b, c, d)
      }
      index++
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0.015,
  })
  const terrain = new THREE.Mesh(geometry, material)
  terrain.receiveShadow = true
  terrain.castShadow = true
  terrain.frustumCulled = false
  scene.add(terrain)

  addTerrainDetails()
  addStrataLines()
}

let detailSeed = 42719
function seededRandom() {
  detailSeed = (detailSeed * 1664525 + 1013904223) >>> 0
  return detailSeed / 4294967296
}

function addTerrainDetails() {
  const treeGeometry = new THREE.ConeGeometry(0.34, 1.35, 5, 1)
  const treeMaterial = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 1,
  })
  const trees = new THREE.InstancedMesh(treeGeometry, treeMaterial, 190)
  trees.castShadow = true
  trees.receiveShadow = true

  const rockGeometry = new THREE.IcosahedronGeometry(1, 1)
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.92,
  })
  const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, 290)
  rocks.castShadow = true
  rocks.receiveShadow = true

  const dummy = new THREE.Object3D()
  const treePalette = ['#607568', '#78816c', '#879076', '#767181', '#a08377']
  const rockPalette = ['#777d8d', '#92909b', '#a79a99', '#69798d', '#b49d91']

  for (let i = 0; i < trees.count; i++) {
    // 植被只落在外缘高地，内壁保持裸露，避免遮住环形山的轮廓。
    const radius = 1.04 + seededRandom() * 0.34
    const angle = seededRandom() * Math.PI * 2
    const x = Math.cos(angle) * CRATER.radiusX * radius
    const z = Math.sin(angle) * CRATER.radiusZ * radius
    const y = terrainHeight(x, z)
    const scale = 0.3 + seededRandom() * 0.38
    dummy.position.set(x, y + scale * 0.66, z)
    dummy.rotation.set(0, seededRandom() * Math.PI * 2, 0)
    dummy.scale.set(scale * (0.7 + seededRandom() * 0.45), scale, scale * (0.7 + seededRandom() * 0.45))
    dummy.updateMatrix()
    trees.setMatrixAt(i, dummy.matrix)
    trees.setColorAt(i, new THREE.Color(treePalette[Math.floor(seededRandom() * treePalette.length)]))
  }

  for (let i = 0; i < rocks.count; i++) {
    const radius = 0.75 + seededRandom() * 0.68
    const angle = seededRandom() * Math.PI * 2
    const x = Math.cos(angle) * CRATER.radiusX * radius
    const z = Math.sin(angle) * CRATER.radiusZ * radius
    const y = terrainHeight(x, z)
    const scale = 0.1 + seededRandom() * (radius > 1.1 ? 0.34 : 0.22)
    dummy.position.set(x, y + scale * 0.3, z)
    dummy.rotation.set(seededRandom() * 0.5, seededRandom() * Math.PI, seededRandom() * 0.5)
    dummy.scale.set(scale * (0.8 + seededRandom() * 0.8), scale * (0.45 + seededRandom() * 0.6), scale)
    dummy.updateMatrix()
    rocks.setMatrixAt(i, dummy.matrix)
    rocks.setColorAt(i, new THREE.Color(rockPalette[Math.floor(seededRandom() * rockPalette.length)]))
  }

  scene.add(trees, rocks)
}

function addStrataLines() {
  const lineMaterial = new THREE.LineBasicMaterial({
    color: '#b6a4ac',
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
  })
  const shadowMaterial = new THREE.LineBasicMaterial({
    color: '#11182f',
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
  })

  for (let ring = 0; ring < 7; ring++) {
    const radius = 0.65 + ring * 0.052
    const points = []
    for (let step = 0; step <= 240; step++) {
      const angle = (step / 240) * Math.PI * 2
      const wobble = (fbm(Math.cos(angle) * 3 + ring * 4, Math.sin(angle) * 3) - 0.5) * 0.035
      const r = radius + wobble
      const x = Math.cos(angle) * CRATER.radiusX * r
      const z = Math.sin(angle) * CRATER.radiusZ * r
      points.push(new THREE.Vector3(x, terrainHeight(x, z) + 0.035, z))
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const line = new THREE.Line(geometry, ring % 2 === 0 ? lineMaterial : shadowMaterial)
    line.renderOrder = 1
    scene.add(line)
  }
}

/* -------------------- water -------------------- */

function createWater() {
  waterMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSunDirection: { value: new THREE.Vector3(0, 0.3, -1) },
      uDaylight: { value: 0.6 },
      uWarmth: { value: 0.5 },
      uSunColor: { value: new THREE.Color('#ffc88f') },
    },
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      void main() {
        vUv = uv;
        vec3 p = position;
        float waveA = sin(p.x * 34.0 + uTime * 0.6) * 0.018;
        float waveB = sin(p.y * 49.0 - uTime * 0.43) * 0.012;
        float waveC = sin((p.x + p.y) * 23.0 + uTime * 0.25) * 0.009;
        p.z += waveA + waveB + waveC;
        vec4 world = modelMatrix * vec4(p, 1.0);
        vWorldPosition = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uSunDirection;
      uniform float uDaylight;
      uniform float uWarmth;
      uniform vec3 uSunColor;
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      void main() {
        vec2 uv = vUv;
        float longWave = sin(uv.x * 58.0 + uv.y * 19.0 + uTime * 0.42);
        float shortWave = sin(uv.x * 126.0 - uv.y * 31.0 - uTime * 0.72);
        float ripple = smoothstep(-0.12, 0.9, longWave * 0.3 + shortWave * 0.12 + 0.18);
        float sunColumn = clamp(0.5 - uSunDirection.z * 0.2, 0.12, 0.88);
        float distort = (longWave * 0.012 + shortWave * 0.004);
        float beam = exp(-abs(uv.x - sunColumn + distort) * 68.0);
        float broken = smoothstep(-0.15, 0.75, longWave + shortWave * 0.3);
        float distanceFade = 0.38 + 0.62 * smoothstep(0.12, 0.9, uv.y);
        float reflection = beam * broken * distanceFade * (0.08 + uDaylight * 0.5);

        vec3 nightWater = vec3(0.025, 0.043, 0.12);
        vec3 dayWater = vec3(0.16, 0.28, 0.43);
        vec3 water = mix(nightWater, dayWater, uDaylight);
        water = mix(water, vec3(0.62, 0.31, 0.28), uWarmth * 0.22);
        water += vec3(0.025, 0.045, 0.075) * ripple * (0.08 + uDaylight * 0.22);
        water += uSunColor * reflection;

        float edge = smoothstep(0.0, 0.12, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
        water = mix(vec3(0.07, 0.075, 0.13), water, edge);
        gl_FragColor = vec4(water, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })

  const geometry = new THREE.CircleGeometry(1, 180)
  const lake = new THREE.Mesh(geometry, waterMaterial)
  lake.rotation.x = -Math.PI / 2
  lake.scale.set(LAKE.radiusX, LAKE.radiusZ, 1)
  lake.position.y = LAKE.level
  lake.receiveShadow = true
  lake.renderOrder = 2
  scene.add(lake)

  const shore = new THREE.Mesh(
    new THREE.RingGeometry(0.985, 1.035, 180),
    new THREE.MeshStandardMaterial({
      color: '#b89583',
      roughness: 0.9,
      metalness: 0,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
    }),
  )
  shore.rotation.x = -Math.PI / 2
  shore.scale.set(LAKE.radiusX, LAKE.radiusZ, 1)
  shore.position.y = LAKE.level + 0.015
  scene.add(shore)
}

/* -------------------- sky and moving clouds -------------------- */

function createSky() {
  skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTopColor: { value: new THREE.Color('#24345f') },
      uHorizonColor: { value: new THREE.Color('#e39172') },
      uSunDirection: { value: new THREE.Vector3(-1, 0.2, 0) },
      uSunColor: { value: new THREE.Color('#ffe3b4') },
      uDaylight: { value: 0.5 },
    },
    vertexShader: `
      varying vec3 vRay;
      void main() {
        vRay = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTopColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uSunDirection;
      uniform vec3 uSunColor;
      uniform float uDaylight;
      varying vec3 vRay;
      void main() {
        vec3 ray = normalize(vRay);
        // 镜头俯看湖盆时，使用抬高后的大气地平线，让天空仍有蓝到暖色的层次。
        float skyHeight = clamp(ray.y + 0.42, 0.0, 1.0);
        float horizon = pow(1.0 - skyHeight, 3.0);
        vec3 color = mix(uTopColor, uHorizonColor, horizon);
        float sunDot = max(dot(ray, normalize(uSunDirection)), 0.0);
        float halo = pow(sunDot, 15.0) * 0.52 + pow(sunDot, 75.0) * 0.75;
        float disk = smoothstep(0.99935, 0.99986, sunDot) * uDaylight;
        color += uSunColor * halo * uDaylight;
        color = mix(color, uSunColor, disk);
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })

  skyDome = new THREE.Mesh(new THREE.SphereGeometry(110, 48, 32), skyMaterial)
  skyDome.frustumCulled = false
  skyDome.renderOrder = -20
  scene.add(skyDome)

  const sunMaterial = new THREE.MeshBasicMaterial({ color: '#fff0cf' })
  sunDisk = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 16), sunMaterial)
  sunDisk.renderOrder = -5
  scene.add(sunDisk)

  sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(),
    color: '#ffd69a',
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }))
  sunGlow.scale.set(13, 13, 1)
  sunGlow.renderOrder = -4
  scene.add(sunGlow)

  createStars()
  createClouds()
}

function makeGlowTexture() {
  const surface = document.createElement('canvas')
  surface.width = 128
  surface.height = 128
  const context = surface.getContext('2d')
  const gradient = context.createRadialGradient(64, 64, 2, 64, 64, 64)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.12, 'rgba(255,238,196,0.65)')
  gradient.addColorStop(0.42, 'rgba(255,183,133,0.18)')
  gradient.addColorStop(1, 'rgba(255,183,133,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 128, 128)
  const texture = new THREE.CanvasTexture(surface)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function createStars() {
  const positions = new Float32Array(360 * 3)
  for (let i = 0; i < 360; i++) {
    const angle = seededRandom() * Math.PI * 2
    const height = 0.04 + seededRandom() * 0.96
    const radius = 92 + seededRandom() * 4
    const horizontal = Math.sqrt(1 - height * height)
    positions[i * 3] = camera.position.x + Math.cos(angle) * horizontal * radius
    positions[i * 3 + 1] = camera.position.y + height * radius
    positions[i * 3 + 2] = camera.position.z + Math.sin(angle) * horizontal * radius
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({
    color: '#d8e4ff',
    size: 0.16,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  stars = new THREE.Points(geometry, material)
  stars.renderOrder = -10
  scene.add(stars)
}

function createCloudTexture() {
  const surface = document.createElement('canvas')
  surface.width = 1024
  surface.height = 256
  const context = surface.getContext('2d')
  const clusters = [
    [80, 156, 130, 48], [260, 125, 170, 63], [475, 151, 145, 45],
    [675, 112, 190, 65], [900, 149, 150, 50],
  ]

  context.filter = 'blur(9px)'
  for (const [cx, cy, width, height] of clusters) {
    for (let puff = 0; puff < 14; puff++) {
      const x = cx + (seededRandom() - 0.5) * width * 1.45
      const y = cy + (seededRandom() - 0.5) * height * 0.72
      const radiusX = width * (0.16 + seededRandom() * 0.22)
      const radiusY = height * (0.2 + seededRandom() * 0.42)
      const gradient = context.createRadialGradient(x, y, 1, x, y, radiusX)
      gradient.addColorStop(0, 'rgba(255,255,255,0.36)')
      gradient.addColorStop(0.42, 'rgba(255,255,255,0.22)')
      gradient.addColorStop(1, 'rgba(255,255,255,0)')
      context.save()
      context.translate(x, y)
      context.scale(1, radiusY / radiusX)
      context.translate(-x, -y)
      context.fillStyle = gradient
      context.beginPath()
      context.arc(x, y, radiusX, 0, Math.PI * 2)
      context.fill()
      context.restore()
    }
  }

  const texture = new THREE.CanvasTexture(surface)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.needsUpdate = true
  return texture
}

function createClouds() {
  const texture = createCloudTexture()
  for (let i = 0; i < 7; i++) {
    const material = new THREE.SpriteMaterial({
      map: texture,
      color: '#c9c9df',
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      blending: THREE.NormalBlending,
    })
    const cloud = new THREE.Sprite(material)
    cloud.position.set(-19 - (i % 3) * 7, 9.5 + (i % 4) * 0.8, -17 + i * 5.1)
    cloud.scale.set(16 + (i % 3) * 5, 3.8 + (i % 2) * 1.5, 1)
    cloud.userData.speed = 0.07 + (i % 4) * 0.025
    cloud.userData.originZ = cloud.position.z
    cloudSprites.push(cloud)
    scene.add(cloud)
  }
}

/* -------------------- local solar clock -------------------- */

function calculateSolarPosition(date, latitude, longitude) {
  const julianDay = date.getTime() / 86400000 + 2440587.5
  const century = (julianDay - 2451545) / 36525
  const meanLongitude = ((280.46646 + century * (36000.76983 + century * 0.0003032)) % 360 + 360) % 360
  const meanAnomaly = radians(357.52911 + century * (35999.05029 - 0.0001537 * century))
  const eccentricity = 0.016708634 - century * (0.000042037 + 0.0000001267 * century)
  const equationCenter =
    Math.sin(meanAnomaly) * (1.914602 - century * (0.004817 + 0.000014 * century)) +
    Math.sin(2 * meanAnomaly) * (0.019993 - 0.000101 * century) +
    Math.sin(3 * meanAnomaly) * 0.000289
  const trueLongitude = meanLongitude + equationCenter
  const omega = radians(125.04 - 1934.136 * century)
  const apparentLongitude = radians(trueLongitude - 0.00569 - 0.00478 * Math.sin(omega))
  const meanObliquity = 23 + (26 + (21.448 - century * (46.815 + century * (0.00059 - century * 0.001813))) / 60) / 60
  const obliquity = radians(meanObliquity + 0.00256 * Math.cos(omega))
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(apparentLongitude))

  const y = Math.tan(obliquity / 2) ** 2
  const equationOfTime = 4 * (180 / Math.PI) * (
    y * Math.sin(2 * radians(meanLongitude)) -
    2 * eccentricity * Math.sin(meanAnomaly) +
    4 * eccentricity * y * Math.sin(meanAnomaly) * Math.cos(2 * radians(meanLongitude)) -
    0.5 * y * y * Math.sin(4 * radians(meanLongitude)) -
    1.25 * eccentricity * eccentricity * Math.sin(2 * meanAnomaly)
  )

  const localMinutes = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60
  const timezoneHours = -date.getTimezoneOffset() / 60
  const trueSolarMinutes = ((localMinutes + equationOfTime + 4 * longitude - 60 * timezoneHours) % 1440 + 1440) % 1440
  const hourAngle = radians(trueSolarMinutes / 4 - 180)
  const lat = radians(latitude)
  const altitude = Math.asin(
    Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle),
  )
  const azimuth = Math.atan2(
    Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(lat) - Math.tan(declination) * Math.cos(lat),
  ) + Math.PI

  return {
    altitude,
    azimuth: (azimuth + Math.PI * 2) % (Math.PI * 2),
    direction: new THREE.Vector3(
      Math.cos(altitude) * Math.sin(azimuth),
      Math.sin(altitude),
      Math.cos(altitude) * Math.cos(azimuth),
    ).normalize(),
  }
}

function updateSolarClock(date = new Date()) {
  const sun = calculateSolarPosition(date, SOLAR_LOCATION.latitude, SOLAR_LOCATION.longitude)
  const altitudeDegrees = (sun.altitude * 180) / Math.PI
  const daylight = smoothstep(-7, 15, altitudeDegrees)
  const twilight = Math.exp(-Math.pow(altitudeDegrees / 12, 2))
  const night = 1 - smoothstep(-13, -3, altitudeDegrees)

  sunLight.position.copy(sun.direction).multiplyScalar(80)
  sunLight.position.add(new THREE.Vector3(0, 1.5, 0))
  sunLight.intensity = daylight * 2.3 + twilight * 0.52
  sunLight.visible = altitudeDegrees > -10
  sunLight.color.set('#fff1d1').lerp(new THREE.Color('#ff936e'), clamp(twilight * 0.88, 0, 0.88))
  sunLight.shadow.needsUpdate = true
  hemisphereLight.intensity = 0.13 + daylight * 0.73 + twilight * 0.1
  fillLight.intensity = 0.1 + daylight * 0.2

  const sunPosition = sun.direction.clone().multiplyScalar(88)
  sunDisk.position.copy(sunPosition)
  sunGlow.position.copy(sunPosition)
  sunDisk.visible = altitudeDegrees > -1.5
  sunGlow.visible = altitudeDegrees > -8
  sunGlow.material.opacity = clamp(daylight + twilight * 0.3, 0, 1)

  const zenithDay = new THREE.Color('#3c70a3')
  const zenithDusk = new THREE.Color('#413b77')
  const zenithNight = new THREE.Color('#080e24')
  const horizonDay = new THREE.Color('#e8ad8c')
  const horizonDusk = new THREE.Color('#e27e71')
  const horizonNight = new THREE.Color('#1c2747')
  const zenith = zenithNight.clone().lerp(zenithDay, daylight).lerp(zenithDusk, twilight * 0.58)
  const horizon = horizonNight.clone().lerp(horizonDay, daylight).lerp(horizonDusk, twilight * 0.7)

  skyMaterial.uniforms.uTopColor.value.copy(zenith)
  skyMaterial.uniforms.uHorizonColor.value.copy(horizon)
  skyMaterial.uniforms.uSunDirection.value.copy(sun.direction)
  skyMaterial.uniforms.uSunColor.value.copy(sunLight.color)
  skyMaterial.uniforms.uDaylight.value = smoothstep(-7, 0, altitudeDegrees)
  stars.material.opacity = night * 0.88

  const warmCloud = new THREE.Color('#c88583')
  const brightCloud = new THREE.Color('#e4d9dc')
  const nightCloud = new THREE.Color('#566080')
  const cloudColor = nightCloud.clone().lerp(brightCloud, daylight).lerp(warmCloud, twilight * 0.7)
  for (const cloud of cloudSprites) {
    cloud.material.color.copy(cloudColor)
    cloud.material.opacity = 0.12 + daylight * 0.22 + twilight * 0.1
  }

  waterMaterial.uniforms.uSunDirection.value.copy(sun.direction)
  waterMaterial.uniforms.uDaylight.value = daylight
  waterMaterial.uniforms.uWarmth.value = twilight
  waterMaterial.uniforms.uSunColor.value.copy(sunLight.color)
  scene.fog.color.copy(horizon)

  return { ...sun, altitudeDegrees, daylight, twilight, night, date }
}

/* -------------------- scheduled comet -------------------- */

function createComet() {
  cometGroup = new THREE.Group()
  cometGroup.visible = false

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 16, 12),
    new THREE.MeshBasicMaterial({ color: '#f4fff4' }),
  )
  head.name = 'comet-head'
  cometGroup.add(head)

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(),
    color: '#9cefdc',
    transparent: true,
    opacity: 0.94,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }))
  glow.scale.set(4.3, 4.3, 1)
  glow.name = 'comet-glow'
  cometGroup.add(glow)

  const geometry = new THREE.BufferGeometry()
  cometPositions = new Float32Array(24 * 3)
  geometry.setAttribute('position', new THREE.BufferAttribute(cometPositions, 3))
  cometLine = new THREE.Line(geometry, new THREE.LineBasicMaterial({
    color: '#a9f4e8',
    transparent: true,
    opacity: 0.76,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }))
  cometLine.frustumCulled = false
  cometGroup.add(cometLine)
  scene.add(cometGroup)
}

function cometPoint(progress) {
  return new THREE.Vector3(
    -12.5 - progress * 10.5,
    21 - progress * 7.0,
    10.5 - progress * 21,
  )
}

function updateComet(date, solar) {
  const secondsOfDay = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds() + date.getMilliseconds() / 1000
  const scheduled = COMET_SCHEDULE.hour * 3600 + COMET_SCHEDULE.minute * 60
  const elapsed = secondsOfDay - scheduled
  const progress = elapsed / COMET_SCHEDULE.durationSeconds
  const active = solar.altitudeDegrees < -5 && progress >= 0 && progress <= 1
  cometGroup.visible = active
  if (!active) return

  const current = cometPoint(progress)
  cometGroup.getObjectByName('comet-head').position.copy(current)
  cometGroup.getObjectByName('comet-glow').position.copy(current)

  for (let i = 0; i < 24; i++) {
    const tailProgress = Math.max(0, progress - (i / 23) * 0.22)
    const point = cometPoint(tailProgress)
    cometPositions[i * 3] = point.x
    cometPositions[i * 3 + 1] = point.y
    cometPositions[i * 3 + 2] = point.z
  }
  cometLine.geometry.attributes.position.needsUpdate = true
  cometLine.material.opacity = 0.82 * Math.sin(Math.PI * Math.min(progress * 3, 0.96))
}

/* -------------------- renderer lifecycle -------------------- */

function resize() {
  if (!renderer || !camera) return
  const width = canvas.value.clientWidth
  const height = canvas.value.clientHeight
  if (!width || !height) return
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width < 720 ? 1.15 : 1.5))
  renderer.setSize(width, height, false)
  composer.setSize(width, height)
}

function renderFrame() {
  composer.render()
  fallbackVisible.value = false
}

function animate(now) {
  if (!running) return
  animationFrame = requestAnimationFrame(animate)
  elapsedTime += Math.min(0.05, Math.max(0, (now - (animate.lastFrame || now)) / 1000))
  animate.lastFrame = now

  if (now - lastClockUpdate > 1000) {
    lastClockUpdate = now
    const date = new Date()
    const solar = updateSolarClock(date)
    updateComet(date, solar)
  }

  skyDome.position.copy(camera.position)
  waterMaterial.uniforms.uTime.value = elapsedTime
  for (const cloud of cloudSprites) {
    cloud.position.z += cloud.userData.speed * Math.min(0.05, Math.max(0, (now - (cloud.userData.lastFrame || now)) / 1000))
    cloud.userData.lastFrame = now
    if (cloud.position.z > 22) cloud.position.z = -24
  }

  composer.render()
  fallbackVisible.value = false
}

function onVisibilityChange() {
  if (document.hidden) {
    running = false
    cancelAnimationFrame(animationFrame)
  } else if (renderer && !running) {
    running = true
    lastClockUpdate = 0
    animate(performance.now())
  }
}

function disposeScene() {
  if (!scene) return
  scene.traverse((object) => {
    object.geometry?.dispose?.()
    const disposeMaterial = (material) => {
      if (!material) return
      for (const value of Object.values(material)) {
        if (value?.isTexture) value.dispose()
      }
      material.dispose()
    }
    if (Array.isArray(object.material)) object.material.forEach(disposeMaterial)
    else disposeMaterial(object.material)
  })
  composer?.dispose?.()
  renderer?.dispose?.()
}

function initializeScene() {
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: canvas.value,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.06
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap

    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera(47, 1, 0.1, 240)
    // 从环形山外缘抬高视点向下看，完整呈现陨石坑内壁与湖面。
    camera.position.set(25, 15.4, 0)
    camera.lookAt(0, 2.35, 0)

    scene.fog = new THREE.FogExp2('#b78b83', 0.0042)

    hemisphereLight = new THREE.HemisphereLight('#d1ddf5', '#41404e', 0.82)
    scene.add(hemisphereLight)
    fillLight = new THREE.AmbientLight('#a5abc9', 0.28)
    scene.add(fillLight)

    sunLight = new THREE.DirectionalLight('#fff1d1', 2.4)
    sunLight.castShadow = true
    sunLight.shadow.mapSize.set(1536, 1536)
    sunLight.shadow.camera.left = -36
    sunLight.shadow.camera.right = 36
    sunLight.shadow.camera.top = 32
    sunLight.shadow.camera.bottom = -32
    sunLight.shadow.camera.near = 1
    sunLight.shadow.camera.far = 110
    sunLight.shadow.bias = -0.00015
    sunLight.shadow.normalBias = 0.035
    scene.add(sunLight)
    scene.add(sunLight.target)

    createSky()
    buildTerrain()
    createWater()
    createComet()

    composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.68, 0.78))
    composer.addPass(new OutputPass())

    resize()
    updateSolarClock(new Date())
    renderFrame()

    resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas.value)
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', onVisibilityChange)

    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      running = true
      lastClockUpdate = performance.now()
      animationFrame = requestAnimationFrame(animate)
    }
  } catch (error) {
    console.error('3D crater scene initialization failed; showing the painted fallback.', error)
    fallbackVisible.value = true
    renderer?.dispose?.()
  }
}

onMounted(initializeScene)

onUnmounted(() => {
  running = false
  cancelAnimationFrame(animationFrame)
  resizeObserver?.disconnect()
  window.removeEventListener('resize', resize)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  disposeScene()
})
</script>

<template>
  <div v-if="fallbackVisible" class="scene-fallback" :style="fallbackStyle"></div>
  <canvas ref="canvas" class="sky-canvas" :class="{ ready: !fallbackVisible }"></canvas>
</template>

<style scoped>
.sky-canvas,
.scene-fallback {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
}

.sky-canvas {
  opacity: 0;
  transition: opacity 0.8s ease;
}

.sky-canvas.ready {
  opacity: 1;
}

.scene-fallback {
  background-position: center;
  background-size: cover;
}
</style>
