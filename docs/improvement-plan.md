# remark-markmap 改进计划

> 状态：**v6 · 全部完成**（Phase 0/1/2/4/5 已完成，Phase 3 按约定延后）
> 更新：2026-11-27
> 依据：对 `packages/markmap`(4908 行)、`packages/markmap-isomorphic`(657 行)、`packages/remark-markmap`(200 行)
> 以及三个包的构建链、发布配置、测试现状的代码调研。
> 证据索引见[附录 A](#附录-a-证据索引)。

---

## 0. 范围说明

本计划针对**一次性、可验证的工程质量改造**，不包含新功能开发，也不包含 UI/视觉改动。

每个阶段结束都应满足同一标准：**`git diff` 可读、行为不变、有对应验证命令通过**。

**本计划不含任何视觉改动**。Phase 4.6 保留现有力导向布局，只改实现方式（见 4.6）。

---

## 1. 现状摘要

### 1.1 已经做得不错的地方

评估这些是为了避免改造时误伤：

- **树布局算法本身是正确的**。`flextree.ts` 是 Reingold-Tilford 的线性时间变体，轮廓线 + thread 指针实现完整。
- **文本测量方向是对的**。接入 `@chenglou/pretext` 做无 DOM 的富文本换行，比原来的 `getBBox()` 方案更适合服务端渲染。
- **isomorphic 抽象是有价值的**。同一套 API 在浏览器和 Node（playwright）两侧跑，是这类渲染库的正确形态。
- **构建产物形态合理**。esm + iife 双产物，iife 供 playwright `addScriptTag` 注入。

### 1.2 问题清单（按严重度）

| # | 严重度 | 问题 | 证据 |
|---|---|---|---|
| 1 | **P0** | 模块级全局可变状态，无法并发、无法测试 | `tree.ts:21-26`(globalIndex)、`db.ts:9-11`、`tree.ts:133`(全局 theme)、`logger.ts:19` |
| 2 | **P0** | 库无法通过类型检查，但构建链不做检查，问题被掩盖 | `build:types` 失败，数十条 `TS2835`/`TS7006` |
| 3 | **P0** | 消费者拿不到任何类型声明 | 三个 `package.json` 的 `types` 均为 undefined |
| 4 | **P1** | 核心包依赖边界错误，拉了整套 Markdown 生态 | `packages/markmap/package.json` 的 dependencies |
| 5 | **P1** | `index.ts` 顶层有副作用（import 即打日志） | `src/index.ts:1-10` |
| 6 | **P1** | 包间依赖写 `^1.0.3` 而非 `workspace:*`，三包版本漂移 | `publish` 脚本、各 `package.json` |
| 7 | **P2** | 换行算法存在 O(n²) 测量 | `text.ts:82-125`、`splitText.ts:46-75` |
| 8 | **P2** | `dp.ts` 原地排序输入 + 最优解引用污染 | `dp.ts:69`、`dp.ts:105` |
| 9 | **P2** | `cytoscape` 只为 `Radial` 一个分支服务，且带来私有 API 与 DOM 依赖 | `markmap-renderer.ts:533-540`、`:66`、`:144` |
| 10 | **P3** | 死代码与重复实现 | `bak-theme.ts`(481 行 0 引用)、`decodeEntities` 两处、`tree.ts` 重复 import |
| 11 | **P3** | 日志噪音与热路径序列化 | 61 处 `log.debug`、10 处 `log.info`、10 处日志参数内 `JSON.stringify` |
| 12 | **P3** | 工程化基础设施缺失 | 无 CI、无 lint/format 配置 |

> 问题 #9 在 v1 里被低估了。补充事实：`layoutStrategyMap`（`markmap-renderer.ts:533-540`）里除 `Radial`
> 之外的**所有方向都走 `drawLeftRightMindMap`（flextree + 自算贝塞尔）**，而 `draw:552` 的默认方向是
> `Left_Right`。也就是说 cytoscape + cose-bilkent 默认**完全不被执行**。

---

## 2. 目标与非目标

### 目标

1. **可验证**：任何改动都有能跑的检查（类型检查 + 测试 + 构建）。
2. **可依赖**：消费者能拿到类型、不会被迫装无关依赖、tree-shaking 正确。
3. **性能不退化**：算法改造要有量化对比。
4. **实现可维护**：去掉对 cytoscape 私有字段与 DOM container 的依赖，同时保持现有视觉不变。

### 非目标

- **Phase 3（全局状态重构）整体延后**，不纳入本轮。理由见 §3 Phase 3 的状态说明。
- **不替换 cytoscape 的布局算法**。Radial 的力导向视觉要保留；4.6 只改实现方式（headless + 自算端点），不换布局引擎。
- **不改任何视觉**，包括 Radial。
- **不追求 100% 覆盖率**，只要求关键算法有回归测试。
- **不更换测试框架**（继续 `tsx --test` / `node --test`）。

---

## 3. 分阶段计划

执行顺序：**先建安全网，再动代码**。Phase 3 延后后，Phase 4 可以提前。

| 阶段 | 内容 | 工作量 | 状态 |
|---|---|---|---|
| Phase 0 | 建立可验证基线 | 0.5 天 | ✅ 已完成 |
| Phase 1 | 类型与代码卫生 | 1.5 天 | ✅ 已完成 |
| Phase 2 | 库形态现代化 | 1-2 天 | ✅ 已完成 |
| ~~Phase 3~~ | ~~状态重构~~ | 2-3 天 | **延后** |
| Phase 4 | 算法与性能 | 2-4 天 | ✅ 已完成 |
| Phase 5 | 工程化收尾 | 1 天 | ✅ 已完成 |

---

### Phase 0 · 建立可验证基线（0.5 天）✅ **已完成**

**目标**：让问题"可见且可度量"。

| # | 任务 | 具体改动 | 结果 |
|---|---|---|---|
| 0.1 | 统一"检查入口" | 根 `package.json`：`typecheck` / `lint` / `check` | ✅ 已加 |
| 0.2 | 各包加 `typecheck` 脚本 | 三包均加 `"typecheck": "tsc --noEmit"` | ✅ 可跑，当前 391 错误（基线） |
| 0.3 | **记录基线** | `docs/baseline.md` | ✅ 含错误分布、bundler 实测收益、关键发现 |
| 0.4 | 引入 lint | `eslint@10` + `typescript-eslint@8` + `eslint.config.js` | ✅ `eslint .` exit 0（195 warning，0 error） |
| 0.5 | 引入 CI | `.github/workflows/ci.yml` | ✅ build/test 阻塞，typecheck/lint 暂 non-blocking |

**执行中遇到的阻塞（重要）**：`typescript-eslint@8.74` **不支持 TS 7.0**（与 ts-jest 同源：TS7 移除了 JS compiler API）。处置：给 lint 侧单独装 TS 6 API ——

```json
"typescript": "npm:@typescript/typescript6@^6.0.2"   // 仅在根，供 eslint 用
```

各包自己的 `devDependencies` 仍是 `typescript@7.0.2`（构建用），两套并存互不干扰。已实测：根 `node_modules/typescript` = 6.0.2，`packages/markmap/node_modules/typescript` = 7.0.2。

**约束**：Phase 0 只允许新增配置，不改 `src/` —— 已遵守。

---

### Phase 1 · 类型与代码卫生（1.5 天）✅ **已完成**

**目标**：`tsc --noEmit` 通过，删死代码和重复实现。**不改运行时行为。**

| # | 任务 | 具体改动 | 结果 |
|---|---|---|---|
| 1.1 | `TS2835` 归零 | `module` → `esnext`、`moduleResolution` → `bundler`、`target`/`lib` → ES2022（三个包） | ✅ |
| 1.2 | `TS7006`/`TS7031` 归零 | 逐文件补参数类型；无法精确建模的移植代码用显式 `any` | ✅ |
| 1.3 | `TS2591`（`Buffer`/`node:assert`） | `tsconfig` 补 `types: ["node"]` | ✅ isomorphic 7→0 |
| 1.4 | 删死代码 | 删 `bak-theme.ts`(481 行)、`consumeText`、`useHtmlLabels` 注释块 | ✅ |
| 1.5 | 去重复 | 删 `text.ts` 的 `decodeEntities`、`tree.ts` 重复 `import theme` | ✅ |
| 1.6 | `index.ts` 去副作用 | 移除顶层 `setLogLevel(9)` 与 6 条日志 | ✅ 实测 import 时 console 输出 0 条 |
| 1.7 | 日志惰性化 | 8 处 `JSON.stringify` 改为 `() => JSON.stringify(...)` | ✅ |
| 1.8 | 修 `logger.ts` | 单一 `currentLevel` + `emit`，支持惰性参数与 `isEnabled`，去掉 `dayjs` | ✅ 实测关闭时惰性参数调用 0 次 |
| 1.9 | 换 `d3-flextree`（决策 C） | 删本地 360 行副本，改用 npm 包 + `@types/d3-flextree` | ✅ 省 360 行 |

**验收数据**：

| 指标 | 基线 | 现在 |
|---|---:|---:|
| `markmap` 类型错误 | 374 | **0** |
| `markmap-isomorphic` 类型错误 | 7 | **0** |
| `remark-markmap` 类型错误 | 10 | **0** |
| `pnpm -r test` | 6 通过 | 6 通过 |
| `pnpm -r build` | 1.8mb | 1.7mb |
| `eslint` | 195 warning | 0 error / 82 可修复 warning |

**过程中发现并修掉的真实缺陷**（不是补类型能了事的）：

1. `theme/color/types.ts:25` 引用了不存在的类型名 `RGB | RGBA | HEX`（实际定义是 `RGBColor | RGBAColor | HEXColor`）；
2. `svgDraw.ts` 的 `ShapeFunction` 定义为 4 个参数，实际 15 处实现/调用都是 6 个参数；
3. `db.ts` 与 `tree.ts` 使用了 `nodeType.NO_BORDER` —— 该常量在 `borderType` 上，`nodeType` 没有，原代码是死分支；
4. `svgDraw.ts:2` 的 `import invert from './theme/invert'` 路径错误（文件实际在 `theme/color/invert.ts`）；
5. `MindmapNode.contents` 声明为 `MindmapNode[]`，实际存的是 hast `Element[]`；
6. `types.ts` 引入 hast `Element` 后与 DOM `Element` 重名，导致 d3 `Selection` 泛型约束失败。

**遗留（有意为之）**：`remark-markmap` 的两个 `TS7016` 用 `src/@types/*.d.ts` shim 兜住了。根因是包间依赖写 `^1.0.x` 走 registry 而非本地包（见 baseline 第 3 节），属 **Phase 2.5 + 2.1** 的范围，届时必须删除这两个 shim。

---

### Phase 2 · 库形态现代化（1-2 天）✅ **已完成**

| # | 任务 | 具体改动 | 结果 |
|---|---|---|---|
| 2.1 | 补类型导出 | 三包加 `"types"` 与 `exports["."].types`（排在 import/browser 之前） | ✅ 消费者可拿到类型 |
| 2.2 | 补 `files` 白名单 | `["dist"]`（isomorphic 另含 index.html），并排除 `dist/tsconfig.tsbuildinfo` | ✅ 打包零命中 src/test/tsbuildinfo |
| 2.3 | 声明 `sideEffects` | 三包均为 `false` | ✅ |
| 2.4 | 收敛 `exports` | `"./*"` → `"./dist/*"`（仓库内确实用到 `@anlijiu/markmap/dist/markmap.js`） | ✅ 不再暴露 src |
| 2.5 | 包间依赖改 `workspace:*` | 重装后 node_modules 指向本地包，删除两个临时 d.ts shim | ✅ 删 shim 后 typecheck 仍为 0 |
| 2.6 | 清理依赖 | markmap 21→11、isomorphic 17→2、remark 18→13 | ✅ build/test/typecheck 全过 |
| 2.7 | `playwright-core` 降级 | isomorphic 改为 optional peer + devDependency；remark 保留为 runtime 依赖 | ✅ 语义已按运行环境区分 |
| 2.8 | 版本治理（决策 B） | `@changesets/cli@3.0.3` + `.changeset/config.json` + 三个脚本 | ✅ `changeset status` 可运行 |

**验收数据**：

| 指标 | 结果 |
|---|---|
| `pnpm -r build` / `build:types` / `test` | exit 0 / exit 0 / exit 0（6 个测试通过） |
| 三包 `tsc --noEmit` | exit 0 |
| `eslint` | exit 0（0 error） |
| `npm pack` 体积 | markmap 2.3MB(56 files) / isomorphic 7.7kB(24) / remark 3.9kB(13) |
| 发布包洁净度 | src / test / tsbuildinfo **零命中** |

**过程中发现并修掉的真实问题**：

1. `buildTree` 的类型声明漏了第二个参数（`FuncBuildTree = (nodes) => ...`），而实现接受 `opts` —— shim 移除后立刻暴露；
2. `MindmapNode` 在两个包里各定义一份且字段不一致，导致跨包赋值类型不兼容。isomorphic 现改为**结构兼容**的本地定义（TS 7 对 `export *` 链再导出会报 TS2459，故未强制复用）；
3. `markmap` 的 `build:types` 缺 `rootDir`，声明文件被输出到 `dist/types/src/` 多一层目录。

**遗留决策点**：markmap 包体积 2.3MB 主要来自两份 sourcemap；是否随包发布 `.map` 待定（影响可调试性）。

---

### Phase 3 · 状态重构 —— **延后，不纳入本轮**

**决定**：整体保留原方案，但**推迟到后续单独立项**，本轮不执行。

原方案（记录备查）：

| # | 任务 | 内容 |
|---|---|---|
| 3.1 | `buildTree` 去全局计数 | `tree.ts:21` 的 `globalIndex` 在 `buildTree` 入口重置，或改为传入 `IdGenerator` |
| 3.2 | `db.ts` 去单例 | 导出 `createMindmapDb()` 工厂，保留默认单例做兼容 |
| 3.3 | `theme` 去全局 | 改为 `createTheme(opts)` 实例 |
| 3.4 | `logger` 去全局改写 | `createLogger(level)` + `setLogLevel` 兼容 shim |
| 3.5 | 引入 `RenderContext` | 上述实例收进一个对象，由 `render()` 创建并向下传递 |

**延后原因**（待你后续确认是否仍成立）：这是唯一触碰公开 API 的阶段，且需要并发回归测试支撑。在 Phase 1/2 没落地前，改造收益难以验证。

**延后不影响的部分**：Phase 1.6 会移除 `index.ts` 的顶层副作用；Phase 4.6 会移除 Radial 分支的 DOM 依赖。这两项已经拿走了全局状态带来的两个最直接的后果，剩下的（`db.ts` 单例、`globalIndex`）留给后续。

---

### Phase 4 · 算法与性能（2-4 天）✅ **已完成**

| # | 任务 | 具体改动 | 验收 |
|---|---|---|---|
| 4.1 | 超长词换行改增量 | `text.ts` 的 `splitOversizedWordWithPretext` 改为 galloping + 二分 | ✅ 行长 200 时 9.1x、2000+ 时 331x（行长 10 时 0.72x，见下方说明） |
| 4.2 | `splitText.ts` 同问题 | `splitWordToFitWidth` 同样策略，删除递归版本 | ✅ 新增 4 个测试，含与逐字符累加结果一致的对照 |
| 4.3 | `dp.ts` 修副作用 | `[...a].sort()`、`parti_opt = [...parti]` | ✅ 新增 6 个单测，全通过 |
| 4.4 | `flextree` 日志惰性化 | —— | ✅ Phase 1 换 npm 包时自动完成（本地副本已删） |
| 4.5 | `flextree` 换 npm 包 | `d3-flextree@2.1.2` + `@types/d3-flextree` | ✅ Phase 1 已完成 |
| 4.6 | Radial 去 DOM/私有 API | headless + 自算连线端点 | ✅ 见下方说明 |

**验收数据**：

| 指标 | 结果 |
|---|---|
| `pnpm -r build` / `test` | exit 0 / exit 0（16 个用例通过） |
| 三包 `tsc --noEmit` | 0 错误 |
| `eslint` | 0 error |
| 换行 bench（2000 字符 token） | 行长 200 → **9.12x**、行长 2000+ → **330.91x**、行长 10 → 0.72x |
| 测试数量 | markmap 3 → **13**（dp 6 个 + splitText 4 个） |

**换行优化的关键教训**：最初的「纯二分」实现在窄容器下**反而慢 10 倍** —— 因为首次探测就跨越半个剩余长度（1000 字符），而实际行长只有 10。改为 galloping（指数探测）+ 误差修正 + 局部二分后，才做到「宽容器大幅提速、窄容器基本持平」。行长 10 时仍慢 28%（多一次 `limit` 校验），这是精确性的代价。

**Radial（4.6）的实施与验证边界**：

- 已移除：`select('body').append('div')` 容器、`edge[0]._private.rscratch` 读取、`declare module 'cytoscape'` 的私有类型声明；
- 已新增：`computeEdgeBounds()` 用「节点中心 + 矩形边界交点」自算端点与中点；
- 保持不变：cose-bilkent 力导向算法、`quality: 'proof'`、`animate: false`，**未引入随机化**；
- 静态验证：`grep` 确认无 `document.` / `select('body')` / `rscratch` 残留；headless 布局在纯 Node 下可运行；
- **未验证**：视觉对照需要真实浏览器渲染前后对比图，当前环境无法完成 —— 建议你实际渲染一次 Radial 方向确认观感。

**后续修复（渲染预览时发现）**：Radial 方向的连线在「节点间距很短」时，带粗细的贝塞尔轮廓会自相交，表现为连线中间出现空洞。已在 `drawEdges` 中修复：短连线（长度 < 40px）改画折线，长连线的轮廓宽度按 `length * 0.25` 收敛。同时新增 `scripts/render-preview.mjs`（`pnpm preview`）用于一次性渲染全部 6 个布局方向做回归检查。

#### 4.5 关于换 `d3-flextree`（核实结论）

已做三方核对，**本地副本与上游算法完全一致**：

1. git 历史：`e7a7cd1 "flextree position bug fix 50%"`(+7 行)、`5d2fd41 "logger"`(+3/-2 行)；
2. 两次 commit 的 diff 内容：所谓 bug fix **加的全是 `console.log`，算法一行未改**；logger 那次只是把 `console.log` 换成 `log.debug`；
3. 与 npm `d3-flextree@2.1.2` 源码逐行对比（已过滤 import/注释/日志/空白）：**差异仅 6 行** —— `const {version} = packageInfo` → `const version = '2.1.2'`，外加 4 行日志字符串续行。

**结论**：换包**不会改变布局结果**。

- 收益：删掉 360 行复制代码；日志噪音自动消失；`version` 不再硬编码。
- 代价：上游是无类型 JS，需补 `@types/d3-flextree` 或本地 `.d.ts`；上游 `import packageInfo from '../package.json'` 需确认 esbuild 处理正常。
- **建议**：换。若你想保留本地副本，则只做 4.4，跳过 4.5，成本也很低。

> 附带发现：那个 commit 名为 "position bug fix 50%"，但实际没有修复任何逻辑。若你记忆中真有位置 bug，它可能**至今未被修复**，建议单独核查一次布局输出。

#### 4.6 关于 cytoscape / Radial 分支（已实测，方案修正）

**前提**：你明确 Radial 要的就是**力导向的有机分布视觉**。因此 v1 里"改成极坐标径向树布局"的方案**作废** —— 那是另一类布局（规整同心圆），视觉上完全不同，达不到同样效果。

**现状**（`markmap-renderer.ts:533-540`）：只有 `Radial` 走 `drawRadialMindMap` → `layoutMindmap`（cytoscape + cose-bilkent），其余方向全部走 `drawLeftRightMindMap`（flextree + 自算贝塞尔）。默认方向 `Left_Right` 不碰 cytoscape。

**实测结论**（headless 模式跑 cose-bilkent，5 节点 / 4 条边）：

| 测试项 | 结果 |
|---|---|
| `cytoscape({ headless: true })` 能否跑 cose-bilkent | ✅ 能，得到真实坐标 |
| `edge.sourceEndpoint()` / `targetEndpoint()` | ❌ `getSourceEndpoint is not a function`（渲染器 API，headless 无渲染器） |
| `node.boundingBox()` | ⚠️ 返回默认 3×3，不能用来算端点 |
| 两次相同输入的布局结果 | **完全相同** —— 当前配置下布局是确定性的 |
| `randomize: false` | 得到另一套固定布局 |

**两个结论**：

1. **DOM 依赖可以去，且视觉零变化**：`select('body').append('div')` 只是给 cytoscape 当容器，headless 不渲染也能算布局。
2. **`_private.rscratch` 必须自己替代**：headless 下没有渲染器，端点要自己算 —— 用节点 `position` + `data.width/height` 求矩形与线段的交点，与 `drawLeftRightMindMap` 分支已有的做法一致。

> 关于"随机"：实测两次布局结果完全一致，说明当前的"随机感"来自力导向的**不规则分布形态**，而不是每次渲染都不同。若要真正的每次不同，需显式传 `randomize: true` 或注入随机初始坐标 —— 这是独立的小改动，可与 D 一起做。

**三个方案**：

| 方案 | 做法 | 视觉 | 代价 |
|---|---|---|---|
| **D1（推荐）** | 保留 cytoscape + cose-bilkent，改 headless，自己算连线端点 | **零变化**（同算法同参数） | 去掉 DOM 与私有 API；仍保留 2 个依赖 |
| D2 | 换 `d3-force` 自建力导向 | **同类但不相同**，需调参对齐 | 去掉 400KB+ 依赖、纯计算；1-2 天调参 |
| D3 | 删掉 Radial 分支 | 少一个方向 | 最省事，但你要的视觉就没了 |

**建议 D1**：精确命中"保留力导向视觉 + 去掉 DOM/私有 API"两个目标，视觉风险为零。

> **后续变更（已实施，最终版）**：Radial 的算法保持 cose-bilkent 的 CoSE（`cose-base@2.2`），不引入 cytoscape。加速来自**初始位置**：先用 d3-hierarchy 的 tidy 径向树铺一个无交叉的初始布局，再让 CoSE 以 incremental 模式做局部微调。实测纯布局耗时（Node，10000 节点）：原 cose-bilkent（从 0,0 展开）64.5s → 现在约 7s；fCoSE `default` 方案 8.4s，但需要 cytoscape（bundle 1865KB / gzip 385KB）。当前方案 `markmap.core.mjs` 794KB / gzip 166KB。另外 cose 的 tree-reduction 会调用 `Math.random` 做剪枝节点放置，布局期间用固定种子 PRNG 替换后，两次渲染结果一致。视觉：0 节点重叠、0 边交叉，成簇、边短。

---

### Phase 5 · 工程化收尾（1 天）✅ **已完成**

| # | 任务 | 结果 |
|---|---|---|
| 5.1 | README 对齐 | ✅ 重写：三包职责、安装（playwright 为可选 peer）、三种用法示例、开发/发布命令、5 条已知限制；删除与本项目无关的 BPMN 段落 |
| 5.2 | 包元数据 | ✅ 三包补 `repository.directory` 与 `publishConfig.access: public` |
| 5.3 | CI 加阻塞 | ✅ typecheck/lint 去掉 continue-on-error；install 改 `--frozen-lockfile`（已验证可行）；新增 build:types 步骤 |
| 5.4 | 发布流程 | ✅ `publish` 脚本改为 check → build → build:types → publish，CI 环境下自动启用 `NPM_CONFIG_PROVENANCE` |
| 5.5 | 依赖巡检 | ✅ CI 新增 schedule（每周一 03:00 UTC）触发的 dependency-audit job |

**验收数据**：

| 指标 | 结果 |
|---|---|
| `pnpm -r build` / `build:types` / `test` | exit 0 / 0 / 0（16 个用例通过） |
| 三包 `tsc --noEmit` | 0 错误 |
| `eslint` | 0 error |
| `npm pack` | markmap 2.3MB(56) / isomorphic 7.7kB(24) / remark 4.0kB(13) |
| 发布包洁净度 | src / test / tsbuildinfo **零命中** |

---

## 4. 决策记录

| 决策点 | 结论 | 说明 |
|---|---|---|
| **A. `TS2835` 怎么解** | ✅ **已定：改 `moduleResolution: bundler`** | 不符 Node ESM 严格规范，但符合 esbuild 打包的真实场景，一行改动、无需改源码 |
| **B. 版本治理** | ✅ **已定：引入 changesets** | `@changesets/cli`，`publish` 脚本改为 `pnpm changeset publish` |
| **C. `flextree.ts`** | 🔶 **已核实等价，建议换 npm 包** | 见 4.5。也可保留本地副本、只做日志惰性化 |
| **D. cytoscape / Radial** | ✅ **已定：方案 D1，不引入随机** | 极坐标树布局方案作废。D1 = headless + 自算端点，视觉零变化；`randomize` 保持当前默认（实测已是确定性） |
| **E. Phase 3 拆分** | ✅ **已定：不拆分，整体延后** | 不纳入本轮，后续单独立项 |

---

## 5. 验收与度量

改造前后用同一组数字对比，写进最终 PR：

| 指标 | 现状 | 目标 |
|---|---|---|
| `pnpm -r typecheck` | 失败（数十条错误） | 0 错误 |
| `pnpm -r test` | 6 个测试通过 | 通过 + 新增 ≥5 个回归测试 |
| 消费者类型提示 | 无 | 有 |
| `npm pack` 体积（markmap） | 待测 | 清理依赖后下降 |
| 1000 字符 token 换行耗时 | 待测（`bench:measurement`） | <20% |
| 无引用源文件 | `bak-theme.ts` 481 行 | 0 |
| 运行时依赖数（markmap） | 20 个 | 清理后下降（4.6 若做 D1，cytoscape 仍保留） |
| Radial 视觉 | 力导向分布 | **保持不变**（D1 要求改造前后对照） |

---

## 6. 风险与回滚

| 风险 | 影响 | 缓解 |
|---|---|---|
| Phase 2 清理依赖误删 | 打包产物静默变化 | 分小 PR；每步后比对 `dist/*.mjs` 大小 |
| Phase 1 改 `moduleResolution` | `d.ts` 形态变化 | 单文件回滚 |
| Phase 4.5 换 flextree | 布局结果变化 | 已核实等价；改造后跑一次视觉对照 |
| Phase 4.6 Radial | 自算连线端点与 cytoscape 渲染结果有偏差 | 改造前后 SVG 对照；端点算法与 `drawLeftRightMindMap` 现有实现对齐 |
| 网络/生态问题（本次升级遇到 TS7 与 ts-jest 冲突） | 阻塞验证 | 已固化在 `upgrade_deps.sh`；测试栈用 `tsx --test` |

---

## 附录 A · 证据索引

| 问题 | 文件:行 |
|---|---|
| `index.ts` 顶层副作用 | `packages/markmap/src/index.ts:1-10` |
| `globalIndex` 跨调用累加 | `packages/markmap/src/tree.ts:21-26` |
| 全局 theme 写入 | `packages/markmap/src/tree.ts:133` |
| 重复 import | `packages/markmap/src/tree.ts:8`、`:15` |
| 空函数 | `packages/markmap/src/tree.ts:31-32` |
| db 模块级单例 | `packages/markmap/src/db.ts:9-11` |
| logger 无条件 console.log | `packages/markmap/src/logger.ts:34` |
| logger 恒真分支/错误 bind | `packages/markmap/src/logger.ts:51-80` |
| 死代码 | `packages/markmap/src/bak-theme.ts`（481 行，0 引用） |
| decodeEntities 重复 | `packages/markmap/src/utils.ts:7`、`text.ts:285` |
| 超长词 O(n²) 测量 | `packages/markmap/src/text.ts:82-125` |
| 日志内 JSON.stringify（10 处） | `text.ts:432/439/608/625`、`tree.ts:85-87/170`、`theme/color/colormixer.ts:92/105` |
| splitText 递归 O(n²) | `packages/markmap/src/splitText.ts:46-75` |
| dp 原地排序 | `packages/markmap/src/dp.ts:69` |
| dp 最优解引用污染 | `packages/markmap/src/dp.ts:105` |
| flextree 日志字符串拼接 | `packages/markmap/src/flextree.ts:209`、`:245-249` |
| **布局分派表（cytoscape 只服务 Radial）** | `packages/markmap/src/markmap-renderer.ts:533-540` |
| **默认方向 Left_Right** | `packages/markmap/src/markmap-renderer.ts:552` |
| cytoscape 私有字段 | `packages/markmap/src/markmap-renderer.ts:66`、`:45-59`(module augmentation) |
| DOM 强绑定 | `packages/markmap/src/markmap-renderer.ts:144` |
| cose-bilkent 力导向布局 | `packages/markmap/src/markmap-renderer.ts:171-177` |
| 自算贝塞尔（可复用） | `packages/markmap/src/markmap-renderer.ts:336-372` |
| securityLevel 硬编码 | `packages/markmap/src/dom-renderer.ts:188-189` |
| 通配 exports | `packages/markmap/package.json` 的 `exports["./*"]` |
| 缺 types/files/sideEffects | 三个 `package.json` |
| **flextree 与上游等价（6 行差异）** | 对比 `d3-flextree@2.1.2` 源码，差异仅为 `version` 来源与日志续行 |
| **flextree 两次提交只是加日志** | `git show e7a7cd1`、`git show 5d2fd41` |
| **headless 下 cose-bilkent 可算布局** | 实测：`cytoscape({headless:true})` + `layout.run()` 得到真实坐标 |
| **headless 下 endpoint/rscratch 不可用** | 实测：`sourceEndpoint()` 报 `getSourceEndpoint is not a function`；`boundingBox()` 返回默认 3×3 |
| **当前布局是确定性的** | 实测：两次相同输入得到完全相同的坐标；`randomize:false` 得到另一套固定布局 |

## 附录 B · 验证命令

```bash
# 类型检查（Phase 1 起阻塞）
pnpm -r typecheck

# 构建 + 测试
pnpm -r build
pnpm -r test          # markmap 用 tsx --test，isomorphic 用 node --test

# 基线数据
pnpm -C packages/markmap run bench:measurement

# 发布前检查
npm pack --dry-run -w @anlijiu/markmap
```

> 注意：在当前受限环境下执行 pnpm 命令需带可写目录参数，见 `upgrade_deps.sh` 里的探测逻辑。
