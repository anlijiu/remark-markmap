import type { CheckFitFunction, MarkdownTextLine, MarkdownWord, MarkdownWordType } from './types.js'

/**
 * Splits a string into graphemes if available, otherwise characters.
 */
export function splitTextToChars(text: string): string[] {
  if (Intl.Segmenter) {
    return [...new Intl.Segmenter().segment(text)].map((s) => s.segment)
  }
  return [...text]
}

/**
 * Splits a string into words by using `Intl.Segmenter` if available, or splitting by ' '.
 * `Intl.Segmenter` uses the default locale, which might be different across browsers.
 */
export function splitLineToWords(text: string): string[] {
  if (Intl.Segmenter) {
    return [...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text)].map(
      (s) => s.segment,
    )
  }
  // Split by ' ' removes the ' 's from the result.
  const words = text.split(' ')
  // Add the ' 's back to the result.
  const wordsWithSpaces = words.flatMap((s) => [s, ' ']).filter((s) => s)
  // Remove last space.
  wordsWithSpaces.pop()
  return wordsWithSpaces
}

/**
 * Splits a word into two parts, the first part fits the width and the remaining part.
 * @param checkFit - Function to check if word fits
 * @param word - Word to split
 * @returns [first part of word that fits, rest of word]
 */
export function splitWordToFitWidth(
  checkFit: CheckFitFunction,
  word: MarkdownWord,
): [MarkdownWord, MarkdownWord] {
  const characters = splitTextToChars(word.content)
  if (characters.length === 0) {
    return [
      { content: '', type: word.type },
      { content: '', type: word.type },
    ]
  }

  const fits = (count: number) =>
    checkFit({
      type: 'text_line',
      words: [{ content: characters.slice(0, count).join(''), type: word.type }],
    })

  // 原实现逐字符递归，每次递归都重建数组并重新 join，整体是 O(n²)。
  // 这里改为「指数探测 + 区间二分」：窄容器下成本与行长同阶，
  // 宽容器下只需 O(log n) 次 checkFit。
  let fit = 0
  let probe = 1
  while (probe <= characters.length && fits(probe)) {
    fit = probe
    probe *= 2
  }

  // probe 可能已超出字符总数；此时只验证到 fit，必须再确认「剩余全部」是否放得下。
  const limit = Math.min(probe, characters.length)
  let best: number
  if (fits(limit)) {
    best = limit
  } else {
    best = fit
    let lo = fit + 1
    let hi = limit - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (fits(mid)) {
        best = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
  }

  // 第一个字符就放不下时也要切出一个，与原实现保持一致
  if (best === 0) best = 1

  return [
    { content: characters.slice(0, best).join(''), type: word.type },
    { content: characters.slice(best).join(''), type: word.type },
  ]
}

/**
 * Splits a line into multiple lines that satisfy the checkFit function.
 * @param line - Line to split
 * @param checkFit - Function to check if line fits
 * @returns Array of lines that fit
 */
export function splitLineToFitWidth(
  line: MarkdownTextLine,
  checkFit: CheckFitFunction,
): MarkdownTextLine[] {
  if (line.words.some(({ content }) => content.includes('\n'))) {
    throw new Error('splitLineToFitWidth does not support newlines in the line')
  }
  return splitLineToFitWidthRecursion(line, checkFit)
}

function splitLineToFitWidthRecursion(
  line: MarkdownTextLine,
  checkFit: CheckFitFunction,
  lines: MarkdownTextLine[] = [],
  newLine: MarkdownWord[] = [],
): MarkdownTextLine[] {
  const words = line.words
  // Return if there is nothing left to split
  if (words.length === 0) {
    // If there is a new line, add it to the lines
    if (newLine.length > 0) {
      lines.push({
        type: 'text_line',
        words: newLine,
      })
    }
    return lines.length > 0 ? lines : []
  }
  let joiner = ''
  if (words[0].content === ' ') {
    joiner = ' '
    words.shift()
  }
  const nextWord: MarkdownWord = words.shift() ?? { content: ' ', type: 'normal' }
  const lineWithNextWord: MarkdownTextLine = {
    type: 'text_line',
    words: [...newLine],
  }
  if (joiner !== '') {
    lineWithNextWord.words.push({ content: joiner, type: 'normal' })
  }
  lineWithNextWord.words.push(nextWord)

  if (checkFit(lineWithNextWord)) {
    // nextWord fits, so we can add it to the new line and continue
    return splitLineToFitWidthRecursion(line, checkFit, lines, lineWithNextWord.words)
  }

  // nextWord doesn't fit, so we need to split it
  if (newLine.length > 0) {
    // There was text in newLine, so add it to lines and push nextWord back into words.
    lines.push({
      type: 'text_line',
      words: [...newLine],
    })
    line.words.unshift(nextWord)
  } else if (nextWord.content) {
    // There was no text in newLine, so we need to split nextWord
    const [word, rest] = splitWordToFitWidth(checkFit, nextWord)
    lines.push({
      type: 'text_line',
      words: [word],
    })
    if (rest.content) {
      line.words.unshift(rest)
    }
  }
  return splitLineToFitWidthRecursion(line, checkFit, lines)
}
