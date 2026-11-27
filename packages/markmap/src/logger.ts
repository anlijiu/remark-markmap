/* eslint-disable no-console */

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

export const LEVELS: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
}

/**
 * 日志参数。传函数时按惰性求值：只有该级别真正输出才会调用。
 *
 * 用于热路径里的昂贵表达式，例如：
 *   log.debug('item: ', () => JSON.stringify(item, undefined, 2))
 * 日志关闭时不会产生任何序列化开销。
 *
 * 注意：参数若是函数，会被当作取值器调用一次，因此不要直接把函数本身当日志内容。
 */
export type LogArg = unknown | (() => unknown)

type ConsoleMethod = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_STYLE: Record<LogLevel, { method: ConsoleMethod; color: string }> = {
  trace: { method: 'debug', color: 'color: gray' },
  debug: { method: 'debug', color: 'color: lightgreen' },
  info: { method: 'info', color: 'color: lightblue' },
  warn: { method: 'warn', color: 'color: orange' },
  error: { method: 'error', color: 'color: red' },
  fatal: { method: 'error', color: 'color: magenta' },
}

/** 默认与旧实现一致：只输出 fatal。 */
let currentLevel: number = LEVELS.fatal

function timestamp(): string {
  const now = new Date()
  const seconds = String(now.getSeconds()).padStart(2, '0')
  const millis = String(now.getMilliseconds()).padStart(3, '0')
  return `${seconds}.${millis}`
}

function resolveArgs(args: LogArg[]): unknown[] {
  return args.map((arg) => (typeof arg === 'function' ? (arg as () => unknown)() : arg))
}

function emit(level: LogLevel, args: LogArg[]): void {
  if (LEVELS[level] < currentLevel) return
  const { method, color } = LEVEL_STYLE[level]
  console[method](`%c${timestamp()} : ${level.toUpperCase()} : `, color, ...resolveArgs(args))
}

export const log = {
  trace: (...args: LogArg[]) => emit('trace', args),
  debug: (...args: LogArg[]) => emit('debug', args),
  info: (...args: LogArg[]) => emit('info', args),
  warn: (...args: LogArg[]) => emit('warn', args),
  error: (...args: LogArg[]) => emit('error', args),
  fatal: (...args: LogArg[]) => emit('fatal', args),
  /** 判断某个级别当前是否会输出，用于在调用处避免构造昂贵参数。 */
  isEnabled: (level: LogLevel) => LEVELS[level] >= currentLevel,
}

/**
 * Sets a log level
 *
 * @param level - The level to set the logging to. Default is `"fatal"`.
 *   数字按 `LEVELS` 的序数处理（0=trace … 5=fatal）。
 */
export const setLogLevel = function (level: keyof typeof LEVELS | number | string = 'fatal') {
  if (typeof level === 'string') {
    const key = level.toLowerCase()
    if (key in LEVELS) {
      currentLevel = LEVELS[key as LogLevel]
    }
    return
  }
  if (typeof level === 'number') {
    currentLevel = level
  }
}
