import assert from 'node:assert/strict'
import test from 'node:test'

import { measureTextLineWithPretext } from '../src/text.ts'
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
