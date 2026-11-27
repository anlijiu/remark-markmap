# 类型检查基线（Phase 0.3）

> 记录时间：2026-11-26
> 工具：`tsc`（typescript 7.0.2，原生编译器）
> 目的：为后续阶段提供"改前/改后"的可比对数字

---

## 1. 基线错误数

命令：`cd packages/<pkg> && ./node_modules/.bin/tsc --noEmit`

| 包 | 错误数 | 主要分布 |
|---|---:|---|
| `@anlijiu/markmap` | **374** | TS7006×215、TS2835×57、TS7031×27、TS2339×21、TS2554×8、TS2322×7、TS2550×6、TS2551×5、TS2304×4、TS7016×3 |
| `@anlijiu/markmap-isomorphic` | **7** | TS2591×4（`node:assert` 等找不到）、TS2339×3（`console.profile` 不在 `Console` 类型上） |
| `@anlijiu/remark-markmap` | **10** | TS7006×6、TS7016×2、TS2554×1、TS2353×1 |
| **合计** | **391** | |

典型错误样本：

```
src/hook-page-console.ts(48,20): error TS2339: Property 'profile' does not exist on type 'Console'.
src/test.ts(1,20): error TS2591: Cannot find name 'node:assert/strict'. ... add 'node' to the types field of your tsconfig.
src/handlers.ts(2,28): error TS7006: Parameter 'state' implicitly has an 'any' type.
```

---

## 2. 决策 A（`moduleResolution: bundler`）的实测收益

验证命令（命令行覆盖，未改文件）：

```bash
tsc --noEmit --module esnext --moduleResolution bundler
```

| 指标 | 改前 | 改后 |
|---|---:|---:|
| markmap 错误总数 | 374 | **332** |
| `TS2835`（缺扩展名） | 57 | **0** |
| `TS7006`（隐式 any） | 215 | 210 |
| `TS2339` | 21 | 30（↑9） |
| `TS2554` | 8 | 10（↑2） |
| `TS7053` | 0 | 6（↑6） |

**结论**：净减 42 个错误，但会**暴露约 17 个原本被掩盖的类型问题**。这是好事 —— bundler 解析更完整，把之前因模块解析失败而没走到类型检查的代码跑了。Phase 1.1 按此执行。

---

## 3. 重要发现：`remark-markmap` 实际用的是 registry 上的旧包

`remark-markmap` 的类型检查暴露了这条错误：

```
src/remark-markmap.ts(6,8): error TS7016: Could not find a declaration file for module '@anlijiu/markmap-isomorphic'.
'/home/an/workspace/js/remark-markmap/node_modules/.pnpm/@anlijiu+markmap-isomorphic@1.0.2/...'
```

路径里的 `.pnpm/@anlijiu+markmap-isomorphic@1.0.2/` 说明：**pnpm 从 npm registry 安装了 `@anlijiu/markmap-isomorphic`，而不是链接到 workspace 里的本地包**。

原因：包内 `dependencies` 写的是 `"@anlijiu/markmap-isomorphic": "^1.0.2"`，而 pnpm 10 默认 `link-workspace-packages=false`，所以按 registry 解析。

**影响**：

1. 本地对 `markmap-isomorphic` 的任何修改，`remark-markmap` 都看不到 —— 调试时极易误判；
2. 本地包没有 `types` 导出，所以这里必然 `TS7016`；
3. 这也解释了升级依赖时出现的 `ERR_PNPM_OUTDATED_LOCKFILE`（manifest `^1.0.3` vs lockfile `workspace:*`）。

**处置**：这是计划 Phase 2.5（包间依赖改 `workspace:*`）的直接依据，优先级应从 P1 提到 **P0**（它影响本地开发正确性，不只是版本漂移）。

---

## 4. `build:types` 状态

```bash
pnpm -C packages/markmap run build:types
```

**失败**（exit 2），错误与上面的 TS2835/TS7006 同源。注意：

- `build`（esbuild）**不依赖** `build:types`（见 `packages/markmap/package.json` 的 wireit 配置）；
- 仓库无 CI，所以这条命令实际上从未被自动化执行过 —— 这就是 391 个错误能积累到今天的原因。

---

## 5. 测试现状

| 包 | 命令 | 结果 |
|---|---|---|
| `@anlijiu/markmap` | `tsx --test test/*.test.ts` | 3 passed |
| `@anlijiu/markmap-isomorphic` | `node --test dist/test.js` | 3 passed |
| `@anlijiu/remark-markmap` | `jest --passWithNoTests` | 0 tests, exit 0 |

`markmap-isomorphic` 的测试跑的是 `dist/test.js`，**需要先 `pnpm -r build`**，否则跑的是上一次的构建产物。

---

## 6. Lint 基线（Phase 0.4）

`eslint@10.15.0` + `typescript-eslint@8.74.0`，配置见仓库根 `eslint.config.js`。

| 指标 | 数值 |
|---|---|
| error | **0** |
| warning | 195（其中 91 个可 `--fix`） |
| 主要 warning 来源 | `@typescript-eslint/no-unused-vars`×81、`no-console`、`ban-ts-comment`×4、`no-namespace`×1 |

**TS 版本双轨**（必须知道，否则容易困惑）：

```
根 node_modules/typescript        → 6.0.2   （npm:@typescript/typescript6，专供 eslint）
packages/*/node_modules/typescript → 7.0.2   （各包 devDependency，供 tsc/esbuild）
```

原因：`typescript-eslint@8` 不支持 TS 7（TS7 移除了 JS compiler API），而项目主线要用 TS 7。两套并存已验证互不影响。

---

## 6. 复现命令

```bash
# 单包类型检查
cd packages/markmap && ./node_modules/.bin/tsc --noEmit

# 全量（Phase 0.1 引入的入口）
pnpm -r typecheck

# bundler 改造的验证
cd packages/markmap && ./node_modules/.bin/tsc --noEmit --module esnext --moduleResolution bundler
```

> 受限环境下 `pnpm` 命令需要可写目录参数，见 `upgrade_deps.sh`。
