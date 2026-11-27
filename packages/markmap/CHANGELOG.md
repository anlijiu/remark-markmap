# @anlijiu/markmap

## 1.0.7

### Patch Changes

- 节点内换行链路修复：`createRichInlineItems` 的 break 由 `'never'` 改为 `'normal'`，启用 pretext 内置的 UAX#14 断行器 —— 英文按词断行、中文逐字断行、避头尾禁则（「）」不落行首、「（」不落行尾）、URL 按 `/` 断行，超长不可分词保留按字素硬切兜底，修复整段被硬切、英文断词、标点落错行的问题。换行预算由写死 200px 改为 `wrapWidthFor(fontSize)`（约 10em，clamp 160–480px），28px 节点从每行 7 个汉字提升到约 10 个；渲染后用 `getBBox()` 校准 canvas 度量约 3% 的偏窄偏差，避免节点背景偏窄导致文字溢出。同时修复 tspan 绝对 `y` 定位导致多文本块节点（文本与行内代码/图片交替）全部塌缩重叠的存量 bug（改为 `dy` 相对链式定位，单文本块基线逐像素不变），折行循环对亚像素浮点超宽（280.0012 > 280）不再误触发整词重切（此前同一文本会重复渲染 2–3 份）。

## 1.0.6

### Patch Changes

- Radial 布局修复：在 CoSE 结果上补两步后处理 —— 父子节点中心距不足时沿连线方向推开子树（`RADIAL_ARM_GAP`），再用网格分桶做矩形分离（`resolveOverlaps`）。`complex_nodes` 场景的节点重叠从 7 处降为 0，同时保持 CoSE 的紧凑构图，不再出现「臂太短、节点互压」。

## 1.0.5

### Patch Changes

- ESM 产物（`dist/markmap.core.mjs`）改为 external：第三方运行时依赖不再内联，交由消费者的 bundler 解析并 tree-shake。产物从 812 KB 降到约 79 KB。IIFE 产物（`dist/markmap.js`）保持全量打包，供浏览器 `<script>` 注入。

## 1.0.4

### Patch Changes

- Radial 布局改用 tidy 初始位置 + `cose-base@2.2` 的增量 CoSE：视觉保持 cose-bilkent 的成簇形态，10000 节点纯布局从约 65s 降到约 7s，并恢复确定性（固定种子 PRNG）。发布包排除 sourcemap、补充 README 与 LICENSE。
