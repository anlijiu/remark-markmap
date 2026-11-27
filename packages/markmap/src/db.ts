import { log } from './logger'
import type { D3Element, MindmapNode } from './types'
import { nodeType } from './types'

let nodes: MindmapNode[] = []
let cnt = 0
let elements: Record<number, D3Element> = {}

const clear = () => {
  nodes = []
  cnt = 0
  elements = {}
}

const getParent = function (level: number) {
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (nodes[i].level < level) {
      return nodes[i]
    }
  }
  // No parent found
  return null
}

const getMindmap = () => {
  return nodes.length > 0 ? nodes[0] : null
}

const getType = (startStr: string, endStr: string): number => {
  log.debug('In get type', startStr, endStr)
  switch (startStr) {
    case '[':
      return nodeType.RECT
    case '(':
      return endStr === ')' ? nodeType.ROUNDED_RECT : nodeType.CLOUD
    case '((':
      return nodeType.CIRCLE
    case ')':
      return nodeType.CLOUD
    case '))':
      return nodeType.BANG
    case '{{':
      return nodeType.HEXAGON
    default:
      return nodeType.DEFAULT
  }
}

const setElementForId = (id: number, element: D3Element) => {
  elements[id] = element
}

const type2Str = (type: number) => {
  switch (type) {
    case nodeType.DEFAULT:
      return 'no-border'
    case nodeType.RECT:
      return 'rect'
    case nodeType.ROUNDED_RECT:
      return 'rounded-rect'
    case nodeType.CIRCLE:
      return 'circle'
    case nodeType.CLOUD:
      return 'cloud'
    case nodeType.BANG:
      return 'bang'
    case nodeType.HEXAGON:
      return 'hexgon' // cspell: disable-line
    default:
      return 'no-border'
  }
}

// Expose logger to grammar
const getLogger = () => log
const getElementById = (id: number) => elements[id]

const db = {
  clear,
  getMindmap,
  setElementForId,
  type2Str,
  getLogger,
  getElementById,
} as const

export default db
