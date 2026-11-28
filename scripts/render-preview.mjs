#!/usr/bin/env node
/**
 * 渲染预览：把所有布局方向各渲染一遍，输出 HTML + PNG + SVG 到 .render-preview/。
 *
 * 用途：每次改动渲染相关代码后跑一次，肉眼过一遍所有方向，避免回归。
 *
 * 用法：
 *   node scripts/render-preview.mjs                 # 渲染全部方向
 *   node scripts/render-preview.mjs --only=radial   # 只渲染某个方向
 *   node scripts/render-preview.mjs --file=doc.md   # 用自定义 markdown 替换内置样例
 *   node scripts/render-preview.mjs --complex       # 渲染内置 complex_nodes 样例（自带 frontmatter）
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

const complex_nodes = `---
theme: "26"
border: "11123000"
shape: "12111000"
linkshape: "12312300"
---
# User Guide

This document is a user-level guide for AI assistants working in this repository. It standardizes language, tool/script preferences, and development notes for the current tech stack.

## 💬 Communication Conventions

- **Language**: Use English consistently for conversation, TODOs, and code-related content (comments, UI copy, commit messages, PR descriptions, and similar artifacts).
- **Conclusion first**: Start with the core conclusion/summary, then provide details.
- **References**: When citing code, always provide full file paths (for example, \`src/main.ts:42\`).

## 💻 Runtime and Tooling

- **Runtime**: Node.js (Electron environment)
- **Node**: Node.js \`>=22.14.0\` and npm \`>=10\` (matches \`package.json\`)
- **Package manager**: \`npm\` (this project includes \`package-lock.json\`; use npm only)
- **Build tools**: Electron Forge + Vite
- **Terminal**: Windows (PowerShell) / VSCode MCP tools can be used safely

## 🧩 Tech Stack Overview

- **Frontend**:
  - React 19, TypeScript
  - React Compiler via \`babel-plugin-react-compiler\`
  - Tailwind CSS v4, \`clsx\`, \`tailwind-merge\`, \`tailwindcss-animate\`
  - Radix UI (Primitives), Lucide React (Icons), Simple Icons (\`@icons-pack/react-simple-icons\`)
  - \`class-variance-authority\` (CVA), \`react-i18next\` + \`i18next\`
  - TanStack Router (Routing), TanStack Query (State Management)
  - Feature UI lives inside \`src/modules/*/components\`; generic UI lives under \`src/components\`
- **Backend (Electron Main/Server)**:
  - Electron (Main/Preload/Renderer architecture)
  - NestJS + Fastify (internal proxy/gateway service, started by the main process)
  - Better-SQLite3 (local database), Drizzle ORM / Raw SQL
  - ORPC (type-safe RPC)
  - gRPC (\`@grpc/grpc-js\`, \`@grpc/proto-loader\`)
  - OS credential storage via \`@napi-rs/keyring\` / \`keytar\`
  - Logging: \`winston\` + \`winston-daily-rotate-file\`
  - Validation: Zod plus NestJS \`class-validator\` / \`class-transformer\`
  - Observability: Sentry for Electron/renderer builds
- **Testing**:
  - Vitest (unit/integration), Testing Library
  - Playwright (E2E)

## 📁 Directory Structure

\`\`\`plaintext
.
├─ src/
│  ├─ assets/            # Static assets
│  ├─ components/        # App-wide generic React components
│  │  ├─ layout/         # Shared layout primitives
│  │  ├─ shared/         # Cross-feature shared components/providers
│  │  └─ ui/             # Base UI primitives
│  ├─ ipc/               # ORPC bridge composition and main-process handler
│  ├─ localization/      # i18n translation resources
│  ├─ mocks/             # Mock data for tests and development
│  ├─ modules/           # Feature modules and vertical slices
│  │  ├─ account/        # Local account snapshots and account UI
│  │  ├─ antigravity-runtime/ # Antigravity process/startup/switching logic
│  │  ├─ app-shell/      # App shell actions, routing, tray, theme, window/system IPC
│  │  ├─ cloud-account/  # Cloud auth, account monitoring, quota, persistence
│  │  ├─ config/         # App configuration types, hooks, components, IPC
│  │  ├─ identity-profile/ # Identity profile dialog and IPC
│  │  └─ proxy-gateway/  # Local API proxy, model mapping, gateway IPC/server logic
│  ├─ routes/            # TanStack Router route definitions
│  ├─ server/            # NestJS bootstrap and server entry points
│  ├─ shared/            # Cross-cutting constants, logging, persistence, platform, security, serialization, utils
│  ├─ styles/            # Global styles (Tailwind classes)
│  ├─ tests/             # Test code
│  ├─ App.tsx            # React app entry
│  ├─ instrument.ts      # Sentry/main instrumentation
│  ├─ main.ts            # Electron main entry
│  ├─ preload.ts         # Electron preload script
│  ├─ renderer.ts        # Electron renderer entry
│  ├─ routeTree.gen.ts   # Generated TanStack Router tree
│  └─ types.d.ts         # Global renderer/main type declarations
├─ docs/                 # User/debugging documentation and screenshots
├─ scripts/              # Build/release/helper scripts
├─ types/                # External/global declaration files
├─ vite.main.config.mts
├─ vite.preload.config.mts
├─ vite.renderer.config.mts
├─ vitest.config.mjs
├─ forge.config.ts       # Electron Forge config
└─ package.json
\`\`\`

## 🧱 Module Architecture

- **Feature-first modules**: Put feature-specific actions, components, hooks, IPC handlers, persistence, services, server code, types, and utilities under the owning \`src/modules/<feature>/\` directory.
- **Shared capabilities**: Put cross-feature constants, logging, database, platform paths, security, serialization, UI helpers, and generic utilities under \`src/shared/\`.
- **Generic components**: Use \`src/components/ui\`, \`src/components/shared\`, and \`src/components/layout\` only for reusable UI that is not owned by a single feature.
- **IPC composition**: Add module routers under the owning module, then compose them in \`src/ipc/router.ts\`; keep the main-process ORPC bridge in \`src/ipc/handler.ts\` and \`src/ipc/manager.ts\`.
- **Server code**: Keep NestJS proxy/gateway implementation under \`src/modules/proxy-gateway/server/\`; keep process bootstrap in \`src/server/\`.
- **Routes**: Route files live in \`src/routes/\`; route creation is centralized in \`src/modules/app-shell/routing/routes.ts\`. Do not manually edit \`src/routeTree.gen.ts\`.
- **Data access**: Database primitives live in \`src/shared/persistence/database/\`; feature-specific repositories/persistence live in the owning module.

## 📦 Common Scripts

Use \`npm\` for all commands:

- **Development (Dev)**:
  - \`npm start\` - Start Electron dev environment (Electron Forge)
  - \`npm run lint\` - Run ESLint checks
  - \`npm run format\` - Run Prettier check
  - \`npm run format:write\` - Auto-format with Prettier
  - \`npm run type-check\` - Run TypeScript type check

- **Build**:
  - \`npm run package\` - Package app (application bundle only)
  - \`npm run make\` - Build and generate distributable installers
  - \`npm run publish\` - Publish app

- **Testing**:
  - \`npm test\` - Run Vitest tests
  - \`npm run test:watch\` - Run Vitest in watch mode
  - \`npm run test:unit\` - Same as above for unit-focused runs
  - \`npm run test:e2e\` - Run Playwright E2E tests
  - \`npm run test:all\` - Run all tests

### Running a Single Test

- Unit test: \`npm run test:unit -- path/to/test.test.ts\`
- E2E test: \`npm run test:e2e -- path/to/test.spec.ts\`
- Type check: \`npm run type-check\`

## 🧪 Development Notes

- **Build**: Build stage may ignore TS/ESLint errors depending on project/CI configuration.
- **DevTools**: \`code-inspector-plugin\` is integrated; use \`Shift + Click\` on page elements to jump to source code.
- **React**: React Strict Mode is enabled in \`src/App.tsx\`.
- **Routing**: TanStack Router generates \`src/routeTree.gen.ts\` from \`src/routes/\`.
- **NestJS**: The proxy/gateway service is bootstrapped by the Electron main process; logs are visible in the main-process console.
- **Sentry**: Production renderer builds enable Sentry only when the related environment variables/tokens are present.

## Security and Data

- **Security**: Never commit secrets; use environment variables for sensitive config; validate all user input; encrypt sensitive data.
- **Database**: Use Better-SQLite3 through \`src/shared/persistence/database/\`; encapsulate feature-specific persistence in the owning module; always use prepared statements; test DB operations independently.
- **Credentials**: Store sensitive account credentials in the OS keyring or encrypted storage helpers; never write plaintext secrets to logs, IPC packets, or fixtures.
- **i18n**: Use \`react-i18next\`; keys should use kebab-case; translation files are stored in \`src/localization/\`.

## 📝 Conventions

- **File naming**:
  - Components: PascalCase (for example, \`Button.tsx\`)
  - Feature services: PascalCase when matching existing class files (for example, \`GoogleAPIService.ts\`, \`CloudMonitorService.ts\`)
  - Tools/config: camelCase or kebab-case
- **Import paths**: Use \`@/\` alias for \`src/\`.
- **Type safety**: Avoid \`any\`, unnecessary \`unknown\`, and unsafe \`as\` casts; enforce end-to-end type safety with Zod + TypeScript.
  - Prefer precise domain types, generics, discriminated unions, typed helper functions, and runtime schemas/type guards.
  - Use \`unknown\` only at true runtime boundaries, such as \`catch\` values, deserialized IPC/ORPC payloads, external API responses before validation, JSON parsing, or third-party untyped data.
  - Narrow \`unknown\` as close to the boundary as possible with Zod, runtime checks, or dedicated type guards.
  - Avoid \`as\` for convenience. If a cast is unavoidable, keep it local and narrow, and explain why the compiler cannot infer the type safely.
  - Do not replace a known shape with a broad type such as \`Record<string, unknown>\`; define an explicit interface/type or a keyed type map instead.
- **Utility methods**: Prefer \`lodash-es\` over native JavaScript utilities for array/object/string transformations to improve consistency and maintainability.
  - Use named imports (for example, \`import { get, groupBy, uniqBy } from 'lodash-es'\`), and avoid full-package imports.
- **Component design**:
  - Prefer Radix UI Primitives.
  - Use Tailwind utility classes; avoid CSS Modules unless necessary.
- **API communication**: Frontend should prioritize ORPC client or Electron preload/IPC APIs for strong type inference.

### Naming Specifics

- **Functions/Variables**: camelCase (for example, \`handleClick\`, \`isCurrent\`)
- **Constants**: UPPER_SNAKE_CASE (for example, \`LOCAL_STORAGE_KEYS\`)
- **Files**:
  - Services: \`ServiceName.service.ts\`
  - Types: \`type-name.ts\`

## 🏷️ Markdown Writing

- Always specify a language for fenced code blocks; use \`plaintext\` if unsure.
- Keep one blank line after headings for readability.

## Line-Break Rule

\`return\` and similar statements should not share a line with other statements. Keep them on separate lines.

## 💭 Commenting Rules

- Required comment scenarios: complex business logic/algorithms, non-obvious behaviors, important design tradeoffs, and key reference links.
- Principles:
  - Explain **why**, not **what**, and not changelog history.
  - Update comments whenever related code changes.
  - Prefer JSDoc; for complex functions, start with high-level overview, then annotate key steps (1, 2, 3...).
  - Keep spacing between English and Chinese words if both appear for readability; do not comment deleted legacy code.

Quality self-check: six months later, what useful context does a new teammate gain from this comment? If the answer is "none", remove it.

Example:

\`\`\`typescript
/**
 * Handle payment request with multi-step validation.
 */
function processPayment(request: PaymentRequest) {
  // 1. Input validation
  // 2. Risk evaluation (low/medium/high paths)
  // 3. Gateway call
  // 4. User notification
}

export enum BudgetType {
  Free = 'free',
  /** ✅ Prefer JSDoc over end-of-line comments */
  Package = 'package',
}
\`\`\`

## 🛠️ Development Guide

### General Principles

- Prioritize stability and maintainability before optimization.
- For uncertainty, state assumptions/tradeoffs/validation approach clearly, then implement.
- Trust agreed preconditions; avoid excessive defensive coding against guaranteed invariants.
- Refactor legacy code conservatively; use modern approaches for new features where appropriate.
- Avoid premature optimization: implement simple and direct first; optimize only when justified.
- Always use braces for control flow (\`if\`, \`while\`, and similar statements).

### New Feature Implementation

- Code should be clear, readable, reusable, efficient, and testable.
- Prefer mature and reliable modern APIs.

### Refactoring and Bug Fixing

- Prefer incremental changes; align scope first before large refactors.
- Preserve existing structure and style; avoid over-abstraction risk.

### Development Lifecycle Checklist

Exploration / planning:

- \[ ] Fully understand requirements; break down into 3-6 steps
- \[ ] Review documentation and existing solutions first
- \[ ] Validate ideas by reading actual code
- \[ ] Build a TODO list

Implementation / refactor / fix:

- [ ] Review related templates and surrounding code; follow existing patterns
- [ ] Fail fast on invalid inputs/states
- [ ] Improve frontend interaction and UX within constraints

Acceptance / validation:

- \[ ] Validate implementation through tests or temporary scripts
- \[ ] After multiple incremental edits, evaluate whether changes should be consolidated
- \[ ] Run quality checks
- \[ ] Update related docs

Summary / output:

- \[ ] Verify output formatting requirements
- \[ ] List deviations from plan and key decisions for human review
- \[ ] Provide optimization suggestions
- \[ ] Include full references at the end

## 🚨 Local Quality Checks (Optional Flow)

After a set of changes, run these three checks in parallel instead of full lint immediately:

\`\`\`plaintext
Task(subagent_type: "quick-code-review", description: "Code review", prompt: "[change description]")
Task(subagent_type: "diagnostics", description: "Diagnostics", prompt: "[same as above]")
Task(subagent_type: "run-related-tests", description: "Run tests", prompt: "[same as above]")
\`\`\`

\`change description\` example:

\`\`\`plaintext
- Modified files: list of relative paths
- Context: requirement/business background
\`\`\`

Flow: initial check -> fix key issues -> re-check -> iterate until key issues are resolved.

Note: these tools are read-only analyzers; you still need to apply fixes manually. Pass precise file paths, not broad directories.
`

function buildMarkdown(direction, customMarkdown) {
  // theme 编码：第一位 colorscheme，第二位 direction
  const theme = `0${direction}`
  return `~~~ markmap
---
theme: "${theme}"
border: "11110000"
shape: "10000000"
linkshape: "00000000"
---
${customMarkdown ?? SAMPLE_NODES}~~~
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

/** 截图并顺手落一份独立 SVG（从渲染好的页面里取最外层 svg 元素）。 */
async function screenshot(browser, htmlPath, pngPath, svgPath) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
  await page.goto('file://' + htmlPath)
  await page.waitForTimeout(400)
  // 取文档里第一个顶层 svg（即 markmap 图），补 xmlns 保证独立打开可渲染
  const svg = await page.evaluate(() => {
    const el = document.querySelector('svg')
    if (!el) return ''
    el.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    el.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
    return el.outerHTML
  })
  if (svg) {
    fs.writeFileSync(svgPath, `<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n`)
  }
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
  const only = onlyArg ? onlyArg.split('=').slice(1).join('=') : undefined
  const fileArg = process.argv.find((a) => a.startsWith('--file='))
  let customMarkdown
  if (fileArg) {
    const filePath = path.resolve(fileArg.split('=').slice(1).join('='))
    customMarkdown = fs.readFileSync(filePath, 'utf8')
    console.log(`自定义样例: ${filePath}`)
  }
  // complex_nodes 自带 frontmatter（theme/border/shape/linkshape），直接作为
  // markmap 代码块内容使用，不要再包一层脚本的 frontmatter。
  const useComplex = process.argv.includes('--complex')
  if (useComplex && (fileArg || only)) {
    console.error('--complex 不能与 --file / --only 同时使用')
    process.exit(1)
  }

  const targets = useComplex
    ? [{ value: 6, name: 'complex', label: 'Complex（complex_nodes，radial）' }]
    : only
      ? DIRECTIONS.filter((d) => d.name === only)
      : DIRECTIONS
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
    // 自定义样例单独命名，避免覆盖内置样例的预览产物
    const name = useComplex
      ? 'complex'
      : customMarkdown
        ? `${direction.name}-custom`
        : direction.name
    const htmlPath = path.join(OUT_DIR, `${name}.html`)
    const pngPath = path.join(OUT_DIR, `${name}.png`)
    const svgPath = path.join(OUT_DIR, `${name}.svg`)
    try {
      const markdown = useComplex
        ? `~~~ markmap\n${complex_nodes}~~~\n`
        : buildMarkdown(direction.value, customMarkdown)
      const body = await renderToHtml(markdown, executablePath)
      fs.writeFileSync(
        htmlPath,
        `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#fff">${body}</body></html>`,
      )
      await screenshot(browser, htmlPath, pngPath, svgPath)
      const size = fs.statSync(pngPath).size
      console.log(
        `✓ ${direction.label.padEnd(28)} ${(size / 1024).toFixed(1)}kB  ${Date.now() - started}ms`,
      )
      results.push({ ...direction, name })
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
