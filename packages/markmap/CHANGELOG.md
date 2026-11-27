# @anlijiu/markmap

## 1.0.5

### Patch Changes

- ESM 产物（`dist/markmap.core.mjs`）改为 external：第三方运行时依赖不再内联，交由消费者的 bundler 解析并 tree-shake。产物从 812 KB 降到约 79 KB。IIFE 产物（`dist/markmap.js`）保持全量打包，供浏览器 `<script>` 注入。

## 1.0.4

### Patch Changes

- Radial 布局改用 tidy 初始位置 + `cose-base@2.2` 的增量 CoSE：视觉保持 cose-bilkent 的成簇形态，10000 节点纯布局从约 65s 降到约 7s，并恢复确定性（固定种子 PRNG）。发布包排除 sourcemap、补充 README 与 LICENSE。
