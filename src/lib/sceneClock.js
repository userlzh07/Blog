// 场景时钟：与 SkyCanvas 共用同一套虚拟时间规则和太阳位置算法，
// 让页面其它元素（如云海背景图）能跟随天空的明暗 / 色调变化。
import { ref } from 'vue'

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
export const smoothstep = (a, b, value) => {
  const t = clamp((value - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
export const radians = (degrees) => (degrees * Math.PI) / 180

export const SOLAR_LOCATION = { latitude: 31.82, longitude: 117.23 } // 合肥附近，可按需要修改

// 与 SkyCanvas.vue 中一致的太阳位置计算（日出日落、白天、暮光、夜晚系数）
export function calculateSolarPosition(date) {
  const { latitude, longitude } = SOLAR_LOCATION
  const julianDay = date.getTime() / 86400000 + 2440587.5
  const century = (julianDay - 2451545) / 36525
  const meanLongitude = ((280.46646 + century * (36000.76983 + century * 0.0003032)) % 360 + 360) % 360
  const meanAnomaly = radians(357.52911 + century * (35999.05029 - century * 0.0001537))
  const eccentricity = 0.016708634 - century * (0.000042037 + century * 0.0000001267)
  const equationCenter =
    Math.sin(meanAnomaly) * (1.914602 - century * (0.004817 + century * 0.000014)) +
    Math.sin(2 * meanAnomaly) * (0.019993 - century * 0.000101) +
    Math.sin(3 * meanAnomaly) * 0.000289
  const trueLongitude = meanLongitude + equationCenter
  const omega = radians(125.04 - 1934.136 * century)
  const apparentLongitude = radians(trueLongitude - 0.00569 - 0.00478 * Math.sin(omega))
  const meanObliquity = 23 + (26 + (21.448 - century * (46.815 + century * (0.00059 - century * 0.001813))) / 60) / 60
  const obliquity = radians(meanObliquity + 0.00256 * Math.cos(omega))
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(apparentLongitude))
  const rightAscension = Math.atan2(
    Math.cos(obliquity) * Math.sin(apparentLongitude),
    Math.cos(apparentLongitude),
  )
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
  const solarMinutes = ((localMinutes + equationOfTime + 4 * longitude - 60 * timezoneHours) % 1440 + 1440) % 1440
  const hourAngleDegrees = ((solarMinutes / 4 - 180 + 540) % 360) - 180
  const hourAngle = radians(hourAngleDegrees)
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
    altitudeDegrees: (altitude * 180) / Math.PI,
    hourAngle,
    rightAscension: (rightAscension + Math.PI * 2) % (Math.PI * 2),
    declination,
    eclipticLongitude: apparentLongitude,
    azimuth: (azimuth + Math.PI * 2) % (Math.PI * 2),
    equationOfTime,
    daylight: smoothstep(-7, 15, (altitude * 180) / Math.PI),
    twilight: Math.exp(-Math.pow(((altitude * 180) / Math.PI) / 12, 2)),
    night: 1 - smoothstep(-13, -3, (altitude * 180) / Math.PI),
  }
}

// Local clock minutes for sunrise and sunset, using the same solar model as
// the hero sky. The -0.833° altitude approximates the visible sunrise edge.
export function solarDayWindow(date) {
  const solar = calculateSolarPosition(date)
  const latitude = radians(SOLAR_LOCATION.latitude)
  const horizon = radians(-0.833)
  const cosHourAngle = clamp(
    (Math.sin(horizon) - Math.sin(latitude) * Math.sin(solar.declination)) /
      (Math.cos(latitude) * Math.cos(solar.declination)),
    -1,
    1,
  )
  const halfDayMinutes = (Math.acos(cosHourAngle) * 180 / Math.PI) * 4
  const timezoneHours = -date.getTimezoneOffset() / 60
  const solarNoon = 720 - solar.equationOfTime - 4 * SOLAR_LOCATION.longitude + 60 * timezoneHours
  return {
    sunrise: solarNoon - halfDayMinutes,
    sunset: solarNoon + halfDayMinutes,
  }
}

export function solarDayProgress(date) {
  const { sunrise, sunset } = solarDayWindow(date)
  const minutes = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60 + date.getMilliseconds() / 60000
  return clamp((minutes - sunrise) / Math.max(1, sunset - sunrise), 0, 1)
}

// ===== 虚拟时间：与 SkyCanvas 相同的规则（?preview=1 / previewTime / timeScale / sky:preview-clock） =====
const query = new URLSearchParams(window.location.search)
const PREVIEW_MODE = query.get('preview') === '1'
const parsedPreviewTime = query.get('previewTime') ? new Date(query.get('previewTime')) : null
const previewFallbackTime = new Date()
previewFallbackTime.setHours(18, 30, 0, 0)
const PREVIEW_START_TIMESTAMP = PREVIEW_MODE
  ? (parsedPreviewTime && !Number.isNaN(parsedPreviewTime.getTime()) ? parsedPreviewTime.getTime() : previewFallbackTime.getTime())
  : 0

let activeTimeScale = PREVIEW_MODE ? Math.min(3600, Math.max(1, Number(query.get('timeScale')) || 60)) : 1
let clockTimestamp = PREVIEW_START_TIMESTAMP
let lastWallTime = Date.now()
let timer = 0

// 场景氛围：供 CSS 使用的亮度 / 饱和度 / 夜色罩
export const sceneMood = ref({ brightness: 1, saturate: 1, nightDim: 0, warmth: 0, sunX: 0.5, daylight: 0 })
export const sceneTime = ref(new Date())

export function currentSceneDate() {
  if (!clockTimestamp) return new Date()
  return new Date(clockTimestamp + Math.max(0, Date.now() - lastWallTime) * activeTimeScale)
}

function updateMood(date = currentSceneDate()) {
  const solar = calculateSolarPosition(date)
  sceneTime.value = date
  sceneMood.value = {
    brightness: Number((0.36 + solar.daylight * 0.64).toFixed(3)),
    saturate: Number((0.82 + solar.daylight * 0.18).toFixed(3)),
    nightDim: Number(Math.min(1, solar.night * 0.72 + solar.twilight * 0.18).toFixed(3)),
    warmth: Number(Math.max(0, Math.min(1, solar.twilight * (1 - solar.night * 0.85))).toFixed(3)),
    sunX: Number((0.5 + Math.sin(solar.hourAngle) * 0.25).toFixed(4)),
    daylight: Number(solar.daylight.toFixed(3)),
  }
}

function onPreviewClock(event) {
  if (!PREVIEW_MODE) return
  const { timestamp, timeScale } = event.detail || {}
  if (Number.isFinite(timeScale)) activeTimeScale = clamp(timeScale, 1, 3600)
  if (Number.isFinite(timestamp)) {
    clockTimestamp = timestamp
    lastWallTime = Date.now()
  }
  updateMood()
}

function tick() {
  const wall = Date.now()
  const elapsed = wall - lastWallTime
  lastWallTime = wall
  if (clockTimestamp) clockTimestamp += elapsed * activeTimeScale
  updateMood()
}

export function startSceneClock() {
  if (timer) return
  window.addEventListener('sky:preview-clock', onPreviewClock)
  lastWallTime = Date.now()
  timer = window.setInterval(tick, 100)
  tick()
}

export function stopSceneClock() {
  if (!timer) return
  window.removeEventListener('sky:preview-clock', onPreviewClock)
  window.clearInterval(timer)
  timer = 0
}
