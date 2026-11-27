import type { Node } from 'unist'
import type { Element, ElementContent } from 'hast'
import type { MindmapNode } from './types'

import { decodeEntities, uint8ArrayToHex, uint8ArrayFromHex } from './utils'
import theme from './theme'
import { log } from './logger'
import { borderType, nodeType } from './types'
import { toHtml } from 'hast-util-to-html'
import { toText } from 'hast-util-to-text'

const scale = 0.5

const heads = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']

const uniqId = Math.random().toString(36).slice(2, 8)
let globalIndex = -1
function getId(): string {
  globalIndex += 1
  return `mm-${uniqId}-${globalIndex}`
}

export type BuildTreeOpts = {
  theme?: Uint8Array | number[]
  border?: Uint8Array | number[]
  shape?: Uint8Array | number[]
  linkshape?: Uint8Array | number[]
}

type FuncBuildTree = (nodes: Element[], opts?: BuildTreeOpts) => MindmapNode

function consumeHeading(node: Element, stack: MindmapNode[], level: number) {
  let current = stack[stack.length - 1]
  while (current?.level >= level) {
    log.debug(`${current?.level} >= ${level}`)
    stack.pop()
    current = stack[stack.length - 1]
  }

  // log.debug("consumeHeading current: ", current, stack.length - 1, stack)
  const item: MindmapNode = {
    nodeId: getId(),
    id: globalIndex,
    type: theme.nodeType(level),
    // type: nodeType.ROUNDED_RECT,//DEFAULT,
    // type: nodeType.DEFAULT,
    level,
    weight: 1,
    descr: toText(node),
    children: [],
    contents: [node],
    width: 200,
    padding: 5,
  }
  current?.children.push(item)
  recomputeAncestorsWeight(stack)
  stack.push(item)
}

function recomputeAncestorsWeight(stack: MindmapNode[]) {
  if (!Array.isArray(stack) || stack.length <= 1) return
  let s = 0.5
  for (let i = stack.length - 1; i >= 0; i--) {
    const item = stack[i]
    if (!item) continue
    item.weight = (item.weight ?? 0) + s
    s /= 2
  }
}

function consumeListItem(node: Element, current: MindmapNode, stack: MindmapNode[]) {
  const level = (current?.level || 0) + 1

  const [ulist, olist, contents] = node.children.reduce<[any[], any[], any[]]>(
    function (total, curr: any) {
      if (curr.tagName === 'ul') {
        total[0].push(curr)
      } else if (curr.tagName === 'ol') {
        total[1].push(curr)
      } else {
        total[2].push(curr)
      }
      return total
    },
    [[], [], []],
  )
  log.debug('consumeListItem  ulist: ', () => JSON.stringify(ulist, undefined, 2))
  log.debug('consumeListItem  olist: ', () => JSON.stringify(olist, undefined, 2))
  log.debug('consumeListItem  contents: ', () => JSON.stringify(contents, undefined, 2))
  const item: MindmapNode = {
    nodeId: getId(),
    id: globalIndex,
    type: theme.nodeType(level),
    // type: nodeType.DEFAULT,
    // type: nodeType.RECT,
    level,
    descr: '',
    weight: 1,
    contents: contents,
    children: [],
    width: 200,
    padding: 5,
  }
  recomputeAncestorsWeight(stack)
  current?.children.push(item)
  if (ulist.length > 0 || olist.length > 0) {
    stack.push(item)
    ulist.forEach((l) => consumeList(l.children, stack, 0))
    olist.forEach((l) => consumeList(l.children, stack, 1))
  }
}
function consumeList(nodes: ElementContent[], stack: MindmapNode[], ordered: number) {
  const current = stack[stack.length - 1]
  for (let i = 0; i < nodes.length; ++i) {
    const node = nodes[i]
    if (node.type === 'element' && node.tagName === 'li') {
      consumeListItem(node, current, stack)
    }
  }
}

const defaultOpts = {
  theme: [],
  border: [],
  shape: [],
  linkshape: [],
}
export const buildTree: FuncBuildTree = (nodes, opts = defaultOpts) => {
  const parsedOpts = {
    themeIds: uint8ArrayFromHex(opts.theme),
    borderIds: uint8ArrayFromHex(opts.border),
    shapeIds: uint8ArrayFromHex(opts.shape),
    linkshapeIds: uint8ArrayFromHex(opts.linkshape),
  }
  theme.updateByThemeOpts(parsedOpts)

  log.debug('buildTree: opts: ', opts)
  const root: MindmapNode = {
    nodeId: getId(),
    id: globalIndex,
    // type: nodeType.DEFAULT,
    type: borderType.NO_BORDER,
    level: -1,
    weight: 1,
    descr: '',
    children: [],
    contents: [],
    width: 200,
    padding: 5,
  }

  const stack = [root]
  log.debug('buildTree nodes.length: ', nodes.length - 1)
  const level = 0
  for (let i = 0; i < nodes.length; ++i) {
    const node = nodes[i]
    const idx = heads.indexOf(node.tagName)
    if (idx !== -1) {
      consumeHeading(node, stack, idx)
    }

    if (node.tagName === 'ul') {
      consumeList(node.children, stack, 0)
    }
    if (node.tagName === 'ol') {
      consumeList(node.children, stack, 1)
    }
  }
  log.debug('buildTree  root: ', () => JSON.stringify(root, undefined, 2))
  if (root.children.length === 1) return root.children[0]
  return root
}

export const walkTree = (
  tree: any,
  callback: (...a: any[]) => any,
  key = 'children',
  ...args: any[]
): void => {
  log.debug('walkTree  in tree: ', tree)
  if (Array.isArray(tree)) {
    tree.forEach((treeItem: any) => walkTree(treeItem, callback, key, ...args))
  } else {
    const keepDigging = callback(tree, ...args)
    if (keepDigging && tree[key]) {
      tree[key]?.forEach((treeItem: any) => walkTree(treeItem, callback, key, ...args))
    }
  }
}

export default {
  buildTree,
  walkTree,
}
