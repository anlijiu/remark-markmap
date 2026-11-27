//@ts-nocheck
import { adjust, darken, lighten, adjust, invert, isDark, toRgba, toHex, mix } from 'khroma'
import { nodeType, borderType, linkShapeType } from './types'

import invert from './theme/color/invert'
import { DrawTreeDirection } from './types'
import type { ColorScheme } from './theme/color/colorscheme'
import { colorscheme } from './theme/color/colorscheme'
import fontManager, { type FontManager } from './theme/font/font'
import { mixColors, rgbToHex } from './theme/colormixer'
import { log } from './logger'

export const oldAttributeBackgroundColorOdd = '#ffffff'
export const oldAttributeBackgroundColorEven = '#f2f2f2'

export const mkBorder = (col, darkMode) =>
  darkMode ? adjust(col, { s: -40, l: 10 }) : adjust(col, { s: -40, l: -10 })

function getRandomInt(max) {
  return Math.floor(Math.random() * max) + 1
}

const baseColorIdx = 0
class Theme implements ColorScheme {
  _colorscheme: ColorScheme
  _fontManager: FontManager
  _sitetheme: string
  background: string
  primaryNodeType: number
  secondaryNodeType: number
  tertiaryNodeType: number
  quaternaryNodeType: number
  quinaryNodeType: number
  senaryNodeType: number
  nodeTypes: number[]
  borderTypes: number[]
  linkShapeTypes: number[]
  defaultFontFamily: string
  defaultFontSize: string
  noteBkgColor: string
  noteTextColor: string
  THEME_COLOR_LIMIT: number
  THEME_COLOR_SCHEME_LIMIT: number
  constructor() {
    this._sitetheme = 'light'
    this._colorscheme = colorscheme(0)
    this._fontManager = fontManager
    /** # Base variables */
    /**
     * - Background - used to know what the background color is of the diagram. This is used for
     *   deducing colors for instance line color. Default value is #f4f4f4.
     */
    this.background = '#f4f4f4'

    this.primaryNodeType = nodeType.ROUNDED_RECT
    this.secondaryNodeType = nodeType.ROUNDED_RECT
    this.tertiaryNodeType = nodeType.RECT
    this.quaternaryNodeType = nodeType.DEFAULT
    this.quinaryNodeType = nodeType.DEFAULT
    this.senaryNodeType = nodeType.DEFAULT

    this.nodeTypes = [
      this.primaryNodeType,
      this.secondaryNodeType,
      this.tertiaryNodeType,
      this.quaternaryNodeType,
      this.quinaryNodeType,
      this.senaryNodeType,
    ]

    this.borderTypes = [
      borderType.NO_BORDER,
      borderType.NO_BORDER,
      borderType.NO_BORDER,
      borderType.NO_BORDER,
      borderType.NO_BORDER,
      borderType.NO_BORDER,
      borderType.NO_BORDER,
      borderType.NO_BORDER,
    ]

    this.linkShapeTypes = [
      linkShapeType.QUADRATIC_BEZIER,
      linkShapeType.BEZIER,
      linkShapeType.BEZIER,
      linkShapeType.BEZIER,
      linkShapeType.BEZIER,
      linkShapeType.BEZIER,
      linkShapeType.BEZIER,
      linkShapeType.BEZIER,
    ]

    this.noteBkgColor = '#fff5ad'
    this.noteTextColor = '#333'

    this.THEME_COLOR_LIMIT = 12
    this.THEME_COLOR_SCHEME_LIMIT = 2

    // dark

    this.defaultFontFamily = '"trebuchet ms", verdana, arial, sans-serif'
    this.defaultFontSize = '16px'
  }

  private setColorscheme(type) {
    this._colorscheme = colorscheme(type)
    this._colorscheme.updateSiteTheme(this._sitetheme)

    return this._colorscheme
  }

  colorscheme(type) {
    return this._colorscheme
  }

  public get category() {
    return this._colorscheme.category
  }

  /**
   * @param level 节点深度
   * @return 该深度的节点形状
   */
  nodeType(level) {
    const depth = level < 0 ? 0 : level
    return this.nodeTypes[depth] ?? nodeType.DEFAULT
  }

  /**
   * @param level 节点深度
   * @return 该深度的节点形状
   */
  borderType(level) {
    const depth = level < 0 ? 0 : level
    return this.borderTypes[depth] ?? borderType.NO_BORDER
  }

  /**
   * @param level 节点深度
   * @return 该深度的link形状
   */
  linkType(level) {
    const depth = level < 0 ? 0 : level
    return this.linkShapeTypes[depth] ?? linkShapeType.BEZIER
  }

  /**
   * 包括color,background-color,border,border-width,border-color
   */
  nodeStyle({ level = 0, section = 0, idx = 0 } = {}) {
    const nodeBg = this.nodeBackgroundColor({ level, section, idx })
    const nodeFg = this.nodeForegroundColor({ level, section, idx })
  }

  /**
   * 包括 link stroke color, fill color, stroke-width
   * @param direction 树方向
   * @param level 节点深度
   * @param section 节点section
   * @return 该节点的link 样式 style
   */
  linkStyle(direction, level, section) {
    const linkType = this.linkType(level)
    let thickness = 4 - 0.06 * level * level
    if (thickness < 1.5) thickness = 1.5
    let sw = '' + thickness

    let fillColor = 'none'
    const strokeColor = this.linkColor({ level, section })

    if (linkType === linkShapeType.CUSTOM_BEZIER) {
      fillColor = this.linkColor({ level, section })
      sw = '2'
    }

    if (linkType === linkShapeType.QUADRATIC_BEZIER) {
      fillColor = this.linkColor({ level, section })
      sw = '2'
    }
    const linkstyles = `fill: ${fillColor}; stroke-width: ${sw}; stroke: ${strokeColor}`
    return linkstyles
  }

  /**
   * @param level 节点深度
   * @return 该深度的节点文字大小
   */
  fontSize(level) {
    return this._fontManager.fontSize(level)
  }

  nodeBackgroundColor({ level = 0, section = 0, idx = 0 } = {}) {
    return this._colorscheme.nodeBackgroundColor({ level, section, idx })
  }

  nodeForegroundColor({ level = 0, section = 0, idx = 0 } = {}) {
    return this._colorscheme.nodeForegroundColor({ level, section, idx })
  }

  linkColor({ level = 0, section = 0, idx = 0 } = {}) {
    return this._colorscheme.linkColor({ level, section, idx })
  }

  borderColor({ level = 0, section = 0, idx = 0 } = {}) {
    return this._colorscheme.borderColor({ level, section, idx })
  }

  updateByThemeOpts(opts) {
    const {
      themeIds = [],
      borderIds = [],
      shapeIds = [],
      linkshapeIds = [],
      sitetheme = 'light',
    } = opts

    log.debug('theme.ts updateByThemeOpts  opts: ', opts)
    this._sitetheme = sitetheme
    const colorschemeIdx = themeIds[0] ?? 0
    this.setColorscheme(colorschemeIdx)
    const direction = themeIds[1] ?? DrawTreeDirection.Left_Right
    borderIds.forEach((b, i) => (this.borderTypes[i] = b))
    shapeIds.forEach((s, i) => (this.nodeTypes[i] = s))
    linkshapeIds.forEach((l, i) => (this.linkShapeTypes[i] = l))
  }

  updateColors() {}

  calculate(overrides) {
    if (typeof overrides !== 'object') {
      // Calculate colors form base colors
      this.updateColors()
      return
    }

    const keys = Object.keys(overrides)

    // Copy values from overrides, this is mainly for base colors
    keys.forEach((k) => {
      this[k] = overrides[k]
    })

    // Calculate colors form base colors
    this.updateColors()
    // Copy values from overrides again in case of an override of derived value
    keys.forEach((k) => {
      this[k] = overrides[k]
    })
  }
}

export const overridesThemeVariables = (userOverrides) => {
  theme.calculate(userOverrides)
  return theme
}

const theme = new Theme()
theme.calculate()

export default theme
