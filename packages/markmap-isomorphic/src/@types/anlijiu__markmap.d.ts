declare module '@anlijiu/markmap' {
  import type { MindmapNode } from './types.js'

  export function render(
    id: string,
    node: MindmapNode,
    options?: Record<string, unknown>,
    svgContainingElement?: Element,
  ): Promise<{ svg: string }>
}
