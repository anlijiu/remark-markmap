#!/usr/bin/env bash
#
# upgrade_deps.sh —— 把本 monorepo 的依赖升级到 npm 上的 latest 版本。
#
# 用法:
#   ./upgrade_deps.sh                 全部升级到 latest（含大版本跳跃）
#   ./upgrade_deps.sh --minor         只在 package.json 现有 semver 范围内升级
#   ./upgrade_deps.sh --install-only  只重装依赖，不升级
#   ./upgrade_deps.sh --fresh         不复用旧 store 缓存（默认会尽量复用）
#   ./upgrade_deps.sh --verify        升级后跑 pnpm -r build 做一次构建验证
#
# 为什么需要这个脚本，而不是直接 `pnpm update -r --latest`：
#
#   1) store / global-dir / state-dir 只读
#      pnpm 默认往 ~/.local/share/pnpm/store、~/.local/share/pnpm/global、
#      ~/.local/state/pnpm 写东西。这些路径在受限环境（容器、只读挂载、
#      沙箱）里可能是只读的，会报：
#        ERR_PNPM_EROFS              —— tarball 写不进 store，一直 downloaded 0
#        ERR_PNPM_LOCKFILE_WRITE_FILE
#        ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK
#        以及 "lock the package-manager engine store" 之类
#      脚本会探测可写性，必要时把这些目录切到 $XDG_CACHE_HOME 下。
#
#   2) XDG_RUNTIME_DIR 只读
#      pnpm 在 /run/user/$UID 下建 "pnpm-store-operation-locks-<uid>" 等锁目录，
#      该路径只读时报 EROFS。脚本会把它指到 TMPDIR 下的可写目录。
#
#   3) node_modules 与 store 位置不一致
#      换 store 后 pnpm 会直接拒绝：
#        ERR_PNPM_UNEXPECTED_STORE ... reinstall your dependencies with "pnpm install"
#      所以换 store 之前必须先 `pnpm install` 一次。
#
#   4) lockfile 与 package.json 的 specifier 本身就不一致
#      （例如 packages/markmap-isomorphic 里 @anlijiu/markmap 写的是 ^1.0.3，
#       而 pnpm-lock.yaml 里记的是 workspace:*）
#      于是 install 必须允许改写 lockfile，否则报 ERR_PNPM_OUTDATED_LOCKFILE。
#      注意用 --config.frozen-lockfile=false 而不是 --no-frozen-lockfile：
#      后者只有 install/dedupe 认，update 会直接报
#        ERROR Unknown option: 'frozen-lockfile'
#      走 --config.* 这条通道则对所有子命令都有效。
#
#   5) 没有 TTY 时会中止删除 node_modules
#      报 ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY，需要
#      --config.confirmModulesPurge=false。
#
#   6) registry 慢
#      脚本调低了并发、放宽了重试与超时，避免 3~10 KiB/s 的真实带宽下
#      被默认参数判死。
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

MODE=latest          # latest | minor | install
REUSE_STORE=1
DO_VERIFY=0

usage() {
  sed -n '3,10p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

for arg in "$@"; do
  case "$arg" in
    --latest)       MODE=latest ;;
    --minor)        MODE=minor ;;
    --install-only) MODE=install ;;
    --fresh)        REUSE_STORE=0 ;;
    --verify)       DO_VERIFY=1 ;;
    -h|--help)      usage; exit 0 ;;
    *) echo "未知参数: $arg（用 --help 查看用法）" >&2; exit 2 ;;
  esac
done

say() { printf '\n==> %s\n' "$*"; }

# 探测目录是否真的可写：只读挂载下 [ -w ] 仍可能为真，所以实际写一个探针文件。
pick_writable_dir() {
  local primary="$1" fallback="$2" probe
  for probe in "$primary" "$fallback"; do
    if mkdir -p "$probe" 2>/dev/null && [ -w "$probe" ] \
       && { : >"$probe/.write-probe.$$"; } 2>/dev/null; then
      rm -f "$probe/.write-probe.$$"
      printf '%s\n' "$probe"
      return 0
    fi
  done
  echo "错误: $primary 和 $fallback 都不可写" >&2
  return 1
}

XDG_CACHE_HOME="${XDG_CACHE_HOME:-$HOME/.cache}"
XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
XDG_STATE_HOME="${XDG_STATE_HOME:-$HOME/.local/state}"
TMP_BASE="${TMPDIR:-/tmp}"

# ---- 1. store ---------------------------------------------------------------
DEFAULT_STORE="$XDG_DATA_HOME/pnpm/store"
if { mkdir -p "$DEFAULT_STORE" 2>/dev/null && { : >"$DEFAULT_STORE/.write-probe.$$"; } 2>/dev/null; }; then
  rm -f "$DEFAULT_STORE/.write-probe.$$"
  STORE_DIR="$DEFAULT_STORE"
elif [ -n "${PNPM_STORE_DIR:-}" ]; then
  STORE_DIR="$(pick_writable_dir "$PNPM_STORE_DIR" "$XDG_CACHE_HOME/pnpm-store")"
else
  STORE_DIR="$(pick_writable_dir "$XDG_CACHE_HOME/pnpm-store" "$TMP_BASE/pnpm-store")"
fi

# ---- 2. global-dir / state-dir ---------------------------------------------
GLOBAL_DIR="$(pick_writable_dir "$XDG_DATA_HOME/pnpm/global" "$XDG_CACHE_HOME/pnpm-global")"
STATE_DIR="$(pick_writable_dir "$XDG_STATE_HOME/pnpm" "$XDG_CACHE_HOME/pnpm-state")"

# ---- 3. XDG_RUNTIME_DIR（pnpm 的进程锁放这里） ------------------------------
DEFAULT_RUNTIME="/run/user/$(id -u)"
RUNTIME_DIR="$(pick_writable_dir "$DEFAULT_RUNTIME" "$TMP_BASE/pnpm-runtime-$(id -u)")"
export XDG_RUNTIME_DIR="$RUNTIME_DIR"

# ---- 4. 复用旧 store 缓存 ---------------------------------------------------
# 网络慢的时候这一条是关键：把已有 store 直接复制过去，避免全量重新下载。
if [ "$REUSE_STORE" = 1 ] && [ "$STORE_DIR" != "$DEFAULT_STORE" ] \
   && [ -d "$DEFAULT_STORE" ] && [ -z "$(ls -A "$STORE_DIR" 2>/dev/null)" ]; then
  say "复用已有 store 缓存: $DEFAULT_STORE -> $STORE_DIR"
  cp -a "$DEFAULT_STORE/." "$STORE_DIR/" 2>/dev/null || echo "    复制失败，接下来会重新下载（可能很慢）"
fi

say "运行目录"
cat <<EOF
  repo        : $REPO_ROOT
  pnpm        : $(pnpm --version 2>/dev/null || echo '未安装')
  store-dir   : $STORE_DIR
  global-dir  : $GLOBAL_DIR
  state-dir   : $STATE_DIR
  runtime-dir : $RUNTIME_DIR
  mode        : $MODE
EOF

# 注意：这里必须用 --key=value 的等号形式。
# 写成 `--config.global-dir /path`（空格分隔）时 pnpm 会把开关解析成布尔 true，
# 路径沦为位置参数，接着报
#   ERROR The "path" argument must be of type string. Received type boolean (true)
# 并附带一句 "For help, run: pnpm help add"。
PNPM_ARGS=(
  "--store-dir=$STORE_DIR"
  "--config.global-dir=$GLOBAL_DIR"
  "--config.state-dir=$STATE_DIR"
  "--config.confirmModulesPurge=false"
  "--config.frozen-lockfile=false"
  "--network-concurrency=${PNPM_NETWORK_CONCURRENCY:-8}"
  "--fetch-retries=${PNPM_FETCH_RETRIES:-5}"
  "--fetch-timeout=${PNPM_FETCH_TIMEOUT:-120000}"
)

# ---- 5. 先重装：换 store / node_modules 缺失 / lockfile 与 manifest 不一致都需要 --
say "重装依赖（node_modules 会被重建）"
pnpm install "${PNPM_ARGS[@]}"

# ---- 6. 升级 ---------------------------------------------------------------
case "$MODE" in
  install)       say "跳过升级（--install-only）" ;;
  latest)        say "升级所有 workspace 依赖到 latest"; pnpm update -r --latest "${PNPM_ARGS[@]}" ;;
  minor)         say "在现有 semver 范围内升级";         pnpm update -r "${PNPM_ARGS[@]}" ;;
esac

# ---- 7. 可选：构建验证 ------------------------------------------------------
if [ "$DO_VERIFY" = 1 ]; then
  say "构建验证"
  pnpm -r build
fi

# ---- 8. 报告 ---------------------------------------------------------------
say "升级后仍可更新的依赖"
pnpm outdated -r || true

say "变更摘要"
git --no-pager diff --stat -- package.json 'packages/*/package.json' pnpm-lock.yaml || true

say "package.json 的版本变化（请逐条确认，大版本跳跃尤其要留意）"
git --no-pager diff -- package.json 'packages/*/package.json' || true

cat <<'EOF'

下一步建议：
  1. 检查上面的 package.json diff，确认没有把 workspace 内部依赖（@anlijiu/*）
     误改成 registry 上的发布版本。
  2. 跑一次构建与测试：pnpm -r build && pnpm -r test
  3. 确认无误后再提交 package.json + pnpm-lock.yaml。
EOF
