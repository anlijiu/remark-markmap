/**
 * 为什么这里不复用 `@anlijiu/markmap` 的 MindmapNode：
 * 通过 `export type { MindmapNode } from '@anlijiu/markmap'` 再导出时，
 * TS 7 在 `export * from './types'` 的链路上报 TS2459（模块声明了但未导出）。
 *
 * 因此保留本地定义，但字段必须与 markmap 版本保持**结构兼容**：
 * 新增字段只能加可选属性，`contents` 用更宽松的 `unknown[]`，
 * 这样 markmap 的 MindmapNode 可以安全赋给本类型。
 */
export interface MindmapNode {
  id: number
  nodeId: string
  level: number
  descr: string
  type: number
  tagName?: string
  children: MindmapNode[]
  contents?: unknown[]
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
