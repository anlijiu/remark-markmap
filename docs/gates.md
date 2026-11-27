# 工程门禁与验证纪律（Gates）

> 本文件是 [AGENTS.md](../AGENTS.md) 的细则：提交代码、跑 typecheck/lint/format、看 CI 前读它。
> 本仓库是 pnpm workspace（`packages/markmap`、`packages/markmap-isomorphic`、`packages/remark-markmap`），
> 下面所有命令都在仓库根执行，除非特别说明。

## 门禁层级

| 级别 | 触发 | 实际动作 |
| --- | --- | --- |
| L1 pre-commit | `git commit` → `.husky/pre-commit` | 只处理暂存文件：`eslint --fix` 先、`prettier --write` 后，再把改动重新 `git add` |
| L2 commit-msg | `git commit` → `.husky/commit-msg` | `commitlint` 校验提交信息（配置见 `commitlint.config.js`） |
| L3 CI | push / PR → `.github/workflows/ci.yml` | `install --frozen-lockfile` → `build` → `build:types` → `typecheck` → `lint` → `test`；另有每周定时的 `outdated` / `audit`（`continue-on-error`） |

- **顺序不能换**：`prettier` 在 `eslint --fix` 之后，prettier 有最终话语权。反过来会把 eslint 留下的格式扰动带进提交。
- **钩子修改过的文件以提交内容为准**：commit 前跑过的检查未必覆盖钩子的修改，重要提交后建议对 HEAD 复跑一次 `pnpm lint`。
- CI 没有 `format:check`、没有 `knip`、也不校验提交信息——这三项目前只在本地（pre-commit / commit-msg）或手动执行。

## 首次 clone

```bash
pnpm install        # 触发根 package.json 的 prepare → husky，设置 core.hooksPath=.husky/_
pnpm -r build:types # typecheck 依赖各包的 dist/types
```

- 受限环境（`.git/config` 只读、沙箱、CI 缓存目录只读）下 `husky` 可能装不上，此时钩子不会生效。
  在有写权限的终端补一次：`pnpm exec husky`（或 `git config core.hooksPath .husky/_`）。
- 本地不限制 pnpm 版本（根 `package.json` 不再声明 `packageManager`）；CI 通过 `pnpm/action-setup` 固定 `10.33.0` 以保证可复现。
  `pnpm-lock.yaml` 是 `lockfileVersion: '9.0'`，pnpm 10/11/12 均可读取。

## 提交信息（commitlint）

规则在 `commitlint.config.js`：

- 继承 `@commitlint/config-conventional`：`type(scope): subject`，type 取 `feat|fix|docs|perf|refactor|test|build|ci|chore|revert|style`。
- `header-max-length`、`body-max-line-length`、`footer-max-line-length` 均为 100。
- `subject-case` 禁止大写开头与全大写缩写：写 `fix` 不写 `Fix`，写 `api` 不写 `API`。
  中文 subject 不受大小写影响，但不要以大写英文单词开头。
- footer 承载 `Assisted-by` trailer（AI 辅助提交必填，格式见 [contribution.md](contribution.md)）。
- 被拒后按报错改写，不要 `--no-verify` 绕过。

```text
perf(markmap): radial 布局改用 d3-force

<正文：动机、方案、验证结果>

Assisted-by: Reasonix | unknown/unknown | Runtime: unknown
```

## 代码检查范围

| 检查 | 命令 | 范围 / 说明 |
| --- | --- | --- |
| typecheck | `pnpm typecheck`（= `pnpm -r typecheck`） | 各包 `tsc --noEmit`；依赖包需先 `pnpm -r build:types` |
| lint | `pnpm lint`（= `eslint .`） | `eslint.config.js` 的 `files` 限定为 `packages/*/src/**/*.ts` 与 `packages/*/test/**/*.ts` |
| format | `pnpm format` / `pnpm format:check` | Prettier，配置在 `.prettierrc.json`，忽略项在 `.prettierignore` |
| 测试 | `pnpm -r test` | 三个包的后端不同：markmap 用 `tsx --test`，remark-markmap 用 `jest`，markmap-isomorphic 用 `node --test dist/test.js`（需先 build） |
| 构建 | `pnpm -r build` + `pnpm -r build:types` | esbuild 产物在 `dist/`，类型在 `dist/types` |
| 渲染预览 | `pnpm preview`（可加 `-- --only=radial`） | 需要本机 Chrome/Chromium；产物在 `.render-preview/`（gitignore） |

- **`format:check` 目前会报存量文件**：仓库里约 34 个源码文件还没统一成 Prettier 格式。
  pre-commit 只格式化**本次暂存的文件**，因此存量会逐步收敛；全量格式化要单独做一次提交，不要混在功能改动里。
- Markdown 与 lockfile 不在格式化范围内（`.prettierignore`）。

## 提交红线

- 不提交 `dist/`、`node_modules/`、`coverage/`、`.render-preview/`、`graphify-out/`、`.husky/_/`。
- `pnpm-lock.yaml` 只在依赖变化时提交，且必须是 `pnpm install` 生成的结果，不要手改。
- 部分暂存（`git add -p`）与 pre-commit 钩子不兼容：钩子会把整个文件重新 `git add`，未暂存的 hunk 也会被提交。
  需要部分暂存时，先把该文件完整暂存，或这次用 `git commit --no-verify` 并自行保证格式。

## 排查提示

- 跑门禁时不要把输出管道给 `tail` / `head` / `grep`：退出码取最后一条命令，会把失败显示成成功。
- 本机 pnpm 壳异常时，可用各包 `./node_modules/.bin/<tsc|eslint|prettier>` 直连；`prettier` 与 `commitlint` 在根 `node_modules/.bin`。
- `.husky/_/` 是安装产物（已 gitignore）；钩子文件本身（`.husky/pre-commit`、`.husky/commit-msg`）要提交。
