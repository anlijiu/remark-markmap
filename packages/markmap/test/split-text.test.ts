import assert from 'node:assert/strict'
import test from 'node:test'

import { splitLineToFitWidth, splitWordToFitWidth } from '../src/splitText'
import type { MarkdownTextLine } from '../src/types'

/** 参考实现：模拟旧的「逐字符累加」逻辑，用来校验 galloping 版本的结果是否等价。 */
function referenceSplit(content: string, fitCount: number): [string, string] {
  const chars = Array.from(content)
  let count = 0
  for (let i = 1; i <= chars.length; i++) {
    if (i <= fitCount) count = i
    else break
  }
  if (count === 0) count = 1
  return [chars.slice(0, count).join(''), chars.slice(count).join('')]
}

const makeCheckFit = (fitCount: number) => (line: MarkdownTextLine) => {
  const text = line.words.map((w) => w.content).join('')
  return text.length <= fitCount
}

test('splitWordToFitWidth 与逐字符累加的结果一致', () => {
  const content = 'abcdefghij'

  for (const fitCount of [1, 3, 5, 9, 10, 20]) {
    const [head, tail] = splitWordToFitWidth(makeCheckFit(fitCount) as never, {
      content,
      type: 'normal',
    })
    const [refHead, refTail] = referenceSplit(content, fitCount)

    assert.equal(head.content, refHead, `fitCount=${fitCount} 头部不一致`)
    assert.equal(tail.content, refTail, `fitCount=${fitCount} 尾部不一致`)
  }
})

test('splitWordToFitWidth 在首字符就超宽时仍切出一个字符', () => {
  const [head, tail] = splitWordToFitWidth(makeCheckFit(0) as never, {
    content: 'abc',
    type: 'normal',
  })

  assert.equal(head.content, 'a')
  assert.equal(tail.content, 'bc')
})

test('splitWordToFitWidth 处理空内容', () => {
  const [head, tail] = splitWordToFitWidth(makeCheckFit(5) as never, {
    content: '',
    type: 'normal',
  })

  assert.equal(head.content, '')
  assert.equal(tail.content, '')
})

test('splitLineToFitWidth 切分后不丢字符', () => {
  const line: MarkdownTextLine = {
    type: 'text_line',
    words: [{ content: 'abcdefghijklmnop', type: 'normal' }],
  }

  const lines = splitLineToFitWidth(line, makeCheckFit(5) as never)
  const joined = lines
    .flatMap((l) => l.words.map((w) => w.content))
    .join('')
    .replace(/\s/g, '')

  assert.equal(joined, 'abcdefghijklmnop')
  assert.ok(lines.length > 1, '超长行应被切成多行')
})
