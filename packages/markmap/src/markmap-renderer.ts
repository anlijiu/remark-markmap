import { Bezier } from 'bezier-js'
import coseBase from 'cose-base'
import type { CoSENodeInstance } from 'cose-base'
import theme from './theme'
import type { DrawDefinition } from './types'
import { log } from './logger'
import { selectSvgElement } from './selectSvgElement'
import { setupGraphViewbox } from './setupGraphViewbox'
import type { D3Element, FilledMindMapNode, MindmapDB, MindmapNode } from './types'
import { DrawTreeDirection, linkShapeType } from './types'
import type { DrawOptions } from './types'
import { flextree } from 'd3-flextree'
import { hierarchy, tree } from 'd3-hierarchy'
import type { HierarchyNode } from 'd3-hierarchy'
import { drawNode, positionNode, signSvg } from './svgDraw.js'
import partition from './dp'
import db from './db'

function assertMindmapNode(node: unknown): asserts node is FilledMindMapNode {
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    throw new TypeError(
      `Expected a MindmapNode object, received ${typeof node}: ${JSON.stringify(node)}`,
    )
  }
}

function drawNodes(
  svg: D3Element,
  mindmap: FilledMindMapNode,
  opts: any,
  section: number,
  index: number = 0,
) {
  assertMindmapNode(mindmap)
  drawNode(svg, mindmap, opts, section, index)
  if (mindmap.children) {
    mindmap.children.forEach((child, index) => {
      drawNodes(svg, child, opts, section < 0 ? index : section, index)
    })
  }
}

/** Radial 布局节点：cose 算出的中心坐标 + 渲染需要的尺寸与原始节点。 */
type RadialLayoutNode = {
  id: number
  width: number
  height: number
  x: number
  y: number
  data: FilledMindMapNode
}

type RadialLayoutLink = {
  source: RadialLayoutNode
  target: RadialLayoutNode
  /** 父节点的深度（0 起），用于决定连线粗细 */
  depth: number
  section?: number
}

/** 边的几何信息：节点中心坐标 + 节点尺寸。 */
type LayoutShape = {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 计算一条边的几何端点。
 *
 * 从源节点中心沿连线方向走到节点矩形边界即为起点，目标节点同理。
 */
function computeEdgeBounds(source: LayoutShape, target: LayoutShape) {
  const s = { x: source.x, y: source.y }
  const t = { x: target.x, y: target.y }
  const halfW = source.width / 2
  const halfH = source.height / 2
  const halfTW = target.width / 2
  const halfTH = target.height / 2

  const dx = t.x - s.x
  const dy = t.y - s.y

  // 从矩形中心沿方向 (ddx, ddy) 走到边界的比例，最大不超过 1（即不超过对方中心）
  const ratio = (ddx: number, ddy: number, hw: number, hh: number) => {
    if (ddx === 0 && ddy === 0) return 0
    const tx = ddx === 0 ? Number.POSITIVE_INFINITY : hw / Math.abs(ddx)
    const ty = ddy === 0 ? Number.POSITIVE_INFINITY : hh / Math.abs(ddy)
    return Math.min(tx, ty, 1)
  }

  const startRatio = ratio(dx, dy, halfW, halfH)
  const endRatio = ratio(-dx, -dy, halfTW, halfTH)

  return {
    startX: s.x + dx * startRatio,
    startY: s.y + dy * startRatio,
    midX: (s.x + t.x) / 2,
    midY: (s.y + t.y) / 2,
    endX: t.x - dx * endRatio,
    endY: t.y - dy * endRatio,
  }
}

function drawEdges(edgesEl: D3Element, links: RadialLayoutLink[]) {
  links.forEach((edge) => {
    const bounds = computeEdgeBounds(
      edge.source as RadialLayoutNode,
      edge.target as RadialLayoutNode,
    )
    const level = edge.depth
    const section = edge.section
    const color = theme.borderColor({ level, section })

    const dx = bounds.endX - bounds.startX
    const dy = bounds.endY - bounds.startY
    const length = Math.hypot(dx, dy)
    if (!Number.isFinite(length) || length === 0) {
      log.warn('radial edge has non-finite length, skipped:', edge.source, edge.target, length)
      return
    }

    // 带粗细的贝塞尔轮廓在「连线很短」时会自相交，视觉上表现为中间出现空洞。
    // 因此：短连线直接画折线；长连线的轮廓宽度也按长度收敛，避免同样的问题。
    if (edge.depth > 4 || length < 40) {
      edgesEl
        .insert('path')
        .attr(
          'd',
          `M ${bounds.startX},${bounds.startY} L ${bounds.midX},${bounds.midY} L${bounds.endX},${bounds.endY} `,
        )
        .attr('fill', color)
        .attr('stroke', color)
      return
    }

    const controlX = 0.9999 * bounds.startX + 0.0001 * bounds.midX
    const controlY = 0.9999 * bounds.startY + 0.0001 * bounds.midY
    // 轮廓半宽不超过连线长度的 1/4，保证两端轮廓不会相互穿插
    const maxWidth = length * 0.25
    const startWidth = Math.min((7 - edge.depth) * 1.3, maxWidth)
    const endWidth = startWidth * 0.4
    const origBezier = new Bezier(
      bounds.startX,
      bounds.startY,
      controlX,
      controlY,
      bounds.endX,
      bounds.endY,
    )
    const outline = origBezier.outline(startWidth, startWidth, endWidth, endWidth)
    let p = outline.curves.reduce(
      (total, item, index) =>
        `${total} ${index == 0 ? item.toSVG() : item.toSVG().replace('M', 'L')}`,
      '',
    )
    p += 'Z'

    edgesEl.insert('path').attr('d', p).attr('fill', color).attr('stroke', color)
  })
}

/** tidy 径向树的层间距，用作 CoSE 的初始位置 */
const RADIAL_RING_GAP = 190

/**
 * cose 的 tree-reduction 在放置剪枝节点时会调用 Math.random（左右/四角随机选择），
 * 导致同一文档两次渲染结果不同。布局是同步的，这里临时替换成固定种子的 PRNG，
 * 保证结果可复现。
 */
function withSeededRandom<T>(fn: () => T): T {
  const originalRandom = Math.random
  let seed = 0x2f6e2b1
  Math.random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 0x100000000
  }
  try {
    return fn()
  } finally {
    Math.random = originalRandom
  }
}

/**
 * 用 cose-base 的 CoSE 计算布局，初始位置由 tidy 径向树给出。
 *
 * 与旧 cose-bilkent 的差异只有初始位置：原来所有节点从 (0,0) 开始、靠 CoSE
 * 自己展开，10000 节点要 60s+；这里先铺一棵无交叉的径向树，CoSE 只做局部
 * 微调（incremental 模式），10000 节点约 7s，视觉仍是 cose-bilkent 的成簇形态。
 */
function layoutMindmap(node: MindmapNode) {
  const { CoSELayout, CoSENode, layoutBase } = coseBase
  const { PointD, DimensionD, LayoutConstants, FDLayoutConstants } = layoutBase

  LayoutConstants.QUALITY = 2 // proof
  // incremental：保留节点当前坐标，只做局部调整，而不是随机撒点后重新展开
  FDLayoutConstants.DEFAULT_INCREMENTAL = true
  LayoutConstants.DEFAULT_INCREMENTAL = true

  const root = node as FilledMindMapNode
  const hierarchyRoot = hierarchy(root, (d) => (d.children?.length ? d.children : undefined))
  const treeLayout = tree<FilledMindMapNode>().size([
    Math.PI * 2,
    Math.max(hierarchyRoot.height, 1),
  ])
  const positioned = treeLayout(hierarchyRoot)

  const nodes: RadialLayoutNode[] = []
  const links: RadialLayoutLink[] = []
  const layout = new CoSELayout()
  const graphManager = layout.newGraphManager()
  const parent = graphManager.addRoot()
  const idToNode = new Map<number, RadialLayoutNode>()
  const idToLNode = new Map<number, CoSENodeInstance>()

  positioned.each((n) => {
    const width = n.data.width ?? 0
    const height = n.data.height ?? 0
    const angle = n.x ?? 0
    const radius = n.depth * RADIAL_RING_GAP + Math.max(width, height) / 2
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius

    const lNode = parent.add(
      new CoSENode(
        graphManager,
        new PointD(x - width / 2, y - height / 2),
        new DimensionD(width, height),
      ),
    )
    lNode.id = String(n.data.id)
    idToLNode.set(n.data.id, lNode)

    const layoutNode: RadialLayoutNode = { id: n.data.id, width, height, x, y, data: n.data }
    nodes.push(layoutNode)
    idToNode.set(n.data.id, layoutNode)
  })

  // 与 cose-bilkent 的 addNodes 一致：先子树、再补父子边
  positioned.eachAfter((n) => {
    if (!n.parent) return
    graphManager.add(layout.newEdge(), idToLNode.get(n.parent.data.id)!, idToLNode.get(n.data.id)!)
    links.push({
      source: idToNode.get(n.parent.data.id)!,
      target: idToNode.get(n.data.id)!,
      depth: n.parent.depth,
      section: n.data.section,
    })
  })

  withSeededRandom(() => layout.runLayout())

  for (const [id, lNode] of idToLNode) {
    const rect = lNode.getRect()
    const layoutNode = idToNode.get(id)!
    layoutNode.x = rect.getCenterX()
    layoutNode.y = rect.getCenterY()
  }

  enforceMinArmLength(nodes, links, RADIAL_ARM_GAP)
  resolveOverlaps(nodes)

  return { nodes, links }
}

/**
 * CoSE 的 incremental 微调会把节点往中心收缩，父子节点的中心距常常小于两者
 * 尺寸之和 —— 视觉上就是「臂太短」，连线和节点挤在一起。
 *
 * 这里按深度从浅到深，对每条父子边检查中心距；不足时沿连线方向把子节点及其
 * 整棵子树推远，保持子树内部相对位置不变。位移记在节点上统一应用，避免逐条边
 * 遍历子树（那会退化成 O(n²)）。
 */
function enforceMinArmLength(nodes: RadialLayoutNode[], links: RadialLayoutLink[], minGap: number) {
  // 边的顺序是后序遍历（深→浅），推子树必须先处理浅层，按父节点深度排序
  const ordered = [...links].sort((a, b) => a.depth - b.depth)
  const shifts = new Map<number, { x: number; y: number }>()

  for (const link of ordered) {
    const { source, target } = link
    const parentShift = shifts.get(source.id) ?? { x: 0, y: 0 }
    const sx = source.x + parentShift.x
    const sy = source.y + parentShift.y
    const tx = target.x + parentShift.x
    const ty = target.y + parentShift.y

    const dx = tx - sx
    const dy = ty - sy
    const distance = Math.hypot(dx, dy)
    if (distance < 1e-6) {
      continue
    }
    const ux = dx / distance
    const uy = dy / distance
    // 两个矩形沿连线方向的半投影之和
    const reach =
      (Math.abs(ux) * (source.width + target.width)) / 2 +
      (Math.abs(uy) * (source.height + target.height)) / 2
    const needed = reach + minGap
    if (distance >= needed) {
      continue
    }
    const push = needed - distance
    shifts.set(target.id, { x: parentShift.x + ux * push, y: parentShift.y + uy * push })
  }

  for (const node of nodes) {
    const shift = shifts.get(node.id)
    if (shift) {
      node.x += shift.x
      node.y += shift.y
    }
  }
}

/**
 * CoSE 的 incremental 微调会把节点往中心收缩，偶尔压出重叠（宽节点尤其明显）。
 * 这里在布局结果上做最小位移的矩形分离：只把互相重叠的节点沿重叠较小的轴
 * 各推开一半，整体仍保持 CoSE 的紧凑形态。
 *
 * 用网格把候选对限制在相邻格子内，避免 O(n²)——10000 节点也只需线性扫描。
 */
function resolveOverlaps(nodes: RadialLayoutNode[], padding = 26, maxIterations = 60) {
  if (nodes.length < 2) {
    return
  }
  const maxWidth = nodes.reduce((max, n) => Math.max(max, n.width), 0)
  const maxHeight = nodes.reduce((max, n) => Math.max(max, n.height), 0)
  const cellSize = Math.max(maxWidth, maxHeight) + padding * 2
  if (!Number.isFinite(cellSize) || cellSize <= 0) {
    return
  }
  const cellKey = (cx: number, cy: number) => `${cx},${cy}`

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const grid = new Map<string, RadialLayoutNode[]>()
    for (const node of nodes) {
      const key = cellKey(Math.floor(node.x / cellSize), Math.floor(node.y / cellSize))
      const bucket = grid.get(key)
      if (bucket) {
        bucket.push(node)
      } else {
        grid.set(key, [node])
      }
    }

    let moved = false
    const visited = new Set<string>()
    for (const node of nodes) {
      const cx = Math.floor(node.x / cellSize)
      const cy = Math.floor(node.y / cellSize)
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const bucket = grid.get(cellKey(cx + dx, cy + dy))
          if (!bucket) continue
          for (const other of bucket) {
            if (other === node) continue
            const pairKey = node.id < other.id ? `${node.id}:${other.id}` : `${other.id}:${node.id}`
            if (visited.has(pairKey)) continue
            visited.add(pairKey)

            const overlapX = (node.width + other.width) / 2 + padding - Math.abs(other.x - node.x)
            const overlapY = (node.height + other.height) / 2 + padding - Math.abs(other.y - node.y)
            if (overlapX <= 0 || overlapY <= 0) continue

            moved = true
            // 沿重叠较小的轴分离，位移最小
            if (overlapX < overlapY) {
              const shift = (overlapX / 2 + 0.01) * (other.x >= node.x ? 1 : -1)
              node.x -= shift
              other.x += shift
            } else {
              const shift = (overlapY / 2 + 0.01) * (other.y >= node.y ? 1 : -1)
              node.y -= shift
              other.y += shift
            }
          }
        }
      }
    }

    if (!moved) {
      break
    }
  }
}

/** 父子节点之间保留的最小臂长（中心距还需加上两者在连线方向上的半尺寸） */
const RADIAL_ARM_GAP = 100

function positionNodes(nodes: RadialLayoutNode[]) {
  nodes.forEach((node) => {
    const data = node.data
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
      log.warn(
        'radial node has non-finite position:',
        node.id,
        data.descr,
        'x=',
        node.x,
        'y=',
        node.y,
        'size=',
        data.width,
        data.height,
      )
    }
    data.x = node.x ?? 0
    data.y = node.y ?? 0
    positionNode(data)
    const el = db.getElementById(data.id)
    log.info('Id:', node.id, 'Position: (', data.x, ', ', data.y, ')', data)
    el.attr('transform', `translate(${data.x - data.width / 2}, ${data.y - data.height / 2})`)
  })
}

const spacing = 5 //同级别 spacing
function getTreeLayout(d: DrawTreeDirection = DrawTreeDirection.Down) {
  const baseOptions = {
    nodeSize: (n: HierarchyNode<MindmapNode>): [number, number] => [
      n.data.width ?? 0,
      n.data.height ?? 0,
    ],
    spacing: (a: HierarchyNode<MindmapNode>, b: HierarchyNode<MindmapNode>) =>
      a.parent === b.parent ? spacing * 2 : spacing,
  }
  if (d === DrawTreeDirection.Up || d === DrawTreeDirection.Down) {
    return flextree<MindmapNode>(baseOptions)
  }
  return flextree<MindmapNode>({
    ...baseOptions,
    nodeSize: (n: HierarchyNode<MindmapNode>): [number, number] => [
      n.data.height ?? 0,
      n.data.width ?? 0,
    ],
  })
}

/** 连线端点：source / target 为 `[x, y]`。 */
type LinkPoints = {
  source: [number, number]
  target: [number, number]
}

type RenderOpts = {
  colorschemeIdx: number
  shapeIds: Uint8Array
  linkshapeIds: Uint8Array
  borderIds: Uint8Array
  direction: number
}

const drawLeftRightMindMap = async (data: MindmapNode, edgesElem: D3Element, opts: RenderOpts) => {
  const { direction } = opts
  log.debug('drawLeftRightMindMap  in , direction: ', direction)
  const positionNode = (n: any, d: DrawTreeDirection = DrawTreeDirection.Up, withSize = 0) => {
    const nodeElem = db.getElementById(n.data.id)
    const x = n.x || 0 //n.x node中心点 x
    const y = n.y || 0 //n.y node中心点 y
    let transX = x - n.data.width / 2
    let transY = y + n.data.height

    // Position the node to its coordinate
    if (d === DrawTreeDirection.Up) {
      // Up,  from bottom to top
      if (n.depth === 0) {
        transY = -n.data.height / 2 - 50
      } else {
        transY = -y - n.data.height - 50 * n.depth
      }
      log.debug(
        `drawLeftRightMindMap  positionNode in , n: ${n.depth} y:${y} height:${n.data.height}   transX: ${transX} transY: ${transY}`,
      )
    } else if (d === DrawTreeDirection.Down) {
      transY = y + 50 * n.depth
      // Down, from top to bottom
    } else if (d === DrawTreeDirection.Left) {
      // Left,  from right to left
      transX = -y - n.size[1] - 50 * n.depth
      transY = -x - n.size[0] / 2
    } else if (d === DrawTreeDirection.Right) {
      // Right,   from left to right
      transX = y + 50 * n.depth - withSize - 50
      transY = x - n.size[0] / 2
    }

    nodeElem.attr('transform', 'translate(' + transX + ',' + transY + ')')

    if (n.children && n.children.length > 0) {
      n.children.forEach((c: any) => positionNode(c, d, withSize))
    }
  }

  const treeLayout = getTreeLayout(direction)

  //二阶贝塞尔曲线 垂直
  const linkQuadraticVertical =
    (outlineStartWidth = 10, outlineEndWidth = 0.01) =>
    ({ source, target }: LinkPoints) => {
      const origBezier = new Bezier([
        source[0],
        source[1], //终点
        target[0],
        source[1], //控制点
        target[0],
        target[1], //起点
      ])
      let p
      const outline = origBezier.outline(
        outlineStartWidth,
        outlineStartWidth,
        outlineEndWidth,
        outlineEndWidth,
      )
      p = outline.curves.reduce(
        (total, item, index) =>
          `${total} ${index == 0 ? item.toSVG() : item.toSVG().replace('M', 'L')}`,
        '',
      )
      p += 'Z'
      log.debug(
        'linkQuadraticHorizontal p is :',
        p,
        '  source:',
        source,
        ' target:',
        target,
        ' staticWidth',
      )
      return p
    }

  //二阶贝塞尔曲线 水平
  const linkQuadraticHorizontal =
    (outlineStartWidth = 10, outlineEndWidth = 0.01) =>
    ({ source, target }: LinkPoints) => {
      const origBezier = new Bezier([
        source[0],
        source[1], //终点
        source[0],
        target[1] + 0.1, //控制点
        target[0],
        target[1], //起点
      ])
      let p
      const outline = origBezier.outline(
        outlineStartWidth,
        outlineStartWidth,
        outlineEndWidth,
        outlineEndWidth,
      )
      p = outline.curves.reduce(
        (total, item, index) =>
          `${total} ${index == 0 ? item.toSVG() : item.toSVG().replace('M', 'L')}`,
        '',
      )
      p += 'Z'
      log.debug(
        'linkQuadraticHorizontal p is :',
        p,
        '  source:',
        source,
        ' target:',
        target,
        ' staticWidth',
      )
      return p
    }

  //三阶贝塞尔曲线 水平
  const linkHorizontal =
    () =>
    ({ source, target }: LinkPoints) => {
      const beizer = new Bezier([
        source[0],
        source[1], //终点
        target[0] - 0.5 * (target[0] - source[0]),
        source[1] + 0.5 * (target[1] - source[1]), //控制点1
        source[0] + 0.5 * (target[0] - source[0]),
        target[1], //控制点2
        target[0],
        target[1], //起点
      ])
      const p = beizer.toSVG()
      log.debug('linkHorizontal   p: ', p)
      return p
    }

  //三阶贝塞尔曲线 垂直
  const linkVertical =
    () =>
    ({ source, target }: LinkPoints) => {
      const beizer = new Bezier([
        source[0],
        source[1], //终点
        source[0],
        source[1] + 0.5 * (target[1] - source[1]), //控制点1
        target[0],
        target[1] - 0.5 * (target[1] - source[1]), //控制点2
        target[0],
        target[1], //起点
      ])
      const p = beizer.toSVG()
      log.debug('linkHorizontal   p: ', p)
      return p
    }

  const linkBezierShapeHorizontal =
    (outlineStartWidth = 8, outlineEndWidth = 0.01) =>
    ({ source, target }: LinkPoints) => {
      const origBezier = new Bezier([
        source[0],
        source[1] + 0.01 * (target[1] - source[1]), //终点
        target[0] - 0.3 * (target[0] - source[0]),
        source[1] + 0.3 * (target[1] - source[1]), //控制点1
        source[0] + 0.3 * (target[0] - source[0]),
        target[1], //控制点2
        target[0],
        target[1], //起点
      ])
      let p
      const outline = origBezier.outline(
        outlineStartWidth,
        outlineStartWidth,
        outlineEndWidth,
        outlineEndWidth,
      )
      p = outline.curves.reduce(
        (total, item, index) =>
          `${total} ${index == 0 ? item.toSVG() : item.toSVG().replace('M', 'L')}`,
        '',
      )
      p += 'Z'
      log.debug('pppppppppppppp is :', p, '  source:', source, ' target:', target, ' staticWidth')
      return p
    }
  const linkBezierShapeVertical =
    (outlineStartWidth = 8, outlineEndWidth = 0.01) =>
    ({ source, target }: LinkPoints) => {
      const origBezier = new Bezier([
        source[0],
        source[1], //终点
        source[0],
        source[1] + 0.5 * (target[1] - source[1]), //控制点1
        target[0],
        target[1] - 0.5 * (target[1] - source[1]), //控制点2
        target[0],
        target[1], //起点
      ])
      let p
      const outline = origBezier.outline(
        outlineStartWidth,
        outlineStartWidth,
        outlineEndWidth,
        outlineEndWidth,
      )
      p = outline.curves.reduce(
        (total, item, index) =>
          `${total} ${index == 0 ? item.toSVG() : item.toSVG().replace('M', 'L')}`,
        '',
      )
      p += 'Z'
      log.debug('pppppppppppppp is :', p, '  source:', source, ' target:', target, ' staticWidth')
      return p
    }

  const linkPerpendicularShape =
    (d: DrawTreeDirection, outlineStartWidth = 8, outlineEndWidth = 0.01) =>
    ({ source, target }: LinkPoints) => {
      if (d === DrawTreeDirection.Up || d === DrawTreeDirection.Down) {
        const mx = (source[1] + target[1]) / 2
        return `M ${source[0]},${source[1]} L ${source[0]}, ${mx} L ${target[0]},${mx} L ${target[0]},${target[1]}`
      }
      const mx = (source[0] + target[0]) / 2
      return `M ${source[0]},${source[1]} L ${mx},${source[1]} L ${mx},${target[1]} L ${target[0]},${target[1]}`
    }

  const drawEdge = (
    n: any,
    containerEl: D3Element,
    d: DrawTreeDirection,
    parent: any = undefined,
    extraRight = 0,
  ) => {
    let linkFunc = linkHorizontal()

    const x = n.x || 0 //n.x node中心点 x
    const y = n.y || 0 //n.y node中心点 y
    const transX = x - n.data.width / 2
    const transY = y - n.data.height / 2
    if (parent) {
      let linkstyles = ''
      const f = (n1: any, n2: any, withSize: number) => {
        /********** 根据 link shape 和 direction  选取link Function    **********/
        const linkType = theme.linkType(n1.depth)
        linkstyles = theme.linkStyle(d, n1.depth, n.data.section)
        if (linkType === linkShapeType.BEZIER) {
          if (d === DrawTreeDirection.Up || d === DrawTreeDirection.Down) {
            linkFunc = linkVertical()
          } else {
            linkFunc = linkHorizontal()
          }
        } else if (linkType === linkShapeType.PERPENDICULAR_LINE) {
          linkFunc = linkPerpendicularShape(d)
        } else if (linkType === linkShapeType.CUSTOM_BEZIER) {
          if (d === DrawTreeDirection.Up || d === DrawTreeDirection.Down) {
            linkFunc = linkBezierShapeVertical()
          } else {
            linkFunc = linkBezierShapeHorizontal()
          }
        } else if (linkType === linkShapeType.QUADRATIC_BEZIER) {
          if (d === DrawTreeDirection.Up || d === DrawTreeDirection.Down) {
            linkFunc = linkQuadraticVertical()
          } else {
            linkFunc = linkQuadraticHorizontal()
          }
        } else {
          if (d === DrawTreeDirection.Up || d === DrawTreeDirection.Down) {
            linkFunc = linkVertical()
          } else {
            linkFunc = linkHorizontal()
          }
        }

        let sourceX = n1.x
        let sourceY = n1.y - n1.size[1] / 2
        let targetX = n2.x
        let targetY = n2.y - n2.size[1] / 2
        if (d === DrawTreeDirection.Up) {
          const getTransY = (n: any) =>
            n.depth === 0 ? -n.data.height / 2 - 50 : -n.data.height - n.y - 50 * n.depth
          if (linkType === linkShapeType.QUADRATIC_BEZIER) {
            sourceX = n1.x
            sourceY = getTransY(n1) + n1.data.height / 2
          } else {
            sourceX = n1.x
            sourceY = getTransY(n1)
          }
          targetX = n2.x
          targetY = getTransY(n2) + n2.data.height
        } else if (d === DrawTreeDirection.Down) {
          const getTransY = (n: any) => {
            return y + 50 * n.depth
          }

          if (linkType === linkShapeType.QUADRATIC_BEZIER) {
            sourceY = getTransY(n1) - n1.data.height / 2
          } else {
            sourceY = getTransY(n1)
          }
          targetY = getTransY(n2)
        } else if (d === DrawTreeDirection.Left) {
          const getTransX = (n: any) => -n.y - 50 * n.depth
          const getTransY = (n: any) => -n.x
          if (linkType === linkShapeType.QUADRATIC_BEZIER) {
            sourceX = getTransX(n1) - n1.size[1] / 2
            sourceY = getTransY(n1)
          } else {
            sourceX = getTransX(n1) - n1.size[1]
            sourceY = getTransY(n1)
          }
          // sourceX = getTransX(n1) - n1.size[1];
          // sourceY = getTransY(n1);
          targetX = getTransX(n2)
          targetY = getTransY(n2)
        } else if (d === DrawTreeDirection.Right) {
          const getTransY = (n: any) => n.y + 50 * (n.depth - 1) - withSize
          if (linkType === linkShapeType.QUADRATIC_BEZIER) {
            sourceX = getTransY(n1) + n1.size[1] / 2 //从src中心到dest的左侧 所以src才要加上自己的宽
            sourceY = n1.x
          } else {
            sourceX = getTransY(n1) + n1.size[1] //从src右侧到dest的左侧 所以src才要加上自己的宽
            sourceY = n1.x
          }
          targetX = getTransY(n2)
          targetY = n2.x
        }
        // if (linkType === linkShapeType.QUADRATIC_BEZIER) {
        //   if (d === DrawTreeDirection.Left) {
        //     sourceX = n1.x - n1.size[1]/2;
        //   } else if (d === DrawTreeDirection.Right) {
        //     sourceX = n1.x - n1.size[1]/2;
        //   }
        // }

        return linkFunc({
          source: [sourceX, sourceY],
          target: [targetX, targetY],
        })
      }
      containerEl
        .append('path')
        .attr('d', f(parent, n, extraRight))
        .attr('class', 'edge section-edge-' + n.data.section + ' edge-depth-' + n.depth)
        .attr('style', linkstyles)
    }
    for (const kid of n.children || []) drawEdge(kid, containerEl, d, n, extraRight)
  }

  if (direction === DrawTreeDirection.Left_Right) {
    const weights = data.children.map((c: any) => c.weight ?? 0)
    log.debug('xxxxxxxxxxxxxx  weights: ', weights)
    const result = partition(weights)
    log.debug('xxxxxxxxxxxxxx  after partition result: ', result)
    const [, idxArr] = result
    const leftChildren: any[] = []
    const rightChildren: any[] = []
    idxArr.forEach((i: number, idx: number) => {
      if (i === 0) {
        leftChildren.push(data.children[idx])
      } else if (i === 1) {
        rightChildren.push(data.children[idx])
      }
    })
    const dataLeft = { ...data, children: leftChildren }
    const dataRight = { ...data, children: rightChildren }

    const treeLeft = treeLayout.hierarchy(dataLeft)
    const treeRight = treeLayout.hierarchy(dataRight)
    treeLayout(treeLeft)
    treeLayout(treeRight)
    log.debug('treeRight', treeRight)
    const withRight = treeRight.data.width - 50
    positionNode(treeLeft, DrawTreeDirection.Left)
    positionNode(treeRight, DrawTreeDirection.Right, withRight)
    drawEdge(treeLeft, edgesElem, DrawTreeDirection.Left, undefined, withRight)
    drawEdge(treeRight, edgesElem, DrawTreeDirection.Right, undefined, withRight)
  } else {
    const tree = treeLayout.hierarchy(data)
    treeLayout(tree)
    positionNode(tree, direction)
    drawEdge(tree, edgesElem, direction)
  }
}

async function drawRadialMindMap(data: MindmapNode, edgesElem: D3Element) {
  // Next step is to layout the mindmap, giving each node a position
  const { nodes, links } = layoutMindmap(data)

  // After this we can draw, first the edges and the then nodes with the correct position
  drawEdges(edgesElem, links)
  positionNodes(nodes)
}

const layoutStrategyMap = {
  [DrawTreeDirection.Left]: drawLeftRightMindMap,
  [DrawTreeDirection.Right]: drawLeftRightMindMap,
  [DrawTreeDirection.Up]: drawLeftRightMindMap,
  [DrawTreeDirection.Down]: drawLeftRightMindMap,
  [DrawTreeDirection.Left_Right]: drawLeftRightMindMap,
  [DrawTreeDirection.Radial]: drawRadialMindMap,
}

export const draw: DrawDefinition = async (
  node: MindmapNode,
  id: string,
  opts: DrawOptions = {} as DrawOptions,
) => {
  log.debug('Rendering mindmap diagram node : \n', node, ', id: ', id, ', opts: ', opts)
  const { sitetheme, themeIds, shapeIds, linkshapeIds, borderIds } = opts
  const colorschemeIdx = themeIds[0] ?? 0
  const direction = themeIds[1] ?? DrawTreeDirection.Left_Right
  const drawFunc =
    layoutStrategyMap[direction as keyof typeof layoutStrategyMap] ?? drawLeftRightMindMap
  log.debug('drawFunc : ', drawFunc, layoutStrategyMap)

  if (!node) {
    return
  }

  const htmlLabels = false

  const svg = selectSvgElement(id)

  // Draw the graph and start with drawing the nodes without proper position
  // this gives us the size of the nodes and we can set the positions later

  const edgesElem = svg.append('g')
  edgesElem.attr('class', 'mindmap-edges')
  const nodesElem = svg.append('g')
  nodesElem.attr('class', 'mindmap-nodes')
  drawNodes(nodesElem, node as FilledMindMapNode, opts, -1)

  const renderOpts = {
    ...opts,
    colorschemeIdx,
    direction,
  }

  await drawFunc(node, edgesElem, renderOpts)
  // drawRadialMindMap(node, edgesElem);

  signSvg(svg, { sitetheme })

  // Setup the view box and size of the svg element
  const padding = 5
  const useMaxWidth = false
  setupGraphViewbox(undefined, svg, padding, useMaxWidth)
}

export default {
  draw,
}
