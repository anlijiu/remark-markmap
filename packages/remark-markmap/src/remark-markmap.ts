import { fromHtmlIsomorphic } from 'hast-util-from-html-isomorphic'
import {
  createMarkmapRenderer,
  type CreateMarkmapRendererOptions,
  type RenderOptions,
} from '@anlijiu/markmap-isomorphic'
import matter from 'gray-matter'
import rehypeMathjax from 'rehype-mathjax'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import type { VFile } from 'vfile'
import { visit } from 'unist-util-visit'
import { buildTree } from '@anlijiu/markmap'

import { inlineCode } from './handlers.js'
import { objectValueToString } from './utils.js'

interface MarkmapCodeBlockInstance {
  node: any
  parent: any
}

export interface RemarkMarkmapOptions
  extends CreateMarkmapRendererOptions, Omit<RenderOptions, 'screenshot'> {
  /**
   * Create a fallback node if processing of a mermaid diagram fails.
   *
   * @param node
   *   The mdast `code` node that couldn’t be rendered.
   * @param error
   *   The error message that was thrown.
   * @param file
   *   The file on which the error occurred.
   * @returns
   *   A fallback node to render instead of the invalid diagram. If nothing is returned, the code
   *   block is removed
   */

  errorFallback?: (node: any, error: string, file: VFile) => any
}

const parser = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkFrontmatter, { type: 'yaml', marker: '-' })
  .use(remarkMath)
  .use(remarkRehype, {
    allowDangerousHtml: true,
    handlers: {
      inlineCode: inlineCode,
    },
  })
  .use(rehypeMathjax, {
    svg: {
      scale: 1.4,
    },
  })

async function parseMarkmapDiagram(source: string) {
  const { content, data } = matter(source)
  const tree = parser.parse({ value: content })
  const hast = await parser.run(tree)
  const markmapOptions = objectValueToString({ ...data })

  return {
    diagram: buildTree(hast.children as any[], markmapOptions),
    renderOptions: markmapOptions,
  }
}

/**
 * @param options
 *   Options that may be used to tweak the output.
 */
export const remarkMarkmap = (options: RemarkMarkmapOptions = {}) => {
  const render = createMarkmapRenderer(options)

  return async function transformer(ast: any, file: VFile) {
    const instances: MarkmapCodeBlockInstance[] = []
    visit(ast, { type: 'code', lang: 'markmap' }, (node, _index, parent) => {
      if (parent) {
        instances.push({ node, parent })
      }
    })

    if (!instances.length) {
      return
    }

    const prepared = await Promise.all(
      instances.map(async (ancestors) => {
        const node = ancestors.node as { value: string }
        const parsed = await parseMarkmapDiagram(node.value)

        return {
          instance: ancestors,
          diagram: parsed.diagram,
          renderOptions: {
            ...options,
            ...parsed.renderOptions,
          },
        }
      }),
    )

    const results = await Promise.all(
      prepared.map(async ({ instance, diagram, renderOptions }) => {
        const [result] = await render([diagram], renderOptions)
        return { instance, result }
      }),
    )

    for (const { instance, result } of results) {
      const { node, parent } = instance
      const nodeIndex = parent.children.indexOf(node)

      if (result.status === 'fulfilled') {
        const { svg } = result.value
        const hChildren = fromHtmlIsomorphic(svg, { fragment: true, space: 'svg' } as any)
          .children as any[]
        parent.children[nodeIndex] = {
          type: 'paragraph',
          children: [{ type: 'html', value: svg }],
          data: { hChildren },
        }
      } else if (options.errorFallback) {
        const fallback = options.errorFallback(node, String(result.reason), file)
        if (fallback) {
          parent.children[nodeIndex] = fallback
        } else {
          parent.children.splice(nodeIndex, 1)
        }
      } else {
        const message = file.message(String(result.reason), {
          ruleId: 'remark-markmap',
          source: 'remark-markmap',
          ancestors: [parent, node],
        })
        message.fatal = true
        message.url = 'https://github.com/anlijiu/remark-markmap'
        throw message
      }
    }
  }
}

export default remarkMarkmap
