import { darken, lighten, isDark } from 'khroma'
import theme, { overridesThemeVariables } from './theme'
import { log } from './logger'
export type DiagramStylesProvider = (options?: any) => string

log.debug('getStyles  theme: ', theme)

// TODO: These options seem incorrect.
export const getStyles: DiagramStylesProvider = (options = theme) =>
  `
[data-rehype-pretty-code-figure] code[data-theme*=' '],
[data-rehype-pretty-code-figure] code[data-theme*=' '] span {
  color: var(--shiki-light) !important;
  background-color: var(--shiki-light-bg) !important;
}

svg[data-theme='dark'] {
  [data-rehype-pretty-code-figure] code[data-theme*=' '],
  [data-rehype-pretty-code-figure] code[data-theme*=' '] span {
    color: var(--shiki-dark) !important;
    background-color: var(--shiki-dark-bg) !important;
  }
}
pre,figure {
  margin: 0;
  line-height: 1.68;
}
text {
  font-family: "trebuchet ms", verdana, arial, sans-serif;
}
code {
  font-family: ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,Liberation Mono,Courier New,monospace;
}
a {
  text-decoration: underline;
}
.section-root {
  text {
    font-size: ${options.fontSize(0)}px;
  }
}
.icon-container {
  height:100%;
  display: flex;
  justify-content: center;
  align-items: center;
}
.mindmap-node-label {
  dy: 1em;
  alignment-baseline: middle;
  text-anchor: middle;
  dominant-baseline: middle;
  text-align: center;
}
`
export default getStyles
