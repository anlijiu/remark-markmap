# @anlijiu/markmap

## 1.0.6

### Patch Changes

- Radial 布局修复：在 CoSE 结果上补两步后处理 —— 父子节点中心距不足时沿连线方向推开子树（`RADIAL_ARM_GAP`），再用网格分桶做矩形分离（`resolveOverlaps`）。`complex_nodes` 场景的节点重叠从 7 处降为 0，同时保持 CoSE 的紧凑构图，不再出现「臂太短、节点互压」。

## 1.0.5

### Patch Changes

- ESM 产物（`dist/markmap.core.mjs`）改为 external：第三方运行时依赖不再内联，交由消费者的 bundler 解析并 tree-shake。产物从 812 KB 降到约 79 KB。IIFE 产物（`dist/markmap.js`）保持全量打包，供浏览器 `<script>` 注入。

## 1.0.4

### Patch Changes

- Radial 布局改用 tidy 初始位置 + `cose-base@2.2` 的增量 CoSE：视觉保持 cose-bilkent 的成簇形态，10000 节点纯布局从约 65s 降到约 7s，并恢复确定性（固定种子 PRNG）。发布包排除 sourcemap、补充 README 与 LICENSE。
