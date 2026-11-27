# @anlijiu/markmap-isomorphic

Render [@anlijiu/markmap](https://github.com/anlijiu/remark-markmap) diagrams in Node.js or the browser.

This package is modeled after `mermaid-isomorphic`, but targets markmap trees and keeps using
`playwright-core` for the Node.js renderer.

## Installation

```sh
npm install @anlijiu/markmap-isomorphic playwright-core
```

Outside the browser, `@anlijiu/markmap-isomorphic` uses Playwright to spin up a browser page.
Because this package depends on `playwright-core`, you must provide a browser executable yourself
via `launchOptions`, `PLAYWRIGHT_BROWSERS_PATH`, or your environment-specific Playwright setup.

## Usage

```ts
import { createMarkmapRenderer } from '@anlijiu/markmap-isomorphic'

const renderer = createMarkmapRenderer()
const tree = {
  id: 1,
  nodeId: 'root',
  level: 0,
  descr: 'Root',
  type: 0,
  children: [],
  width: 160,
  padding: 8
}

const results = await renderer([tree], {
  prefix: 'markmap',
  theme: '11',
  sitetheme: 'light'
})
```

## API

### `createMarkmapRenderer(options?)`

Creates a renderer that reuses a single Playwright browser context across concurrent renders and
closes it once all in-flight renders are done.

#### `CreateMarkmapRendererOptions`

- `browserType`: the Playwright browser type to launch. Defaults to `chromium` from
  `playwright-core`.
- `browser`: deprecated alias for `browserType`.
- `launchOptions`: launch options forwarded to Playwright.

#### Renderer signature

```ts
(diagrams: MindmapNode[], options?: RenderOptions) => Promise<PromiseSettledResult<RenderResult>[]>
```

#### `RenderOptions`

- `css`: one URL or an iterable of URLs to custom CSS files.
- `prefix`: ID prefix for generated SVGs. Defaults to `markmap`.
- `screenshot`: when `true`, also returns PNG screenshots in Node.js.
- `theme`, `border`, `shape`, `linkshape`, `sitetheme`: forwarded to `@anlijiu/markmap`.

## Browser usage

The package also exposes a browser build via the `browser` export condition. In browser builds,
custom CSS must be loaded by your application, and `screenshot` is ignored.
