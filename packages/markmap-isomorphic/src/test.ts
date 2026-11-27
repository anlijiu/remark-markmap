import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { createMarkmapRenderer } from './markmap-isomorphic.js'
import type { MindmapNode } from './types.js'

const simpleNode = (id: number, descr: string): MindmapNode => ({
  children: [],
  descr,
  id,
  level: 0,
  nodeId: `node-${id}`,
  padding: 8,
  type: 0,
  width: 120,
})

function createMockBrowserType() {
  const events = {
    addScriptTags: [] as unknown[],
    addStyleTags: [] as unknown[],
    browserClosed: 0,
    contextClosed: 0,
    gotoUrls: [] as string[],
    launchOptions: [] as unknown[],
    locatorSelectors: [] as string[],
    screenshots: 0,
  }

  const browserType = {
    async launch(launchOptions?: unknown) {
      events.launchOptions.push(launchOptions)

      const context = {
        async close() {
          events.contextClosed += 1
        },
        async newPage() {
          return {
            addScriptTag(tag: unknown) {
              events.addScriptTags.push(tag)
              return Promise.resolve()
            },
            addStyleTag(tag: unknown) {
              events.addStyleTags.push(tag)
              return Promise.resolve()
            },
            close() {
              return Promise.resolve()
            },
            evaluate(
              _fn: unknown,
              arg: { diagrams: MindmapNode[]; prefix: string; screenshot: boolean },
            ) {
              return Promise.resolve(
                arg.diagrams.map((diagram, index) => ({
                  status: 'fulfilled' as const,
                  value: {
                    height: 100 + index,
                    id: `${arg.prefix}-${index}`,
                    svg: `<svg id="${arg.prefix}-${index}"><title>${diagram.descr}</title></svg>`,
                    title: diagram.descr,
                    width: 200 + index,
                  },
                })),
              )
            },
            goto(url: string) {
              events.gotoUrls.push(url)
              return Promise.resolve()
            },
            locator(selector: string) {
              events.locatorSelectors.push(selector)
              return {
                screenshot() {
                  events.screenshots += 1
                  return Promise.resolve(Buffer.from(selector))
                },
              }
            },
            off() {
              return undefined
            },
            on() {
              return undefined
            },
          }
        },
      }

      return {
        async close() {
          events.browserClosed += 1
        },
        async newContext() {
          return context
        },
      }
    },
  }

  return { browserType, events }
}

describe('createMarkmapRenderer', () => {
  test('renders multiple diagrams and loads css resources', async () => {
    const { browserType, events } = createMockBrowserType()
    const renderer = createMarkmapRenderer({ browserType: browserType as never })

    const results = await renderer([simpleNode(1, 'alpha'), simpleNode(2, 'beta')], {
      css: ['file:///fonts/a.css', new URL('file:///fonts/b.css')],
      prefix: 'custom',
      shape: '12',
      theme: '34',
    })

    assert.equal(results.length, 2)
    assert.equal(results[0].status, 'fulfilled')
    assert.equal(results[1].status, 'fulfilled')
    assert.deepEqual(
      results.map((result) => result.status === 'fulfilled' && result.value.id),
      ['custom-0', 'custom-1'],
    )
    assert.equal(events.gotoUrls.length, 1)
    assert.equal(events.addScriptTags.length, 1)
    assert.equal(events.addStyleTags.length, 2)
    assert.equal(events.contextClosed, 1)
    assert.equal(events.browserClosed, 1)
  })

  test('adds screenshots in node mode', async () => {
    const { browserType, events } = createMockBrowserType()
    const renderer = createMarkmapRenderer({ browserType: browserType as never })

    const [result] = await renderer([simpleNode(1, 'shot')], {
      prefix: 'mm',
      screenshot: true,
    })

    assert.equal(result.status, 'fulfilled')
    assert.ok(result.value.screenshot)
    assert.deepEqual(events.locatorSelectors, ['#mm-0'])
    assert.equal(events.screenshots, 1)
  })

  test('reuses the browser for concurrent renders', async () => {
    const { browserType, events } = createMockBrowserType()
    const renderer = createMarkmapRenderer({ browserType: browserType as never })

    const [first, second] = await Promise.all([
      renderer([simpleNode(1, 'one')]),
      renderer([simpleNode(2, 'two')]),
    ])

    assert.equal(first[0].status, 'fulfilled')
    assert.equal(second[0].status, 'fulfilled')
    assert.equal(events.launchOptions.length, 1)
    assert.equal(events.contextClosed, 1)
    assert.equal(events.browserClosed, 1)
  })
})
