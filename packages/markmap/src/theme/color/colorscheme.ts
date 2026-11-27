import type { ColorType } from './types'
import { colorsHex, twLightnessLevels } from './color'

const colorNames0 = [
  'red',
  'orange',
  'yellow',
  'lime',
  'blue',
  'indigo',
  'pink',
  'amber',
  'green',
  'cyan',
  'purple',
  'teal',
  'sky',
  'fuchsia',
  'rose',
  'emerald',
  'violet',
  'stone',
  'neutral',
  'zinc',
  'gray',
  'slate',
]

type Params = {
  level: number //节点深度
  section: number //节点属于哪个组(root节点's children index)
  idx: number //节点属于父节点's children index
}

export interface ColorScheme {
  category: number
  nodeBackgroundColor: (params: Params) => string
  nodeForegroundColor: (params: Params) => string
  linkColor: (params: Params) => string
  borderColor: (params: Params) => string
}

class ColorScheme0 implements ColorScheme {
  private _category: number = 0
  private _sitetheme: string = 'light'

  public get category() {
    return this._category
  }

  updateSiteTheme(sitetheme = 'light') {
    this._sitetheme = sitetheme
  }

  nodeBackgroundColor({ level }: Params) {
    const colorName = (colorNames0[level] ?? 'slate') as keyof typeof colorsHex
    const darknessIdx = this._sitetheme == 'light' ? 10 : 0
    return colorsHex[colorName][darknessIdx]
  }
  nodeForegroundColor(_params: Params) {
    return this._sitetheme == 'light' ? '#020617' : '#eeeeee'
  }
  linkColor({ level }: Params) {
    const colorName = (colorNames0[level] ?? 'slate') as keyof typeof colorsHex
    const color = colorsHex[colorName][5]
    return color
  }
  borderColor({ level }: Params) {
    const colorName = (colorNames0[level] ?? 'slate') as keyof typeof colorsHex
    return colorsHex[colorName][5]
  }
}

export function colorscheme(type: number): ColorScheme {
  return new ColorScheme0()
}
