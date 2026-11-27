# @anlijiu/remark-markmap

A [remark](https://github.com/remarkjs/remark) plugin that renders `markmap` code blocks into inline SVG mindmaps.

Part of the [remark-markmap](https://github.com/anlijiu/remark-markmap) monorepo:

- `@anlijiu/markmap` — core renderer (tree building, layout, SVG drawing)
- `@anlijiu/markmap-isomorphic` — browser / Node.js renderer (Playwright on Node.js)
- `@anlijiu/remark-markmap` — this package

## Installation

```sh
npm install @anlijiu/remark-markmap
```

`playwright-core` is a dependency of this package, but Node.js rendering still needs a Chromium
executable. Point it to your browser via `launchOptions.executablePath`, or configure Playwright's
environment (`PLAYWRIGHT_BROWSERS_PATH`, etc.).

## Usage

```js
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import markmap from '@anlijiu/markmap'
import { remarkMarkmap } from '@anlijiu/remark-markmap'

const markdown = `
~~~markmap
---
theme: "56000000"
border: "11110000"
shape: "10000000"
linkshape: "00000000"
---
# Root
## Branch
~~~
`

const html = String(
  await unified()
    .use(remarkParse)
    .use(remarkMarkmap)
    .use(remarkRehype, { handlers: { markmap: markmap.markmapHandler } })
    .use(rehypeStringify)
    .process(markdown),
)
```

### Using a specific browser

```js
.use(remarkMarkmap, {
  launchOptions: { executablePath: '/usr/bin/google-chrome' },
})
```

## Options

`RemarkMarkmapOptions`:

- `browserType` / `launchOptions` — forwarded to `createMarkmapRenderer` in
  `@anlijiu/markmap-isomorphic`.
- `css` — one URL or an iterable of custom CSS URLs.
- `prefix` — ID prefix for generated SVGs. Defaults to `markmap`.
- `theme`, `border`, `shape`, `linkshape`, `sitetheme` — forwarded to `@anlijiu/markmap`.
- `errorFallback(node, error, file)` — return a fallback node when a diagram fails to render; if it
  returns nothing, the code block is removed.

`theme` / `border` / `shape` / `linkshape` are eight hex digit strings (one per depth level); see
the [monorepo README](https://github.com/anlijiu/remark-markmap#config) for the full list of values.

## License

MIT
