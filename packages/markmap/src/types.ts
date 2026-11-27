import type { Selection } from 'd3-selection'
import type { RequiredDeep } from 'type-fest'
import type { Element as HastElement } from 'hast'
import type mindmapDb from './db'

export enum DrawTreeDirection {
  Up = 1,
  Down,
  Left,
  Right,
  Left_Right,
  Radial,
}

export type DrawOptions = {
  themeIds: Uint8Array
  borderIds: Uint8Array
  shapeIds: Uint8Array
  linkshapeIds: Uint8Array
  sitetheme?: string
}

export type DrawDefinition = (
  node: MindmapNode,
  id: string,
  opts: DrawOptions,
) => void | Promise<void>

export type MarkdownWordType = 'normal' | 'strong' | 'emphasis' | 'delete'
export interface MarkdownWord {
  content: string
  type: MarkdownWordType
}

export type MarkdownDisplayType = 'block' | 'inline'
export interface MarkdownRawHtml {
  raw: string
  display: MarkdownDisplayType
  type: 'raw_html'
}

export interface MarkdownImage {
  src: string
  width: number
  height: number
  alt: string
  title: string
  type: 'image'
}

export interface MarkdownTextLine {
  words: MarkdownWord[]
  type: 'text_line'
}

export type Block = MarkdownTextLine | MarkdownRawHtml | MarkdownImage
/** Returns `true` if the line fits a constraint (e.g. it's under 𝑛 chars) */
export type CheckFitFunction = (text: MarkdownTextLine) => boolean

// This makes it clear that we're working with a d3 selected element of some kind, even though it's hard to specify the exact type.
export type D3Element = any

export interface Point {
  x: number
  y: number
}

export const borderType = {
  NO_BORDER: 0, // 无边框
  SKIN: 1, // 有边框无间距
  SHIELD: 2, // 有边框有间距
}

export const nodeType = {
  DEFAULT: 0,
  ROUNDED_RECT: 1,
  RECT: 2,
  CIRCLE: 3,
  CLOUD: 4,
  BANG: 5,
  HEXAGON: 6,
}

/* edge type 连线形状 */
export const linkShapeType = {
  BEZIER: 0, // 贝塞尔曲线(三阶，默认)
  STRAIGHT_LINE: 1, // 直线
  PERPENDICULAR_LINE: 2, // 直角折线
  CUSTOM_BEZIER: 3, // 自定义的贝塞尔曲线
  QUADRATIC_BEZIER: 4, // 贝塞尔曲线(二阶)
}

export interface MindmapNode {
  id: number
  nodeId: string
  level: number
  descr: string
  type: number
  tagName?: string
  children: MindmapNode[]
  contents?: HastElement[]
  width: number
  padding: number
  section?: number
  height?: number
  class?: string
  icon?: string
  x?: number
  y?: number
  bgColor?: string
  fgColor?: string
  margin?: number
  weight?: number
}

export interface RenderResult {
  /**
   * The aria description of the diagram.
   */
  description?: string

  /**
   * The height of the resulting SVG.
   */
  height: number

  /**
   * The DOM id of the SVG node.
   */
  id: string

  /**
   * The diagram SVG rendered as a PNG buffer.
   */
  screenshot?: Buffer

  /**
   * The diagram rendered as an SVG.
   */
  svg: string

  /**
   * The title of the rendered diagram.
   */
  title?: string

  /**
   * The width of the resulting SVG.
   */
  width: number
}

export type HTML = Selection<HTMLIFrameElement, unknown, Element, unknown>

export type SVG = Selection<SVGSVGElement, unknown, Element, unknown>

export type FilledMindMapNode = RequiredDeep<MindmapNode>
export type MindmapDB = typeof mindmapDb
