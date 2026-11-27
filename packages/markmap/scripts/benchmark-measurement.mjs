import { build } from 'esbuild'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { chromium } from 'playwright-core'

const DEFAULT_SAMPLES = [
  'short label',
  'this is a medium sized label with several english words',
  '这是一个包含中文和 English words 的混合节点标题',
  'very long label very long label very long label very long label very long label',
  'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda',
  'one-super-long-token-that-should-remain-unbroken-for-compatibility',
]

const DEFAULT_CHROME_CANDIDATES = [
  process.env.BENCHMARK_CHROME_PATH,
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean)

const rawArgs = process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--'))

const { values } = parseArgs({
  args: rawArgs,
  allowPositionals: false,
  options: {
    fontSize: {
      type: 'string',
      default: '16',
    },
    fontFamily: {
      type: 'string',
      default: '"trebuchet ms", verdana, arial, sans-serif',
    },
    json: {
      type: 'boolean',
      default: false,
    },
    loops: {
      type: 'string',
      default: '300',
    },
    warmup: {
      type: 'string',
      default: '50',
    },
    width: {
      type: 'string',
      default: '220',
    },
  },
})

const config = {
  fontFamily: values.fontFamily,
  fontSize: Number.parseInt(values.fontSize, 10),
  json: values.json,
  loops: Number.parseInt(values.loops, 10),
  warmup: Number.parseInt(values.warmup, 10),
  width: Number.parseInt(values.width, 10),
}

if (
  [config.fontSize, config.loops, config.warmup, config.width].some(
    (value) => !Number.isFinite(value) || value <= 0,
  )
) {
  throw new Error('fontSize / loops / warmup / width 必须是正整数')
}

function resolveChromeExecutable() {
  for (const candidate of DEFAULT_CHROME_CANDIDATES) {
    if (candidate && existsSync(candidate)) return candidate
  }
  return undefined
}

async function bundleMeasurementHelper(tmpDir) {
  const entryFile = path.join(tmpDir, 'entry.ts')
  const outputFile = path.join(tmpDir, 'bundle.js')
  await fs.writeFile(
    entryFile,
    [
      `import { measureTextLineWithPretext } from ${JSON.stringify(path.resolve('src/text.ts'))};`,
      'globalThis.__markmapMeasureTextLineWithPretext = measureTextLineWithPretext;',
    ].join('\n'),
  )
  await build({
    entryPoints: [entryFile],
    outfile: outputFile,
    bundle: true,
    format: 'iife',
    logLevel: 'silent',
    platform: 'browser',
    target: 'chrome120',
  })
  return fs.readFile(outputFile, 'utf8')
}

function formatMs(value) {
  return `${value.toFixed(2)}ms`
}

function formatOpsPerSecond(totalCases, elapsedMs) {
  return (totalCases / (elapsedMs / 1000)).toFixed(1)
}

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'markmap-benchmark-'))

try {
  const helperScript = await bundleMeasurementHelper(tmpDir)
  const executablePath = resolveChromeExecutable()
  const browser = await chromium.launch({
    executablePath,
    headless: true,
  })

  try {
    const page = await browser.newPage()
    await page.setContent('<svg id="benchmark-root" xmlns="http://www.w3.org/2000/svg"></svg>')
    await page.addScriptTag({ content: helperScript })

    const result = await page.evaluate((pageConfig) => {
      const samples = [
        'short label',
        'this is a medium sized label with several english words',
        '这是一个包含中文和 English words 的混合节点标题',
        'very long label very long label very long label very long label very long label',
        'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda',
        'one-super-long-token-that-should-remain-unbroken-for-compatibility',
      ]
      const root = document.getElementById('benchmark-root')
      if (!root) throw new Error('benchmark svg root not found')

      function toLine(text) {
        return {
          type: 'text_line',
          words: text.split(/\s+/).map((word) => ({ content: word, type: 'normal' })),
        }
      }

      function applyWordStyles(tspan, words) {
        tspan.textContent = ''
        words.forEach((word, index) => {
          const inner = document.createElementNS('http://www.w3.org/2000/svg', 'tspan')
          if (word.type === 'emphasis') inner.setAttribute('font-style', 'italic')
          if (word.type === 'strong') inner.setAttribute('font-weight', 'bold')
          if (word.type === 'delete') inner.setAttribute('text-decoration', 'line-through')
          inner.textContent = index === 0 ? word.content : ` ${word.content}`
          tspan.appendChild(inner)
        })
      }

      function computeWidthOfText(parentNode, line) {
        const testElement = document.createElementNS('http://www.w3.org/2000/svg', 'text')
        testElement.setAttribute('font-size', `${pageConfig.fontSize}px`)
        parentNode.appendChild(testElement)
        const testSpan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan')
        testElement.appendChild(testSpan)
        applyWordStyles(testSpan, line.words)
        const textLength = testSpan.getComputedTextLength()
        testElement.remove()
        return textLength
      }

      function splitTextToChars(text) {
        if (typeof Intl.Segmenter !== 'undefined') {
          return [...new Intl.Segmenter().segment(text)].map((segment) => segment.segment)
        }
        return [...text]
      }

      function splitWordToFitWidth(checkFit, word) {
        const characters = splitTextToChars(word.content)
        const usedChars = []
        const remainingChars = [...characters]
        while (remainingChars.length) {
          const nextChar = remainingChars[0]
          const candidate = [...usedChars, nextChar].join('')
          if (checkFit({ type: 'text_line', words: [{ content: candidate, type: word.type }] })) {
            usedChars.push(nextChar)
            remainingChars.shift()
            continue
          }
          break
        }
        if (usedChars.length === 0 && remainingChars.length) {
          usedChars.push(remainingChars.shift())
        }
        return [
          { content: usedChars.join(''), type: word.type },
          { content: remainingChars.join(''), type: word.type },
        ]
      }

      function splitLineToFitWidth(line, checkFit, lines = [], newLine = []) {
        const words = line.words
        if (words.length === 0) {
          if (newLine.length > 0) lines.push({ type: 'text_line', words: newLine })
          return lines
        }

        let joiner = ''
        if (words[0]?.content === ' ') {
          joiner = ' '
          words.shift()
        }

        const nextWord = words.shift() ?? { content: ' ', type: 'normal' }
        const lineWithNextWord = { type: 'text_line', words: [...newLine] }
        if (joiner) lineWithNextWord.words.push({ content: joiner, type: 'normal' })
        lineWithNextWord.words.push(nextWord)

        if (checkFit(lineWithNextWord)) {
          return splitLineToFitWidth(line, checkFit, lines, lineWithNextWord.words)
        }

        if (newLine.length > 0) {
          lines.push({ type: 'text_line', words: [...newLine] })
          line.words.unshift(nextWord)
        } else if (nextWord.content) {
          const [word, rest] = splitWordToFitWidth(checkFit, nextWord)
          lines.push({ type: 'text_line', words: [word] })
          if (rest.content) line.words.unshift(rest)
        }

        return splitLineToFitWidth(line, checkFit, lines)
      }

      function oldMeasure(line) {
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g')
        root.appendChild(group)
        const textElement = document.createElementNS('http://www.w3.org/2000/svg', 'text')
        textElement.setAttribute('y', '-10')
        textElement.setAttribute('font-size', `${pageConfig.fontSize}px`)
        group.appendChild(textElement)

        const checkWidth = (candidate) => computeWidthOfText(group, candidate) <= pageConfig.width
        const lines = checkWidth(line)
          ? [line]
          : splitLineToFitWidth({ type: 'text_line', words: [...line.words] }, checkWidth)

        lines.forEach((preparedLine) => {
          const outer = document.createElementNS('http://www.w3.org/2000/svg', 'tspan')
          textElement.appendChild(outer)
          applyWordStyles(outer, preparedLine.words)
        })

        const bbox = group.getBBox()
        group.remove()
        return bbox
      }

      function newMeasure(line) {
        return globalThis.__markmapMeasureTextLineWithPretext(
          line,
          pageConfig.width,
          pageConfig.fontSize,
          pageConfig.fontFamily,
        )
      }

      for (let i = 0; i < pageConfig.warmup; i += 1) {
        for (const sample of samples) {
          const line = toLine(sample)
          oldMeasure(line)
          newMeasure(line)
        }
      }

      function bench(fn, loops) {
        const start = performance.now()
        for (let i = 0; i < loops; i += 1) {
          for (const sample of samples) fn(toLine(sample))
        }
        return performance.now() - start
      }

      const oldMs = bench(oldMeasure, pageConfig.loops)
      const newMs = bench(newMeasure, pageConfig.loops)
      return {
        fontFamily: pageConfig.fontFamily,
        fontSize: pageConfig.fontSize,
        loops: pageConfig.loops,
        newMs,
        oldMs,
        samples,
        totalCases: pageConfig.loops * samples.length,
        warmup: pageConfig.warmup,
        width: pageConfig.width,
      }
    }, config)

    const summary = {
      ...result,
      savedPct: (1 - result.newMs / result.oldMs) * 100,
      speedup: result.oldMs / result.newMs,
    }

    if (config.json) {
      console.log(JSON.stringify(summary, null, 2))
    } else {
      console.log('markmap measurement benchmark')
      console.log(`chrome: ${executablePath ?? 'playwright managed chromium'}`)
      console.log(
        `cases: ${summary.totalCases} (${summary.samples.length} samples × ${summary.loops} loops, warmup ${summary.warmup})`,
      )
      console.log(`font: ${summary.fontSize}px ${summary.fontFamily}`)
      console.log(`width: ${summary.width}px`)
      console.table([
        {
          casesPerSecond: formatOpsPerSecond(summary.totalCases, summary.oldMs),
          mode: 'old DOM measurement',
          total: formatMs(summary.oldMs),
        },
        {
          casesPerSecond: formatOpsPerSecond(summary.totalCases, summary.newMs),
          mode: 'new pretext measurement',
          total: formatMs(summary.newMs),
        },
      ])
      console.log(`speedup: ${summary.speedup.toFixed(2)}x`)
      console.log(`saved: ${summary.savedPct.toFixed(2)}%`)
      console.log(
        'note: 该 benchmark 只测纯文本节点的测量路径，不包含 raw_html/image/完整整图布局。',
      )
    }
  } finally {
    await browser.close()
  }
} finally {
  await fs.rm(tmpDir, { force: true, recursive: true })
}
