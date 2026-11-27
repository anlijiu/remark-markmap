/**
 * 提交信息校验（pre-commit 之后的 commit-msg 钩子）。
 * 规则与 docs/gates.md「提交红线与 commitlint」保持一致。
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // 标题和正文每行不超过 100 字符
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [2, 'always', 100],
    // footer 同时承载 Assisted-by trailer（见 docs/contribution.md）
    'footer-max-line-length': [2, 'always', 100],
    // subject 不要大写开头，也不要全大写缩写（写 fix，不写 Fix；写 api，不写 API）
    'subject-case': [2, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],
  },
}
