import tseslint from 'typescript-eslint'

/**
 * Phase 0.4：先把 lint 跑起来，规则从宽。
 *
 * 现状（见 docs/baseline.md）：三个包共 391 个类型错误，代码里还有大量 any、
 * 注释掉的旧代码和 unused 变量。一次性全开会让 lint 永远红，失去信号价值。
 *
 * 策略：
 *  - 只检查 packages/<pkg>/src 与 test；
 *  - error 级只保留"几乎不可能误报"的几类，其余先降为 warn，随 Phase 1 再收紧。
 *
 * 注意：typescript-eslint 8.x 不支持 TS 7（TS7 移除了 JS compiler API），
 * 所以根目录额外装了 `typescript@npm:@typescript/typescript6` 供 lint 使用，
 * 各包自己的 devDependencies 仍是 typescript 7（构建用）。
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.wireit/**',
      '**/coverage/**',
      // 仓库根目录的历史草稿与临时脚本
      '*.mjs',
      'test/**',
      'publish',
      'upgrade_deps.sh',
    ],
  },

  {
    files: ['packages/*/src/**/*.ts', 'packages/*/test/**/*.ts'],

    extends: [...tseslint.configs.recommended],

    rules: {
      // 现有代码大量使用 any，且 D3 类型被显式声明为 any，先不阻塞
      '@typescript-eslint/no-explicit-any': 'off',
      // 大量未使用参数与遗留代码，Phase 1 清理
      '@typescript-eslint/no-unused-vars': 'warn',
      // 需要时用 @ts-ignore 绕过第三方类型定义不准的问题
      '@typescript-eslint/ban-ts-comment': 'warn',
      // 空函数（如 tree.ts 的 consumeText）
      'no-empty': 'warn',
      // logger.ts 本身就用 console，调试残留另行清理
      'no-console': 'warn',
      'prefer-const': 'warn',
      'no-useless-escape': 'warn',
      'no-control-regex': 'warn',
      // theme/color/invert.ts 用了 namespace（Phase 1 再改模块化）
      '@typescript-eslint/no-namespace': 'warn',
      // 不能容忍的
      'no-var': 'error',
      'no-debugger': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
    },
  },
)
