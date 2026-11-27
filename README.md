# remark-markmap

把 Markdown 渲染成思维导图 SVG 的 monorepo。

| 包 | 作用 |
|---|---|
| `@anlijiu/markmap` | 核心渲染库：构建树结构、布局计算、绘制 SVG |
| `@anlijiu/markmap-isomorphic` | 浏览器 / Node 双端渲染入口（Node 侧基于 Playwright） |
| `@anlijiu/remark-markmap` | remark 插件：把 Markdown 里的 `markmap` 代码块渲染成内联 SVG |

## 安装

```bash
pnpm add @anlijiu/remark-markmap
```

Node 端渲染需要 Playwright 与可用的 Chromium。`playwright-core` 在 `@anlijiu/markmap-isomorphic` 中是**可选 peer 依赖**（浏览器侧不需要），需要时自行安装：

```bash
pnpm add playwright-core
```

## 用法

### 作为 remark 插件

```js
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import markmap from '@anlijiu/markmap'
import { remarkMarkmap } from '@anlijiu/remark-markmap'

const file = await unified()
  .use(remarkParse)
  .use(remarkMarkmap)
  .use(remarkRehype, { handlers: { markmap: markmap.markmapHandler } })
  .use(rehypeStringify)
  .process(markdown)
```

### 直接使用核心库

```js
import { buildTree, render } from '@anlijiu/markmap'

// nodes 是 hast 的 Element[]
const tree = buildTree(nodes, {
  theme: [],   // 见下方 config
  shape: [],
  border: [],
  linkshape: [],
})

await render(tree, 'svg-id', { themeIds, shapeIds, borderIds, linkshapeIds })
```

### Node 端批量渲染

```js
import { createMarkmapRenderer } from '@anlijiu/markmap-isomorphic'

const render = createMarkmapRenderer()

// 渲染器本身可调用：传入多个图，返回 settled 结果数组
const [result] = await render([diagram], { prefix: 'markmap' })
```

## config

### detail list

+ theme `00000000`

  八个 hex 数字，从左数第一个 hex 为 colorscheme：

  - `idx[0]` colorscheme
  - `idx[1]` direction

  direction 取值：

  - `Up = 1`         向上发散的树
  - `Down = 2`       向下发散的树
  - `Left = 3`       向左发散的树
  - `Right = 4`      向右发散的树
  - `Left_Right = 5` 向左右发散的树
  - `Radial = 6`     向四周发散的树（力导向布局）

+ shape `00000000`

  八个 hex 数字，第 n 位表示 depth n 的节点形态：

  - `DEFAULT: 0`      无背景
  - `ROUNDED_RECT: 1` 圆角矩形
  - `RECT: 2`         矩形
  - `CIRCLE: 3`       圆形
  - `CLOUD: 4`        云
  - `BANG: 5`         爆炸形
  - `HEXAGON: 6`      六边形

+ border `00000000`

  八个 hex 数字，第 n 位表示 depth n 的边框类型：

  - `NO_BORDER = 0` 无边框
  - `BORDER_1 = 1`  实线，width 4，与 node 无间距，颜色互补
  - `BORDER_2 = 2`  实线，width 1，与 node 间距 2，颜色相同
  - `BORDER_3 = 3`  虚线，width 4，与 node 无间距，颜色互补
  - `BORDER_4 = 4`  虚线，width 1，与 node 间距 2，颜色相同

+ linkshape `20000000`

  - `BEZIER: 0`             贝塞尔曲线
  - `STRAIGHT_LINE: 1`      直线
  - `PERPENDICULAR_LINE: 2` 直角折线
  - `CUSTOM_BEZIER: 3`      自定义贝塞尔曲线
  - `QUADRATIC_BEZIER: 4`   二阶贝塞尔曲线

## 开发

```bash
pnpm install

pnpm -r build        # 构建 JS 产物（esbuild）
pnpm -r build:types  # 生成类型声明（tsc --emitDeclarationOnly）
pnpm -r typecheck    # 类型检查
pnpm -r test         # 测试：markmap 用 tsx --test，isomorphic 用 node --test
pnpm lint            # eslint

pnpm check           # typecheck + test
```

单包运行示例：

```bash
pnpm -C packages/markmap run test
pnpm -C packages/markmap run bench:measurement
```

### 渲染预览

改完渲染相关代码后，建议把所有布局方向各渲染一遍，肉眼检查回归：

```bash
pnpm preview                   # 渲染全部 6 个方向 → .render-preview/
pnpm preview -- --only=radial  # 只渲染某个方向
```

输出包含每个方向的 `.html` / `.png`，以及一个总览页 `.render-preview/index.html`（用浏览器打开可一次看全）。

需要本机有 Chrome/Chromium；找不到时用 `CHROME_PATH` 环境变量指定可执行文件路径。

## 发布

版本与 CHANGELOG 由 [changesets](https://github.com/changesets/changesets) 管理：

```bash
pnpm changeset          # 记录本次变更与版本类型
pnpm version-packages   # 生成版本号与 CHANGELOG
```

发布有两种方式：

1. **CI（推荐）**：推送 `v*` tag，或手动触发 `.github/workflows/release.yml`。workflow 使用
   npm Trusted Publishing（GitHub Actions 的 OIDC 短时令牌），不需要保存 `NPM_TOKEN`。
   前提是在 npm 上给三个包分别添加 Trusted Publisher：Provider `GitHub Actions`、
   Organization/User `anlijiu`、Repository `remark-markmap`、Workflow `release.yml`。
2. **本地**：`./publish`（check → build → build:types → changeset publish）。账号开启 2FA 时用
   `NPM_CONFIG_OTP=<验证码> ./publish`；本地不能使用 Trusted Publishing。

`publish` 脚本会先跑 `pnpm -r build` 与 `pnpm -r build:types`，确保发布产物包含类型声明（`exports.types` 指向 `dist/types/index.d.ts`）。

## 已知限制

- **Radial 方向是力导向布局**（cose-bilkent 的 CoSE，走 `cose-base@2.2`）：初始位置由 tidy 径向树给出，CoSE 以 incremental 模式做局部微调；10000 节点约 7s（原 cose-bilkent 约 65s）；
- 当前实现是**确定性**的：tidy 初始位置 + 固定种子的 PRNG（cose 的 tree-reduction 用到 `Math.random`），同一输入两次渲染结果一致；
- 布局计算与 DOM 无关：Radial 用 cose-base 在内存里算完坐标；但 **SVG 绘制与文本测量仍需要 DOM 环境**，Node 端依赖 Playwright + Chromium；
- 布局依赖只有 `d3-flextree`（其它方向）与 `d3-force`（Radial），不再引入图渲染库；
- 核心包的 `MindmapNode` 与 isomorphic 包各有一份定义（字段保持结构兼容），跨包新增字段时需同步。
