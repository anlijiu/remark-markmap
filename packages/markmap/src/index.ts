import { log, setLogLevel } from './logger'
import { render, renderMock } from './dom-renderer'
import { buildTree } from './tree'
import { markmap as markmapHandler } from './handler'

export * from './logger'
export * from './dom-renderer'
export * from './handler'
export * from './tree'
export * from './types'

const markmap = {
  buildTree,
  markmapHandler,
  render,
  renderMock,
  setLogLevel,
  log,
}

export default markmap
