import type { BrowserType, LaunchOptions, Page } from 'playwright-core'

import { chromium } from 'playwright-core'

import { hookPageConsole } from './hook-page-console.js'
import type { MindmapNode, RenderResult } from './types.js'

export type { MindmapNode, RenderResult } from './types.js'

declare const markmap: {
  render: (
    id: string,
    node: MindmapNode,
    options?: Omit<RenderOptions, 'css' | 'prefix' | 'screenshot'>,
    svgContainingElement?: Element,
  ) => Promise<{ svg: string }>
}

export interface CreateMarkmapRendererOptions {
  /**
   * The Playwright browser to use.
   *
   * @default chromium
   */
  browserType?: BrowserType

  /**
   * Backwards compatible alias for `browserType`.
   *
   * @deprecated Use `browserType` instead.
   */
  browser?: BrowserType

  /**
   * The options used to launch the browser.
   */
  launchOptions?: LaunchOptions
}

export interface RenderOptions {
  /**
   * A URL that points to a custom CSS file to load.
   *
   * Use this to load custom fonts.
   *
   * This option is ignored in the browser. You need to include the CSS in your build manually.
   */
  css?: Iterable<string | URL> | string | URL | undefined

  /**
   * The prefix of the id.
   *
   * @default 'markmap'
   */
  prefix?: string | undefined

  /**
   * If true, a PNG screenshot of the diagram will be added.
   *
   * This is only supported in Node.js.
   */
  screenshot?: boolean

  /**
   * Serialized theme options forwarded to `@anlijiu/markmap`.
   */
  theme?: string | undefined

  /**
   * Serialized border options forwarded to `@anlijiu/markmap`.
   */
  border?: string | undefined

  /**
   * Serialized node-shape options forwarded to `@anlijiu/markmap`.
   */
  shape?: string | undefined

  /**
   * Serialized link-shape options forwarded to `@anlijiu/markmap`.
   */
  linkshape?: string | undefined

  /**
   * Site theme forwarded to `@anlijiu/markmap`.
   *
   * @default 'light'
   */
  sitetheme?: string | undefined
}

export type MarkmapRenderer = (
  diagrams: MindmapNode[],
  options?: RenderOptions,
) => Promise<PromiseSettledResult<RenderResult>[]>

interface RenderDiagramsOptions extends Required<Pick<RenderOptions, 'prefix' | 'screenshot'>> {
  diagrams: MindmapNode[]
  renderOptions: Omit<RenderOptions, 'css' | 'prefix' | 'screenshot'>
}

/* c8 ignore start */
async function renderDiagrams({
  diagrams,
  prefix,
  renderOptions,
  screenshot,
}: RenderDiagramsOptions): Promise<PromiseSettledResult<RenderResult>[]> {
  await Promise.all(Array.from(document.fonts, (font) => font.load()))

  const parser = new DOMParser()
  const serializer = new XMLSerializer()
  const container = document.createElement('div')
  container.ariaHidden = 'true'
  container.style.maxHeight = '0'
  container.style.opacity = '0'
  container.style.overflow = 'hidden'

  document.body.append(container)

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

  try {
    return await Promise.allSettled(
      diagrams.map(async (diagram, index) => {
        const id = `${prefix}-${index}`

        try {
          const { svg } = await markmap.render(id, diagram, renderOptions, container)
          const root = parser.parseFromString(svg, 'text/html')
          const [element] = root.getElementsByTagName('svg')
          const { height, width } = element.viewBox.baseVal
          const description = getAriaValue(element, 'aria-describedby')
          const title = getAriaValue(element, 'aria-labelledby')

          if (screenshot) {
            document.body.append(element)
          }

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
        } catch (error) {
          throw error instanceof Error
            ? { name: error.name, stack: error.stack, message: error.message }
            : error
        }
      }),
    )
  } finally {
    container.remove()
  }
}
/* c8 ignore stop */

interface SimpleContext {
  close: () => Promise<void>
  newPage: () => Promise<Page>
}

async function getBrowser(
  browserType: BrowserType,
  launchOptions: LaunchOptions | undefined,
): Promise<SimpleContext> {
  const browser = await browserType.launch(launchOptions)
  const context = await browser.newContext({ bypassCSP: true })

  return {
    async close() {
      await context.close()
      await browser.close()
    },

    newPage() {
      return context.newPage()
    },
  }
}

export function createMarkmapRenderer(options: CreateMarkmapRendererOptions = {}): MarkmapRenderer {
  const { browserType = options.browser ?? chromium, launchOptions } = options

  let browserPromise: Promise<SimpleContext> | undefined
  let count = 0

  return async (diagrams, renderOptions) => {
    count += 1
    browserPromise ||= getBrowser(browserType, launchOptions)

    const context = await browserPromise
    const {
      css,
      prefix = 'markmap',
      screenshot = false,
      ...markmapRenderOptions
    } = renderOptions ?? {}

    let page: Page | undefined
    let renderResults: PromiseSettledResult<RenderResult>[]

    try {
      page = await context.newPage()
      hookPageConsole(page)
      await page.goto(import.meta.resolve('../index.html'))

      const promises = [
        page.addScriptTag({ url: import.meta.resolve('@anlijiu/markmap/dist/markmap.js') }),
      ]

      if (typeof css === 'string' || css instanceof URL) {
        promises.push(page.addStyleTag({ url: String(css) }))
      } else if (css) {
        for (const url of css) {
          promises.push(page.addStyleTag({ url: String(url) }))
        }
      }

      await Promise.all(promises)

      renderResults = await page.evaluate(renderDiagrams, {
        diagrams,
        prefix,
        renderOptions: markmapRenderOptions,
        screenshot,
      })

      if (screenshot) {
        for (const result of renderResults) {
          if (result.status === 'fulfilled') {
            result.value.screenshot = await page
              .locator(`#${result.value.id}`)
              .screenshot({ omitBackground: true })
          }
        }
      }
    } finally {
      await page?.close()
      count -= 1

      if (!count) {
        browserPromise = undefined
        await context.close()
      }
    }

    for (const result of renderResults) {
      if (result.status !== 'rejected') {
        continue
      }

      const { reason } = result
      if (reason && 'name' in reason && 'message' in reason && 'stack' in reason) {
        Object.setPrototypeOf(reason, Error.prototype)
      }
    }

    return renderResults
  }
}
