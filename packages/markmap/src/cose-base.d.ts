/**
 * cose-base 没有类型声明（上游是 CJS + 无 types 字段）。
 * 这里只声明本项目用到的部分。
 */
declare module 'cose-base' {
  export interface CoSENodeInstance {
    id: string
    getRect(): {
      getCenterX(): number
      getCenterY(): number
    }
  }

  export interface CoSEGraphManager {
    addRoot(): { add(node: CoSENodeInstance): CoSENodeInstance }
    add(edge: unknown, source: CoSENodeInstance, target: CoSENodeInstance): unknown
  }

  export interface CoSELayoutInstance {
    graphManager: CoSEGraphManager
    newGraphManager(): CoSEGraphManager
    newEdge(): unknown
    runLayout(): void
  }

  export const CoSELayout: new () => CoSELayoutInstance

  export const CoSENode: new (
    graphManager: CoSEGraphManager,
    location: { x: number; y: number },
    size: { width: number; height: number },
  ) => CoSENodeInstance

  export const layoutBase: {
    PointD: new (x: number, y: number) => { x: number; y: number }
    DimensionD: new (width: number, height: number) => { width: number; height: number }
    LayoutConstants: { QUALITY: number; DEFAULT_INCREMENTAL: boolean }
    FDLayoutConstants: { DEFAULT_INCREMENTAL: boolean }
  }

  const coseBase: {
    CoSELayout: typeof CoSELayout
    CoSENode: typeof CoSENode
    layoutBase: typeof layoutBase
  }

  export default coseBase
}
