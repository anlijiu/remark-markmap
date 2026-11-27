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

export type HSLObject = {
  h: number
  s: number
  l: number
}

export type RGBColor = `rgb(${number}, ${number}, ${number})`
export type RGBAColor = `rgba(${number}, ${number}, ${number}, ${number})`
export type HSLColor = `hsl(${number}, ${number}%, ${number}%)`
export type HEXColor = `#${string}`

export type ColorType = RGBColor | RGBAColor | HEXColor | HSLColor
