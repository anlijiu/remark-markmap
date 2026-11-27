export function inlineCode(state: any, node: any) {
  /** @type {Text} */
  const text = { type: 'text', value: node.value.replace(/\r?\n|\r/g, ' ') }
  state.patch(node, text)

  /** @type {Element} */
  const result = {
    type: 'element',
    tagName: 'code',
    properties: {
      display: 'inline',
    },
    children: [text],
  }
  state.patch(node, result)
  return state.applyData(node, result)
}
