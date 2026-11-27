import { log } from './logger'

/**
 * Turn an mdast `markmap` node into hast.
 *
 * @param {State} state
 *   Info passed around.
 * @param {List} node
 *   mdast node.
 * @returns {Element}
 *   hast node.
 */
export function markmap(state: any, node: any) {
  log.debug('3rdparty markmap handler node: ', node)

  const own = {}.hasOwnProperty
  const data = node.data || {}
  /** @type {HastElement | HastText} */
  const result =
    'value' in node && !(own.call(data, 'hProperties') || own.call(data, 'hChildren'))
      ? { type: 'markmap', value: node.value }
      : {
          type: 'element',
          tagName: 'markmap',
          properties: {},
          children: state.all(node),
        }

  state.patch(node, result)
  return state.applyData(node, result)
}
