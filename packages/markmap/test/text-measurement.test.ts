import assert from 'node:assert/strict'
import test from 'node:test'

import { measureTextLineWithPretext, wrapWidthFor } from '../src/text.ts'
import type { MarkdownTextLine } from '../src/types.js'

class FakeCanvasRenderingContext2D {
  font = '16px sans-serif'

  measureText(text: string) {
    const fontSize = Number.parseFloat(this.font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? '16')
    const fontWeight = /\b(?:bold|[6-9]00)\b/.test(this.font) ? 1.1 : 1
    const fontStyle = /\bitalic\b/.test(this.font) ? 1.02 : 1

    let width = 0
    for (const char of [...text]) {
      if (char === ' ') {
        width += fontSize * 0.35
      } else if (/[\u4E00-\u9FFF]/u.test(char)) {
        width += fontSize
      } else {
        width += fontSize * 0.6
      }
    }

    return {
      width: width * fontWeight * fontStyle,
    }
  }
}

class FakeOffscreenCanvas {
  getContext() {
    return new FakeCanvasRenderingContext2D()
  }
}

globalThis.OffscreenCanvas = FakeOffscreenCanvas as never

function renderMeasuredLines(line: ReturnType<typeof measureTextLineWithPretext>) {
  return line.lines.map((wrappedLine) =>
    wrappedLine.fragments
      .map((fragment) => `${fragment.gapBefore > 0 ? ' ' : ''}${fragment.text}`)
      .join(''),
  )
}

function renderMeasuredContent(line: ReturnType<typeof measureTextLineWithPretext>) {
  return line.lines
    .flatMap((wrappedLine) => wrappedLine.fragments)
    .map((fragment) => `${fragment.gapBefore > 0 ? ' ' : ''}${fragment.text}`)
    .join('')
}

test('measureTextLineWithPretext keeps plain text on one line when width is sufficient', () => {
  const line: MarkdownTextLine = {
    type: 'text_line',
    words: [{ content: 'hello world', type: 'normal' }],
  }

  const measured = measureTextLineWithPretext(line, 240, 16)

  assert.equal(measured.lines.length, 1)
  assert.equal(renderMeasuredLines(measured)[0], 'hello world')
  assert.ok(measured.width > 0)
  assert.equal(measured.height, 16 * 1.1)
})

test('measureTextLineWithPretext wraps long text without DOM bbox measurement', () => {
  const line: MarkdownTextLine = {
    type: 'text_line',
    words: [
      { content: 'alpha', type: 'normal' },
      { content: 'beta', type: 'strong' },
      { content: 'gamma', type: 'emphasis' },
      { content: 'delta', type: 'delete' },
    ],
  }

  const measured = measureTextLineWithPretext(line, 70, 16)
  const renderedLines = renderMeasuredLines(measured)

  assert.ok(measured.lines.length > 1)
  assert.equal(renderedLines.join(' ').replace(/\s+/g, ' ').trim(), 'alpha beta gamma delta')
  assert.ok(measured.lines.every((wrappedLine) => wrappedLine.width <= 70))
  assert.equal(measured.height, measured.lines.length * 16 * 1.1)
})

test('measureTextLineWithPretext limits oversized single tokens by splitting graphemes when needed', () => {
  const line: MarkdownTextLine = {
    type: 'text_line',
    words: [{ content: 'supercalifragilisticexpialidocious', type: 'normal' }],
  }

  const measured = measureTextLineWithPretext(line, 50, 16)

  assert.ok(measured.lines.length > 1)
  assert.equal(renderMeasuredContent(measured), 'supercalifragilisticexpialidocious')
  assert.ok(measured.lines.every((wrappedLine) => wrappedLine.width <= 50))
})

// 以下为 break:'normal' 后 pretext 原生断行器（UAX#14）的行为测试：
// 词级断行、CJK 逐字断行、避头尾禁则。FakeCanvas 以 CJK=16px、Latin≈8.8px 近似。

test('measureTextLineWithPretext breaks CJK text per character without kinsoku violations', () => {
  const content = '第一句内容比较长需要折行显示。下一句从这里继续写更多内容直到换行'
  const line: MarkdownTextLine = {
    type: 'text_line',
    words: [{ content, type: 'normal' }],
  }

  const measured = measureTextLineWithPretext(line, 200, 16)

  assert.ok(measured.lines.length > 1)
  assert.equal(renderMeasuredContent(measured), content)
  assert.ok(measured.lines.every((wrappedLine) => wrappedLine.width <= 200))
  // 禁则：句号、逗号等闭类标点不能出现在行首
  for (const rendered of renderMeasuredLines(measured)) {
    assert.doesNotMatch(rendered, /^[。，、；：？！）】」》]/)
  }
})

test('measureTextLineWithPretext breaks latin text at word boundaries', () => {
  const content = 'the quick brown fox jumps over the lazy dog'
  const line: MarkdownTextLine = {
    type: 'text_line',
    words: [{ content, type: 'normal' }],
  }

  const measured = measureTextLineWithPretext(line, 200, 16)
  const renderedLines = renderMeasuredLines(measured)

  assert.ok(measured.lines.length > 1)
  assert.equal(renderedLines.join(' ').replace(/\s+/g, ' ').trim(), content)
  assert.ok(measured.lines.every((wrappedLine) => wrappedLine.width <= 200))
  // 每行都以完整单词收尾（不把单词切成两半）
  for (const rendered of renderedLines) {
    const words = rendered.trim().split(' ')
    assert.ok(
      words.every((word) => content.split(' ').includes(word)),
      `行内出现被切断的词: ${rendered}`,
    )
  }
})

test('measureTextLineWithPretext keeps closing brackets off line starts when wrapping brackets', () => {
  const content = '括号测试（这里是括号内的很长内容需要换行的时候看看左括号会不会留在行尾）完毕'
  const line: MarkdownTextLine = {
    type: 'text_line',
    words: [{ content, type: 'normal' }],
  }

  const measured = measureTextLineWithPretext(line, 200, 16)

  assert.ok(measured.lines.length > 1)
  assert.equal(renderMeasuredContent(measured), content)
  for (const rendered of renderMeasuredLines(measured)) {
    assert.doesNotMatch(rendered, /^[）」』】]/, `闭括号出现在行首: ${rendered}`)
    assert.doesNotMatch(rendered, /[（「『【]$/, `开括号出现在行尾: ${rendered}`)
  }
})

test('wrapWidthFor scales with font size and clamps to sane bounds', () => {
  assert.equal(wrapWidthFor(16), 160)
  assert.equal(wrapWidthFor(28), 280)
  assert.equal(wrapWidthFor(38), 380)
  assert.equal(wrapWidthFor(50), 480) // 上限保护
  assert.equal(wrapWidthFor(10), 160) // 下限保护
})
