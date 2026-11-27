import { toHex } from 'khroma'
import invert from './theme/color/invert'
import type { HexColor } from './theme/color/invert'
import { createText } from './text'
import type { Point, D3Element, FilledMindMapNode, MindmapDB } from './types'
import db from './db'
import { nodeType } from './types'
import { log } from './logger'
import theme from './theme'

// import { parseFontSize } from '../../utils.js';

const MAX_SECTIONS = 12

type ShapeFunction = (
  db: MindmapDB,
  elem: D3Element,
  node: FilledMindMapNode,
  bgColor: string,
  borderColor: HexColor,
  borderType: number,
) => void

const drawBorder = (p: D3Element, c: HexColor, borderType: number) => {
  if (borderType === 1) {
    p.attr('stroke', c).attr('stroke-width', '3')
  } else if (borderType === 2) {
    p.attr('stroke', c).attr('stroke-width', '3')
  } else if (borderType === 3) {
    p.attr('stroke', c)
      .attr('stroke-dasharray', '10,5')
      .attr('stroke-linecap', 'butt')
      .attr('stroke-width', '3')
  } else if (borderType === 4) {
    p.attr('stroke', c)
      .attr('stroke-dasharray', '10,5')
      .attr('stroke-linecap', 'butt')
      .attr('stroke-width', '3')
  } else if (borderType === 0) {
    return
  }
}

const defaultBkg: ShapeFunction = function (db, elem, node, bgColor, borderColor, borderType) {
  log.debug('defaultBkg   borderType: ', borderType)
  const rd = 5
  elem
    .append('path')
    .attr('id', 'node-' + node.id)
    .attr('class', 'node-bkg node-' + db.type2Str(node.type))
    .attr(
      'd',
      `M0 ${node.height - rd} v${-node.height + 2 * rd} q0,-5 5,-5 h${
        node.width - 2 * rd
      } q5,0 5,5 v${node.height - rd} H0 Z`,
    )

  const p = elem.selectAll('path').attr('style', `fill: ${bgColor};`)

  if (borderType > 0) {
    drawBorder(p, borderColor, borderType)
  }
}

const rectBkg: ShapeFunction = function (db, elem, node, bgColor, borderColor, borderType) {
  log.debug('rectBkg  borderType: ', borderType)
  elem
    .append('rect')
    .attr('id', 'node-' + node.id)
    .attr('class', 'node-bkg node-' + db.type2Str(node.type))
    .attr('height', node.height)
    .attr('width', node.width)

  const p = elem.selectAll('rect').attr('style', `fill: ${bgColor};`)

  if (borderType > 0) {
    drawBorder(p, borderColor, borderType)
  }
}

const cloudBkg: ShapeFunction = function (db, elem, node, bgColor, borderColor, borderType) {
  const w = node.width
  const h = node.height
  const r1 = 0.15 * w
  const r2 = 0.25 * w
  const r3 = 0.35 * w
  const r4 = 0.2 * w
  elem
    .append('path')
    .attr('id', 'node-' + node.id)
    .attr('class', 'node-bkg node-' + db.type2Str(node.type))
    .attr(
      'd',
      `M0 0 a${r1},${r1} 0 0,1 ${w * 0.25},${-1 * w * 0.1}
      a${r3},${r3} 1 0,1 ${w * 0.4},${-1 * w * 0.1}
      a${r2},${r2} 1 0,1 ${w * 0.35},${1 * w * 0.2}

      a${r1},${r1} 1 0,1 ${w * 0.15},${1 * h * 0.35}
      a${r4},${r4} 1 0,1 ${-1 * w * 0.15},${1 * h * 0.65}

      a${r2},${r1} 1 0,1 ${-1 * w * 0.25},${w * 0.15}
      a${r3},${r3} 1 0,1 ${-1 * w * 0.5},${0}
      a${r1},${r1} 1 0,1 ${-1 * w * 0.25},${-1 * w * 0.15}

      a${r1},${r1} 1 0,1 ${-1 * w * 0.1},${-1 * h * 0.35}
      a${r4},${r4} 1 0,1 ${w * 0.1},${-1 * h * 0.65}

    H0 V0 Z`,
    )

  const p = elem.selectAll('path')
  p.attr('style', `fill: ${bgColor};`)

  if (borderType > 0) {
    drawBorder(p, borderColor, borderType)
  }
}

const bangBkg: ShapeFunction = function (db, elem, node, bgColor, borderColor, borderType) {
  const w = node.width
  const h = node.height
  const r = 0.15 * w
  elem
    .append('path')
    .attr('id', 'node-' + node.id)
    .attr('class', 'node-bkg node-' + db.type2Str(node.type))
    .attr(
      'd',
      `M0 0 a${r},${r} 1 0,0 ${w * 0.25},${-1 * h * 0.1}
      a${r},${r} 1 0,0 ${w * 0.25},${0}
      a${r},${r} 1 0,0 ${w * 0.25},${0}
      a${r},${r} 1 0,0 ${w * 0.25},${1 * h * 0.1}

      a${r},${r} 1 0,0 ${w * 0.15},${1 * h * 0.33}
      a${r * 0.8},${r * 0.8} 1 0,0 ${0},${1 * h * 0.34}
      a${r},${r} 1 0,0 ${-1 * w * 0.15},${1 * h * 0.33}

      a${r},${r} 1 0,0 ${-1 * w * 0.25},${h * 0.15}
      a${r},${r} 1 0,0 ${-1 * w * 0.25},${0}
      a${r},${r} 1 0,0 ${-1 * w * 0.25},${0}
      a${r},${r} 1 0,0 ${-1 * w * 0.25},${-1 * h * 0.15}

      a${r},${r} 1 0,0 ${-1 * w * 0.1},${-1 * h * 0.33}
      a${r * 0.8},${r * 0.8} 1 0,0 ${0},${-1 * h * 0.34}
      a${r},${r} 1 0,0 ${w * 0.1},${-1 * h * 0.33}

    H0 V0 Z`,
    )

  const p = elem.selectAll('path')
  p.attr('style', `fill: ${bgColor};`)

  if (borderType > 0) {
    drawBorder(p, borderColor, borderType)
  }
}

const circleBkg: ShapeFunction = function (db, elem, node, bgColor, borderColor, borderType) {
  elem
    .append('circle')
    .attr('id', 'node-' + node.id)
    .attr('class', 'node-bkg node-' + db.type2Str(node.type))
    .attr('r', node.width / 2)

  const p = elem.selectAll('circle')
  p.attr('style', `fill: ${bgColor};`)
  if (borderType > 0) {
    drawBorder(p, borderColor, borderType)
  }

  node.height = node.width
}

function insertPolygonShape(
  parent: D3Element,
  w: number,
  h: number,
  points: Point[],
  node: FilledMindMapNode,
) {
  return parent
    .insert('polygon', ':first-child')
    .attr(
      'points',
      points
        .map(function (d) {
          return d.x + ',' + d.y
        })
        .join(' '),
    )
    .attr('transform', 'translate(' + (node.width - w) / 2 + ', ' + h + ')')
}

const hexagonBkg: ShapeFunction = function (
  _db: MindmapDB,
  elem: D3Element,
  node: FilledMindMapNode,
  bgColor: any,
  borderColor: any,
  borderType: number = 0,
) {
  const h = node.height
  const f = 4
  const m = h / f
  const w = node.width - node.padding + 2 * m
  const points: Point[] = [
    { x: m, y: 0 },
    { x: w - m, y: 0 },
    { x: w, y: -h / 2 },
    { x: w - m, y: -h },
    { x: m, y: -h },
    { x: 0, y: -h / 2 },
  ]
  insertPolygonShape(elem, w, h, points, node)

  if (borderType > 0) {
    const p = elem.selectAll('polygon')
    drawBorder(p, borderColor, borderType)
  }
}

const roundedRectBkg: ShapeFunction = function (db, elem, node, bgColor, borderColor, borderType) {
  elem
    .append('rect')
    .attr('id', 'node-' + node.id)
    .attr('class', 'node-bkg node-' + db.type2Str(node.type))
    .attr('height', node.height)
    .attr('rx', node.padding)
    .attr('ry', node.padding)
    .attr('width', node.width)
  elem.selectAll('rect').attr('style', `fill: ${bgColor};`)

  if (borderType > 0) {
    const p = elem.selectAll('rect')
    drawBorder(p, borderColor, borderType)
  }
}

/**
 * @param db - The database
 * @param elem - The D3 dom element in which the node is to be added
 * @param node - The node to be added
 * @param fullSection - root section
 * @param idx - current node section
 * @param conf - The configuration object
 * @returns The height nodes dom element
 */
export const drawNode = function (
  elem: D3Element,
  node: FilledMindMapNode,
  opts: any,
  rootSection: number,
  idx: number,
): number {
  const { themeIds, shapeIds, linkshapeIds, borderIds } = opts

  // const htmlLabels = conf.htmlLabels;
  const htmlLabels = true
  const section = rootSection % (MAX_SECTIONS - 1)
  const nodeElem = elem.append('g')
  node.section = section
  // let sectionClass = 'section-' + section;
  let sectionClass = 'section-' + section
  if (section < 0) {
    sectionClass += ' section-root'
  }

  const borderType = theme.borderType(node.level)
  const bgColor = theme.nodeBackgroundColor({ level: node.level, section, idx })
  const fgColor = theme.nodeForegroundColor({ level: node.level, section, idx })
  const borderColor = theme.borderColor({ level: node.level, section, idx })
  node.bgColor = bgColor
  node.fgColor = fgColor

  nodeElem.attr(
    'class',
    (node.class ? node.class + ' ' : '') +
      'mindmap-node ' +
      sectionClass +
      ` node-level-${node.level}`,
  )

  const bkgElem = nodeElem.append('g')

  // Create the wrapped text element
  const textElem = nodeElem.append('g')
  const fontSize = theme.fontSize(node.level)
  const description = node.descr?.replace(/(<br\/*>)/g, '\n') ?? ''
  const contents = node.contents as any
  const textResult = createText(textElem, description, contents, {
    useHtmlLabels: htmlLabels,
    width: node.width,
    classes: 'mindmap-node-label',
    fontFamily: theme.defaultFontFamily,
    fontSize,
  })
  const hasCodeTag = textElem.selectAll('code').size() > 0
  const hasImage = textElem.selectAll('image').size() > 0
  if (hasImage) {
    node.type = nodeType.DEFAULT
  }

  if (hasCodeTag) {
    // node.bgColor = '#FAFAFA'
    // bgColor = '#FAFAFA'
  }

  log.debug('fffffffffffffontsize : ', fontSize)
  if (!htmlLabels) {
    textElem
      .attr('dy', '1em')
      .attr('alignment-baseline', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('text-anchor', 'middle')
  }

  const tt = textElem.selectAll('text')
  tt.attr('font-size', `${fontSize}px`)
  const bbox = textResult?.measurement ?? textElem.node().getBBox()
  if (hasImage) {
    node.height = bbox.height
    node.width = bbox.width
  } else {
    node.height = bbox.height + fontSize! * 1.1 * 0.5 + node.padding
    node.width = bbox.width + fontSize! * 2.1 * 0.5 + 2 * node.padding
  }
  if (node.icon) {
    if (node.type === nodeType.CIRCLE) {
      const icon = nodeElem
        .append('foreignObject')
        .attr('height', '50px')
        .attr('width', node.width)
        .attr('style', 'text-align: center;')
      icon
        .append('div')
        .attr('class', 'icon-container')
        .append('i')
        .attr('class', 'node-icon-' + section + ' ' + node.icon)
      textElem.attr(
        'transform',
        'translate(' + node.width / 2 + ', ' + (node.height / 2 - 1.5 * node.padding) + ')',
      )
    } else {
      const orgHeight = node.height
      node.height = Math.max(orgHeight, 60)
      const heightDiff = Math.abs(node.height - orgHeight)
      const icon = nodeElem
        .append('foreignObject')
        .attr('width', '60px')
        .attr('height', node.height)
        .attr('style', 'text-align: center;margin-top:' + heightDiff / 2 + 'px;')

      icon
        .append('div')
        .attr('class', 'icon-container')
        .append('i')
        .attr('class', 'node-icon-' + section + ' ' + node.icon)
      textElem.attr(
        'transform',
        'translate(' + (25 + node.width / 2) + ', ' + node.padding / 2 + ')',
      )
    }
  } else {
    if (node.type === nodeType.CIRCLE) {
      node.margin = 10
      log.debug('nodeType.CIRCLE  node: ', node)
    }
    if (!htmlLabels) {
      const dx = node.width / 2
      const dy = node.padding / 2
      textElem.attr('transform', 'translate(' + dx + ', ' + dy + ')')
      // textElem.attr('transform', 'translate(' + node.width / 2 + ', ' + node.padding / 2 + ')');
    } else {
      const dx = (node.width - bbox.width) / 2
      const dyNormal = (node.height - bbox.height) / 2
      const dyCircle = (node.width - bbox.height) / 2
      const dy = node.type === nodeType.CIRCLE ? dyCircle : dyNormal
      textElem.attr('transform', 'translate(' + dx + ', ' + dy + ')')
    }
  }

  if (!hasImage) {
    switch (node.type) {
      case nodeType.DEFAULT:
        defaultBkg(db, bkgElem, node, bgColor, borderColor, borderType)
        break
      case nodeType.ROUNDED_RECT:
        roundedRectBkg(db, bkgElem, node, bgColor, borderColor, borderType)
        break
      case nodeType.RECT:
        rectBkg(db, bkgElem, node, bgColor, borderColor, borderType)
        break
      case nodeType.CIRCLE:
        bkgElem.attr('transform', 'translate(' + node.width / 2 + ', ' + +node.width / 2 + ')')
        circleBkg(db, bkgElem, node, bgColor, borderColor, borderType)
        break
      case nodeType.CLOUD:
        cloudBkg(db, bkgElem, node, bgColor, borderColor, borderType)
        break
      case nodeType.BANG:
        bangBkg(db, bkgElem, node, bgColor, borderColor, borderType)
        break
      case nodeType.HEXAGON:
        hexagonBkg(db, bkgElem, node, bgColor, borderColor, borderType)
        break
    }
  }
  db.setElementForId(node.id, nodeElem)
  return node.height
}

export const positionNode = function (node: FilledMindMapNode) {
  const nodeElem = db.getElementById(node.id)

  const x = node.x || 0
  const y = node.y || 0
  // Position the node to its coordinate
  nodeElem.attr('transform', 'translate(' + x + ',' + y + ')')
  log.debug('ppppppppppppositionNode  node: ', node)
}

export const signSvg = function (root: D3Element, opts: any = {}) {
  const { sitetheme = 'light' } = opts
  const bbox = root.node().getBBox()
  const marginX = bbox.width + bbox.x
  const marginY = bbox.height + bbox.y

  //   <a href="https://www.w3schools.com/graphics/" target="_blank">
  //   <text x="5" y="15" fill="red">I love SVG!</text>
  // </a>
  const signedLinkElm = root
    .append('a')
    .attr('xlink:href', 'https://www.anlijiu.com/tools/mindmap')
    .attr('target', '_blank')
    .attr('style', `text-decoration: none`)
  const signdTextElm = signedLinkElm
    .append('text')
    .text('@anlijiu')
    .attr('fill', sitetheme == 'light' ? '#ccc' : '#333')
    .attr('font-family', '"trebuchet ms", verdana, arial, sans-serif')

  const textbbox = signdTextElm.node().getBBox()
  signdTextElm.attr('x', marginX - textbbox.width).attr('y', marginY + textbbox.height)
}
