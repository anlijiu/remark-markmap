const regexp = /((?<k1>(?!=)\S+)=((?<v1>(["'`])(.*?)\5)|(?<v2>\S+)))|(?<k2>\S+)/g

const mapToObject = (map: Map<string, any>) => Object.fromEntries(map.entries())
export function parseMeta(str?: string) {
  const io = (str ?? '').matchAll(regexp)

  return mapToObject(
    new Map(
      [...io]
        .map((item) => item?.groups)
        //@ts-ignore
        .map(({ k1, k2, v1, v2 }) => [k1 ?? k2, v1 ?? v2]),
    ),
  )
}

/**
 * object 的所有value 转成 string
 */
export function objectValueToString(o: any) {
  Object.keys(o).forEach((k) => {
    if (typeof o[k] === 'object') {
      // 注意：这里调用的是全局 toString（零参），原实现可疑；保持原状以免改变运行时行为。
      return (toString as any)(o[k])
    }

    o[k] = '' + o[k]
  })

  return o
}
