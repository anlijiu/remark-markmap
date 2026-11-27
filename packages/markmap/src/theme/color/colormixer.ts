// from  https://stackoverflow.com/questions/4255973/calculation-of-a-mixed-color-in-rgb
import { log } from '../../logger'

export type RYBObject = {
  r: number
  y: number
  b: number
}

export type RGBObject = {
  r: number
  g: number
  b: number
}

function padz(str: string, len: number = 2): string {
  return (new Array(len).join('0') + str).slice(-len)
}

export const rgbToHex = (rgb: RGBObject): string => {
  const str = '#' + padz(rgb.r.toString(16)) + padz(rgb.g.toString(16)) + padz(rgb.b.toString(16))
  return str
}

const RE_HEX = /^(?:[0-9a-f]{3}){1,2}$/i
function hexToRgb(hex: string): RGBObject {
  if (hex.slice(0, 1) === '#') hex = hex.slice(1)
  if (!RE_HEX.test(hex)) throw new Error(`Invalid HEX color: "${hex}"`)
  // normalize / convert 3-chars hex to 6-chars.
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
  }
  return {
    r: parseInt(hex.slice(0, 2), 16), // r
    g: parseInt(hex.slice(2, 4), 16), // g
    b: parseInt(hex.slice(4, 6), 16), // b
  }
}

export const rgbToRYB = (rgb: RGBObject): RYBObject => {
  const { r, g, b } = rgb
  const Iw = Math.min(r, g, b)
  const Ib = Math.min(255 - r, 255 - g, 255 - b)
  const rRGB = r - Iw
  const gRGB = g - Iw
  const bRGB = b - Iw
  const minRG = Math.min(rRGB, gRGB)
  const rRYB = rRGB - minRG
  const yRYB = (gRGB + minRG) / 2
  const bRYB = (bRGB + gRGB - minRG) / 2
  const n = Math.max(rRYB, yRYB, bRYB, 1) / Math.max(rRGB, gRGB, bRGB, 1)
  return {
    r: rRYB / n + Ib,
    y: yRYB / n + Ib,
    b: bRYB / n + Ib,
  }
}

export const rybToRGB = (ryb: RYBObject): RGBObject => {
  const { r, y, b } = ryb
  const Iw = Math.min(r, y, b)
  const Ib = Math.min(255 - r, 255 - y, 255 - b)
  const rRYB = r - Iw
  const yRYB = y - Iw
  const bRYB = b - Iw
  const minYB = Math.min(yRYB, bRYB)
  const rRGB = rRYB + yRYB - minYB
  const gRGB = yRYB + minYB
  const bRGB = 2 * (bRYB - minYB)
  const n = Math.max(rRGB, gRGB, bRGB, 1) / Math.max(rRYB, yRYB, bRYB, 1)
  return {
    r: rRGB / n + Ib,
    g: gRGB / n + Ib,
    b: bRGB / n + Ib,
  }
}

const _mixColors = (c1: RYBObject, c2: RYBObject, ratio: number = 0.5): RYBObject => {
  const first = ratio * 2
  const second = (1 - ratio) * 2
  return {
    r: Math.min(255, (c1.r * first + c2.r * second) / 2),
    y: Math.min(255, (c1.y * first + c2.y * second) / 2),
    b: Math.min(255, (c1.b * first + c2.b * second) / 2),
  }
}

// color1 and color2 are the input colors in the shape of RGBObject
export const mixColors = (color1: any, color2: any, ratio: number = 0.5) => {
  log.debug(
    () =>
      `mixColors start ,  color1: ${JSON.stringify(color1, undefined, 2)} color2: ${JSON.stringify(color2, undefined, 2)} `,
  )
  if (ratio > 1) ratio = 1
  else if (ratio < 0) ratio = 0
  color1 = hexToRgb(color1)
  color2 = hexToRgb(color2)

  const mixedRyb = _mixColors(rgbToRYB(color1), rgbToRYB(color2), ratio)
  const mixedRgb = rybToRGB(mixedRyb)
  const mixedHex = rgbToHex(mixedRgb)
  log.debug(() => `mixedRyb: ${JSON.stringify(mixedRyb, undefined, 2)} ${mixedRgb} ${mixedHex}`)
  return mixedHex
}
