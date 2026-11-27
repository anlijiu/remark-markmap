#!/usr/bin/env node
/**
 * 渲染预览：把所有布局方向各渲染一遍，输出 HTML + PNG 到 .render-preview/。
 *
 * 用途：每次改动渲染相关代码后跑一次，肉眼过一遍所有方向，避免回归。
 *
 * 用法：
 *   node scripts/render-preview.mjs                 # 渲染全部方向
 *   node scripts/render-preview.mjs --only=radial   # 只渲染某个方向
 *   node scripts/render-preview.mjs --keep-html     # 保留中间 HTML（默认也保留）
 *
 * 环境变量：
 *   CHROME_PATH  指定 Chromium/Chrome 可执行文件路径
 *
 * 注意：Node 端渲染依赖 playwright-core 与可用的 Chromium。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import markmap from '@anlijiu/markmap'
import { remarkMarkmap } from '@anlijiu/remark-markmap'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, '.render-preview')

/** DrawTreeDirection 的取值，见 packages/markmap/src/types.ts */
const DIRECTIONS = [
  { value: 1, name: 'up', label: 'Up（向上发散）' },
  { value: 2, name: 'down', label: 'Down（向下发散）' },
  { value: 3, name: 'left', label: 'Left（向左发散）' },
  { value: 4, name: 'right', label: 'Right（向右发散）' },
  { value: 5, name: 'left-right', label: 'Left_Right（左右发散，默认）' },
  { value: 6, name: 'radial', label: 'Radial（力导向）' },
]

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean)

/** 一份固定的示例文档，覆盖多层级、长短标签、中英文混排 */
const SAMPLE_NODES = `# h1 *title*
h1content

+ *alist* 1 - 1
   txt
+ **alist** 1 - 2

## h2 **title**
- ~~blist~~ 2 - 1
- blist 2 - 2
- blist 3 [link](http://www.anlijiu.com)
- ![imagealt](https://cdn.pixabay.com/photo/2023/11/09/19/36/zoo-8378189_640.jpg "imagetitle =300x200")
### h3 ~~title~~
#### h4 - clist 1
1. cccclist1-1
2. cccclist1-2
#### h4 - clist 2
1. cccclist2-1
2. cccclist2-2
3. \`inline code\`
4. xx
   \`\`\` javascript
   console.log("code block");
   console.log("code block second line");
   \`\`\`
5. Katex - $x = {-b \\pm \\sqrt{b^2-4ac} \\over 2a}$
6. Block Katex - $$x = {-b \\pm \\sqrt{b^2-4ac} \\over 2a}$$

##### h5 title
- ddddd 1
- ddddd 2
   + eeee1
   + eeee2`

function buildMarkdown(direction) {
  // theme 编码：第一位 colorscheme，第二位 direction
  const theme = `0${direction}`
  return `~~~ markmap
---
theme: "${theme}"
border: "11110000"
shape: "10000000"
linkshape: "00000000"
---
${SAMPLE_NODES}~~~
`
}

function resolveChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK)
      return candidate
    } catch {
      // 继续尝试下一个
    }
  }
  throw new Error('找不到可用的 Chrome/Chromium。请安装，或用 CHROME_PATH 指定可执行文件路径。')
}

async function renderToHtml(markdown, executablePath) {
  const parser = unified()
    .use(remarkParse)
    .use(remarkMarkmap, { launchOptions: { executablePath } })
    .use(remarkRehype, { handlers: { markmap: markmap.markmapHandler } })
    .use(rehypeStringify)

  const file = await parser.process(markdown)
  return file.value
}

async function screenshot(browser, htmlPath, pngPath) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
  await page.goto('file://' + htmlPath)
  await page.waitForTimeout(400)
  await page.screenshot({ path: pngPath, fullPage: true })
  await page.close()
}

function writeIndex(results) {
  const cards = results
    .map(
      (r) => `    <section>
      <h2>${r.label}</h2>
      <img src="./${r.name}.png" alt="${r.name}">
    </section>`,
    )
    .join('\n')

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>render preview</title>
<style>
  body { margin: 0; padding: 24px; background: #f6f6f6; font-family: system-ui, sans-serif; }
  h1 { font-size: 20px; margin: 0 0 16px; }
  section { background: #fff; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
  h2 { font-size: 15px; margin: 0 0 12px; color: #444; font-weight: 600; }
  img { max-width: 100%; display: block; border: 1px solid #e5e5e5; border-radius: 4px; }
</style>
</head>
<body>
  <h1>markmap 渲染预览（全部布局方向）</h1>
${cards}
</body>
</html>
`
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html)
}

async function main() {
  const onlyArg = process.argv.find((a) => a.startsWith('--only='))
  const only = onlyArg ? onlyArg.split('=')[1] : undefined

  const targets = only ? DIRECTIONS.filter((d) => d.name === only) : DIRECTIONS
  if (targets.length === 0) {
    console.error(`未知方向: ${only}。可选: ${DIRECTIONS.map((d) => d.name).join(', ')}`)
    process.exit(1)
  }

  const executablePath = resolveChrome()
  fs.mkdirSync(OUT_DIR, { recursive: true })

  console.log(`Chrome: ${executablePath}`)
  console.log(`输出目录: ${OUT_DIR}\n`)

  const browser = await chromium.launch({ executablePath })
  const results = []
  let failed = 0

  for (const direction of targets) {
    const started = Date.now()
    const htmlPath = path.join(OUT_DIR, `${direction.name}.html`)
    const pngPath = path.join(OUT_DIR, `${direction.name}.png`)
    try {
      const body = await renderToHtml(buildMarkdown(direction.value), executablePath)
      fs.writeFileSync(
        htmlPath,
        `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#fff">${body}</body></html>`,
      )
      await screenshot(browser, htmlPath, pngPath)
      const size = fs.statSync(pngPath).size
      console.log(
        `✓ ${direction.label.padEnd(28)} ${(size / 1024).toFixed(1)}kB  ${Date.now() - started}ms`,
      )
      results.push(direction)
    } catch (error) {
      failed++
      console.error(`✗ ${direction.label}`)
      console.error('  ', error instanceof Error ? error.message : error)
    }
  }

  await browser.close()

  if (results.length > 0) {
    writeIndex(results)
    console.log(`\n总览: ${path.join(OUT_DIR, 'index.html')}`)
  }
  if (failed > 0) {
    console.error(`\n${failed} 个方向渲染失败`)
    process.exit(1)
  }
}

main()
