import type {
  createMarkmapRenderer as nodeImplementation,
  MarkmapRenderer,
  RenderResult,
  RenderOptions,
} from './markmap-isomorphic.js'

import * as markmap from '@anlijiu/markmap'

const parser = new DOMParser()
const serializer = new XMLSerializer()

function getAriaValue(element: SVGSVGElement, attribute: string): string | undefined {
  const value = element.getAttribute(attribute)
  if (!value) {
    return
  }

  let result = ''
  for (const id of value.split(/\s+/)) {
    const node = element.getElementById(id)
    if (node) {
      result += node.textContent
    }
  }
  return result
}

let count = 0

const renderer: MarkmapRenderer = async (diagrams, options) => {
  const container = document.createElement('div')
  container.ariaHidden = 'true'
  container.style.maxHeight = '0'
  container.style.opacity = '0'
  container.style.overflow = 'hidden'

  document.body.append(container)

  try {
    const {
      css: _css,
      prefix = 'markmap',
      screenshot: _screenshot,
      ...renderOptions
    } = (options ?? {}) as RenderOptions

    return await Promise.allSettled(
      diagrams.map(async (diagram) => {
        const id = `${prefix}-${count}`
        count += 1

        const { svg } = await markmap.render(id, diagram, renderOptions, container)
        const root = parser.parseFromString(svg, 'text/html')
        const [element] = root.getElementsByTagName('svg')
        const { height, width } = element.viewBox.baseVal
        const description = getAriaValue(element, 'aria-describedby')
        const title = getAriaValue(element, 'aria-labelledby')

        const result: RenderResult = {
          height,
          id,
          svg: serializer.serializeToString(element),
          width,
        }

        if (description) {
          result.description = description
        }

        if (title) {
          result.title = title
        }

        return result
      }),
    )
  } finally {
    container.remove()
  }
}

export const createMarkmapRenderer: typeof nodeImplementation = () => renderer
