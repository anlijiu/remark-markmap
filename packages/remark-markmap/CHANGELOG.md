# @anlijiu/remark-markmap

## 1.0.3

### Patch Changes

- Radial 布局改用 tidy 初始位置 + `cose-base@2.2` 的增量 CoSE：视觉保持 cose-bilkent 的成簇形态，10000 节点纯布局从约 65s 降到约 7s，并恢复确定性（固定种子 PRNG）。发布包排除 sourcemap、补充 README 与 LICENSE。
- Updated dependencies
  - @anlijiu/markmap@1.0.4
  - @anlijiu/markmap-isomorphic@1.0.3
