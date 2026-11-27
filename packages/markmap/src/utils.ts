/**
 *
 * @param  text - text to be decoded
 * @returns
 */
export const decodeEntities = function (text: string): string {
  return text.replace(/ﬂ°°/g, '&#').replace(/ﬂ°/g, '&').replace(/¶ß/g, ';')
}

const HEX_STRINGS = '0123456789abcdef'
const MAP_HEX: Record<string, number> = {
  '0': 0,
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  a: 10,
  b: 11,
  c: 12,
  d: 13,
  e: 14,
  f: 15,
  A: 10,
  B: 11,
  C: 12,
  D: 13,
  E: 14,
  F: 15,
}
// Fast Uint8Array to nibble hex string
export function uint8ArrayToHex(nibbles: Uint8Array | number[] | undefined): string {
  return Array.from(nibbles || [])
    .map((b) => HEX_STRINGS[b & 15])
    .join('')
}

// Mimics Buffer.from(x, 'hex') logic
// Stops on first non-hex string and returns
// https://github.com/nodejs/node/blob/v14.18.1/src/string_bytes.cc#L246-L261
// 注意：入参保持宽松类型。原实现按字符索引取值，传入数组时会命中非十六进制字符
// 而提前结束（返回空），这里刻意保留这一行为，不做数组→字符串的转换。
export function uint8ArrayFromHex(hexString: any): Uint8Array {
  const bytes = new Uint8Array(Math.floor((hexString || '').length))
  let i: number
  for (i = 0; i < bytes.length; i++) {
    const a = MAP_HEX[hexString[i]]
    if (a === undefined) {
      break
    }
    bytes[i] = a
  }
  return i === bytes.length ? bytes : bytes.slice(0, i)
}
