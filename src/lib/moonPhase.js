import { SOLAR_LOCATION, calculateSolarPosition, clamp, radians } from './sceneClock'

// Low-precision lunar ephemeris shared by the home sky and the article page.
// It is accurate enough to render the Moon's daily phase and illuminated limb
// without shipping a large astronomy dependency.
export function calculateMoonPosition(date, solar = calculateSolarPosition(date)) {
  const julianDay = date.getTime() / 86400000 + 2440587.5
  const days = julianDay - 2451545
  const eclipticLongitude = radians(218.316 + 13.176396 * days + 6.289 * Math.sin(radians(134.963 + 13.064993 * days)))
  const eclipticLatitude = radians(5.128 * Math.sin(radians(93.272 + 13.229350 * days)))
  const obliquity = radians(23.4397 - 0.0000004 * days)
  const rightAscension = Math.atan2(
    Math.sin(eclipticLongitude) * Math.cos(obliquity) - Math.tan(eclipticLatitude) * Math.sin(obliquity),
    Math.cos(eclipticLongitude),
  )
  const declination = Math.asin(
    Math.sin(eclipticLatitude) * Math.cos(obliquity) +
    Math.cos(eclipticLatitude) * Math.sin(obliquity) * Math.sin(eclipticLongitude),
  )

  const centuries = (julianDay - 2451545) / 36525
  const siderealDegrees = (
    280.46061837 + 360.98564736629 * (julianDay - 2451545) +
    0.000387933 * centuries * centuries - centuries * centuries * centuries / 38710000 +
    SOLAR_LOCATION.longitude
  ) % 360
  const hourAngle = ((radians(siderealDegrees) - rightAscension + Math.PI * 3) % (Math.PI * 2)) - Math.PI
  const latitude = radians(SOLAR_LOCATION.latitude)
  const altitude = Math.asin(
    Math.sin(latitude) * Math.sin(declination) +
    Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle),
  )
  const azimuth = Math.atan2(
    Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(latitude) - Math.tan(declination) * Math.cos(latitude),
  ) + Math.PI
  const separation = Math.acos(clamp(
    Math.sin(solar.declination) * Math.sin(declination) +
    Math.cos(solar.declination) * Math.cos(declination) * Math.cos(solar.rightAscension - rightAscension),
    -1,
    1,
  ))

  const moonLongitude = (eclipticLongitude + Math.PI * 2) % (Math.PI * 2)
  const sunMoonLongitude = (moonLongitude - solar.eclipticLongitude + Math.PI * 2) % (Math.PI * 2)
  const rightAscensionDifference = solar.rightAscension - rightAscension
  const brightLimbAngle = Math.atan2(
    Math.cos(solar.declination) * Math.sin(rightAscensionDifference),
    Math.sin(solar.declination) * Math.cos(declination) -
      Math.cos(solar.declination) * Math.sin(declination) * Math.cos(rightAscensionDifference),
  )

  return {
    altitude,
    altitudeDegrees: (altitude * 180) / Math.PI,
    hourAngle,
    azimuth: (azimuth + Math.PI * 2) % (Math.PI * 2),
    illumination: (1 - Math.cos(separation)) / 2,
    phaseAngle: separation,
    brightLimbAngle,
    waxing: sunMoonLongitude < Math.PI,
  }
}
