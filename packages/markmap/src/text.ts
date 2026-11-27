import type { D3Element } from './types'
import { measureNaturalWidth, prepareWithSegments } from '@chenglou/pretext'
import {
  layoutNextRichInlineLineRange,
  materializeRichInlineLineRange,
  prepareRichInline,
} from '@chenglou/pretext/rich-inline'
import type {
  RichInlineCursor,
  RichInlineItem,
  RichInlineLine,
} from '@chenglou/pretext/rich-inline'
import { toHtml } from 'hast-util-to-html'
import { toText } from 'hast-util-to-text'
import { walkTree } from './tree.js'
import type {
  Block,
  MarkdownImage,
  MarkdownRawHtml,
  MarkdownTextLine,
  MarkdownWord,
  MarkdownWordType,
  MindmapNode,
} from './types.js'
import { log } from './logger'

const DEFAULT_FONT_FAMILY = '"trebuchet ms", verdana, arial, sans-serif'
const DEFAULT_LINE_HEIGHT_EM = 1.1

type LabelMeasurement = {
  height: number
  usedPretext: boolean
  width: number
}

type CreatedText = {
  measurement: LabelMeasurement
  node: SVGElement
}

/** `addHtmlSpan` 的输入：来自 `raw_html` 块或内联 HTML 节点。 */
type HtmlSpanInput = {
  isNode?: boolean
  display?: string
  label: string
}

type PretextLineFragment = {
  gapBefore: number
  text: string
  word: MarkdownWord
}

type PretextWrappedLine = {
  fragments: PretextLineFragment[]
  width: number
}

type PretextMeasuredText = {
  height: number
  lines: PretextWrappedLine[]
  width: number
}

function getWordFontStyle(wordType: MarkdownWordType) {
  return {
    fontStyle: wordType === 'emphasis' ? 'italic' : 'normal',
    fontWeight: wordType === 'strong' ? 'bold' : 'normal',
  }
}

function createCanvasFont(word: MarkdownWord, fontSize: number, fontFamily: string): string {
  const { fontStyle, fontWeight } = getWordFontStyle(word.type)
  return [fontStyle, fontWeight, `${fontSize}px`, fontFamily].join(' ')
}

function splitTextToGraphemes(text: string): string[] {
  if (Intl.Segmenter) {
    return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map(
      (segment) => segment.segment,
    )
  }
  return [...text]
}

function measureWordWidth(
  word: MarkdownWord,
  fontSize: number,
  fontFamily: string,
  content = word.content,
) {
  return measureNaturalWidth(
    prepareWithSegments(content, createCanvasFont(word, fontSize, fontFamily)),
  )
}

function splitOversizedWordWithPretext(
  word: MarkdownWord,
  width: number,
  fontSize: number,
  fontFamily: string,
): PretextWrappedLine[] {
  const graphemes = splitTextToGraphemes(word.content)
  if (graphemes.length === 0) return []

  const measure = (text: string) => measureWordWidth(word, fontSize, fontFamily, text)
  const makeLine = (text: string): PretextWrappedLine => ({
    fragments: [
      {
        gapBefore: 0,
        text,
        word,
      },
    ],
    width: measure(text),
  })

  const lines: PretextWrappedLine[] = []
  let start = 0

  // 宽度随字符数单调递增，因此每一行可以用二分查找定位断点。
  // 原实现逐字符累加并重复测量整个前缀，在「宽容器 + 超长词」时是 O(n²)；
  // 二分把每行的测量次数从 O(行长) 降到 O(log 剩余长度)。
  while (start < graphemes.length) {
    const remaining = graphemes.length - start

    // 指数探测（galloping）：步长从 1 开始翻倍，先确定“能放下”的量级。
    // 直接对整体二分会让每次探测都测量超长字符串 —— 在窄容器（行长很短）时
    // 反而比逐字符累加慢一个数量级；galloping 让窄容器成本保持与行长同阶，
    // 同时在宽容器（一行能放下全部剩余）时依然只需 O(log n) 次测量。
    let fit = 0
    let probe = 1
    while (probe <= remaining && measure(graphemes.slice(start, start + probe).join('')) <= width) {
      fit = probe
      probe *= 2
    }

    // probe 可能已超出剩余长度；此时只验证到 fit，必须再确认「剩余全部」是否放得下，
    // 不能直接假定（否则会切出比实际可容纳更多的字符）。
    const limit = Math.min(probe, remaining)
    let best: number
    if (measure(graphemes.slice(start, start + limit).join('')) <= width) {
      best = limit
    } else {
      // 在 (fit, limit) 区间内二分收敛到精确断点
      best = fit
      let lo = fit + 1
      let hi = limit - 1
      while (lo <= hi) {
        const mid = (lo + hi) >> 1
        if (measure(graphemes.slice(start, start + mid).join('')) <= width) {
          best = mid
          lo = mid + 1
        } else {
          hi = mid - 1
        }
      }
    }

    // 单个 grapheme 就超宽时也至少切一个，避免死循环
    if (best === 0) best = 1

    lines.push(makeLine(graphemes.slice(start, start + best).join('')))
    start += best
  }

  return lines
}

function createRichInlineItems(
  line: MarkdownTextLine,
  fontSize: number,
  fontFamily: string,
): RichInlineItem[] {
  return line.words.map((word, index) => ({
    break: 'never',
    font: createCanvasFont(word, fontSize, fontFamily),
    text: index === 0 ? word.content : ` ${word.content}`,
  }))
}

function layoutTextLineWithPretext(
  line: MarkdownTextLine,
  width: number,
  fontSize: number,
  fontFamily: string,
): PretextWrappedLine[] {
  const items = createRichInlineItems(line, fontSize, fontFamily)
  if (items.length === 0) return []

  const prepared = prepareRichInline(items)
  const wrappedLines: PretextWrappedLine[] = []
  let cursor: RichInlineCursor | undefined

  while (true) {
    const lineRange = layoutNextRichInlineLineRange(prepared, width, cursor)
    if (!lineRange) break

    const materializedLine: RichInlineLine = materializeRichInlineLineRange(prepared, lineRange)
    const nextLine: PretextWrappedLine = {
      fragments: materializedLine.fragments.map((fragment) => ({
        gapBefore: fragment.gapBefore,
        text: fragment.text,
        word: line.words[fragment.itemIndex],
      })),
      width: materializedLine.width,
    }
    if (nextLine.width > width && nextLine.fragments.length === 1) {
      wrappedLines.push(
        ...splitOversizedWordWithPretext(nextLine.fragments[0].word, width, fontSize, fontFamily),
      )
    } else {
      wrappedLines.push(nextLine)
    }
    cursor = lineRange.end
  }

  return wrappedLines
}

export function measureTextLineWithPretext(
  line: MarkdownTextLine,
  width: number,
  fontSize: number,
  fontFamily = DEFAULT_FONT_FAMILY,
): PretextMeasuredText {
  const lines = layoutTextLineWithPretext(line, width, fontSize, fontFamily)
  const measuredWidth = lines.reduce((currentWidth, wrappedLine) => {
    return Math.max(currentWidth, wrappedLine.width)
  }, 0)

  return {
    height: Math.max(
      DEFAULT_LINE_HEIGHT_EM * fontSize,
      lines.length * DEFAULT_LINE_HEIGHT_EM * fontSize,
    ),
    lines,
    width: measuredWidth,
  }
}

/**
 * Creates a tspan element with the specified attributes for text positioning.
 *
 * @param textElement - The parent text element to append the tspan element.
 * @param lineIndex - The index of the current line in the structuredText array.
 * @param lineHeight - The line height value for the text.
 * @returns The created tspan element.
 */
function createTspan(textElement: D3Element, lineIndex: number, lineHeight: number) {
  return textElement
    .append('tspan')
    .attr('class', 'text-outer-tspan')
    .attr('x', 0)
    .attr('y', lineIndex * lineHeight - 0.1 + 'em')
    .attr('dy', lineHeight + 'em')
}

/**
 * Updates the text content and styles of the given tspan element based on the
 * provided wrappedLine data.
 *
 * @param tspan - The tspan element to update.
 * @param wrappedLine - The line data to apply to the tspan element.
 */
function updateTextContentAndStyles(tspan: D3Element, wrappedLine: MarkdownWord[]) {
  tspan.text('')

  wrappedLine.forEach((word, index) => {
    const innerTspan = tspan
      .append('tspan')
      .attr('font-style', word.type === 'emphasis' ? 'italic' : 'normal')
      .attr('class', 'text-inner-tspan')
      .attr('font-weight', word.type === 'strong' ? 'bold' : 'normal')
    // .attr('font-family', '"trebuchet ms", verdana, arial, sans-serif');
    if (word.type === 'delete') innerTspan.attr('text-decoration', 'line-through')
    if (index === 0) {
      innerTspan.text(word.content)
    } else {
      // TODO: check what joiner to use.
      innerTspan.text(' ' + word.content)
    }
  })
}

function updateTextContentAndStylesFromFragments(
  tspan: D3Element,
  wrappedLine: PretextLineFragment[],
) {
  tspan.text('')

  wrappedLine.forEach((fragment) => {
    const { fontStyle, fontWeight } = getWordFontStyle(fragment.word.type)
    const innerTspan = tspan
      .append('tspan')
      .attr('font-style', fontStyle)
      .attr('class', 'text-inner-tspan')
      .attr('font-weight', fontWeight)
    if (fragment.word.type === 'delete') innerTspan.attr('text-decoration', 'line-through')
    if (fragment.gapBefore > 0) innerTspan.attr('dx', fragment.gapBefore)
    innerTspan.text(fragment.text)
  })
}

/**
 * Convert fontawesome labels into fontawesome icons by using a regex pattern
 * @param text - The raw string to convert
 * @returns string with fontawesome icons as i tags
 */
export function replaceIconSubstring(text: string) {
  // The letters 'bklrs' stand for possible endings of the fontawesome prefix (e.g. 'fab' for brands, 'fak' for fa-kit) // cspell: disable-line
  return text.replace(
    /fa[bklrs]?:fa-[\w-]+/g, // cspell: disable-line
    (s) => `<i class='${s.replace(':', ' ')}'></i>`,
  )
}

function addImageObject(element: D3Element, node: MarkdownImage, width: number, y: number) {
  const img = element.append('image')
  img.attr('href', node.src)
  img.attr('width', node.width)
  img.attr('height', node.height)
  img.attr('y', y)
  img.style('width', node.width)
  img.style('height', node.height)
  img.style('y', y)
  if (node.title && node.title.length > 0) {
    const title = img.append('title')
    title.text(node.title)
  }
  if (node.alt && node.alt.length > 0) {
    const desc = img.append('desc')
    desc.text(node.alt)
  }
  return {
    h: node.height,
    node: img.node(),
    w: node.width,
  }
}

function addHtmlSpan(
  element: D3Element,
  node: HtmlSpanInput,
  width: number,
  classes: string,
  y: number,
  addBackground = false,
) {
  const fo = element.append('foreignObject')
  const isInline = node.display === 'inline'
  const container = isInline ? fo.append('xhtml:span') : fo.append('xhtml:div')

  const label = node.label
  const labelClass = node.isNode ? 'nodeLabel' : 'edgeLabel'
  container.html(label)
  // div.html(
  //   `<span class="${labelClass} ${classes}" ` +
  //     (node.labelStyle ? 'style="' + node.labelStyle + '"' : '') +
  //     '>' +
  //     label +
  //     '</span>'
  // );

  // applyStyle(div, node.labelStyle);
  // container.style('position', 'absolute');
  container.style('display', 'table-cell')
  container.style('box-sizing', 'border-box')
  if (isInline) {
    container.style('white-space', 'pre')
  } else {
    container.style('white-space', 'break-spaces')
  }
  // div.style('max-width', width + 'px');
  container.attr('xmlns', 'http://www.w3.org/1999/xhtml')
  if (addBackground) {
    container.attr('class', 'labelBkg')
  }

  const bbox = container.node().getBoundingClientRect()

  fo.attr('width', bbox.width)
  fo.attr('height', bbox.height)
  fo.attr('y', y)
  fo.style('width', bbox.width)
  fo.style('height', bbox.height)
  fo.style('y', y)

  return {
    w: bbox.width,
    h: bbox.height,
    node: fo.node(),
  }
}

const getWordTypeByKey = (key: string): MarkdownWordType | undefined => {
  if (key === 'text' || key === 'p') {
    return 'normal'
  } else if (key === 'em') {
    return 'emphasis'
  } else if (key === 'strong') {
    return 'strong'
  } else if (key === 'del') {
    return 'delete'
  }
}

const parseImgTitle = (str: string) => {
  let width = 200
  let height = 150
  let title = ''

  const arr = str.split('=')
  title = arr[0].trim()
  if (arr.length == 2) {
    const wh = arr[1].split('x')
    if (wh.length == 2) {
      const w = parseInt(wh[0])
      const h = parseInt(wh[1])
      if (!isNaN(w)) width = w
      if (!isNaN(h)) height = h
    }
  }
  return {
    width,
    height,
    title,
  }
}

const processImageNode = (item: any, current: any, lines: Block[]) => {
  log.debug('processImageNode ', item)
  current.type = 'image'
  current.src = item.properties.src
  current.alt = item.properties.alt
  const r = parseImgTitle(item.properties.title)
  current.title = r.title
  current.width = r.width
  current.height = r.height
}

const processTextHeading = (item: any, current: any, lines: Block[]) => {
  item.children.forEach((e: any) => {
    const word = {
      content: toText(e),
      type: getWordTypeByKey(e.tagName || e.type),
    }
    current.words.push(word)
  })
}

const processTextNode = (item: any, current: any, lines: Block[]) => {
  const word = {
    content: toText(item),
    type: getWordTypeByKey(item.tagName || item.type),
  }
  current.words.push(word)
}

const processHtmlNode = (item: any, current: any, lines: Block[]) => {
  log.debug('processHtmlNode  in ', item)
  const lang = item.properties?.dataLanguage
  if (lang) {
    item.properties.className = [`language-${lang}`, ...item.properties.className]
  }
  if (item.tagName === 'img') {
    log.debug('processHtmlNode img: ', () => JSON.stringify(item, undefined, 2))
    processImageNode(item, current, lines)
  } else {
    if (item.tagName === 'pre') {
      const style =
        'padding-top: .8571429em;padding-inline-end: 1.1428571em;padding-bottom: .8571429em;padding-inline-start: 1.1428571em;'
      item.properties.style = style
    }
    log.debug('processHtmlNode item: ', () => JSON.stringify(item, undefined, 2))
    current.raw = toHtml(item)
  }
}

type FuncHastToLines = (contents: Element[]) => Block[]

const processNodeFuncMap = {
  h1: processTextHeading,
  h2: processTextHeading,
  h3: processTextHeading,
  h4: processTextHeading,
  h5: processTextHeading,
  h6: processTextHeading,
  em: processTextNode,
  text: processTextNode,
  del: processTextNode,
  strong: processTextNode,
  p: processTextNode,
}
const textNodeKeys = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'text', 'em', 'del', 'strong', 'p']
const htmlNodeKeys = ['img', 'pre', 'code', 'mjx-container', 'a', 'figure']
const isTextNode = (tagName?: string) => tagName && textNodeKeys.includes(tagName)
const isHtmlNode = (tagName?: string) => tagName && htmlNodeKeys.includes(tagName)
// 每个node 的根节点
const nodeTagNames = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li']
const hastToLines: FuncHastToLines = (contents) => {
  const lines: Block[] = []
  let current: Block = {
    raw: '',
    display: 'block',
    type: 'raw_html',
  }

  const callback = (item: any, stack: any) => {
    const key = item.tagName || item.type
    log.debug('callbackcallbackcallbackcallbackcallback item: ', item, ', key: ', key)
    if (isTextNode(key)) {
      if (current.type === 'raw_html') {
        current = {
          words: [],
          type: 'text_line',
        }
        lines.push(current)
      }
      const processFunc = processNodeFuncMap[key as keyof typeof processNodeFuncMap]
      processFunc(item, current, lines)
    } else if (isHtmlNode(key)) {
      current = {
        raw: '',
        display: 'block',
        type: 'raw_html',
      }
      if (
        item.tagName === 'a' ||
        (item.tagName === 'code' && item.properties?.display === 'inline')
      ) {
        current.display = 'inline'
      }
      lines.push(current)
      processHtmlNode(item, current, lines)
    }
  }
  contents.forEach((content) => {
    walkTree(content, callback, 'children')
  })

  // walkTree(contents, callback, 'children', lines);
  return lines
}

/**
 * Creates a formatted text element by breaking lines and applying styles based on
 * the given structuredText.
 *
 * @param width - The maximum allowed width of the text.
 * @param g - The parent group element to append the formatted text.
 * @param structuredText - The structured text data to format.
 * @param addBackground - Whether to add a background to the text.
 */
function createFormattedText(
  width: number,
  g: any,
  structuredBlocks: Block[],
  addBackground = false,
  txtColor = 'currentColor',
  fontSize = 16,
  fontFamily = DEFAULT_FONT_FAMILY,
): CreatedText {
  const labelGroup = g.append('g')
  const lineHeight = DEFAULT_LINE_HEIGHT_EM
  const bkg = labelGroup.insert('rect').attr('class', 'background')
  let y = 0
  let maxWidth = 0
  let usedPretext = true
  for (const line of structuredBlocks) {
    if (line.type === 'image') {
      const result = addImageObject(labelGroup, line, width, y)
      addBackground = true
      maxWidth = Math.max(maxWidth, result.w)
      y += result.h
    } else if (line.type === 'raw_html') {
      // const decodedReplacedText = replaceIconSubstring(decodeEntities(line.raw));
      const decodedReplacedText = line.raw
      const htmlnode = {
        isNode: true,
        display: line.display ?? 'block',
        label: decodedReplacedText,
      }
      const result = addHtmlSpan(labelGroup, htmlnode, width, '', y, false)
      log.debug('addHtmlSpan result w: ', result.w, ', h:', result.h)
      const { w, h } = result
      maxWidth = Math.max(maxWidth, w)
      y += h
    } else {
      const textElement = labelGroup.append('text').attr('y', y).attr('fill', txtColor)
      try {
        const measuredText = measureTextLineWithPretext(line, width, fontSize, fontFamily)
        for (const [lineIndex, preparedLine] of measuredText.lines.entries()) {
          const tspan = createTspan(textElement, lineIndex, lineHeight)
          updateTextContentAndStylesFromFragments(tspan, preparedLine.fragments)
          maxWidth = Math.max(maxWidth, preparedLine.width)
        }
        y += measuredText.height
      } catch (error) {
        log.warn('pretext layout failed, falling back to DOM text rendering', error)
        usedPretext = false
        const tspan = createTspan(textElement, 0, lineHeight)
        updateTextContentAndStyles(tspan, line.words)
        const bbox = textElement.node().getBBox()
        maxWidth = Math.max(maxWidth, bbox.width)
        y += bbox.height
      }
    }
  }
  if (addBackground) {
    const padding = 2
    bkg
      .attr('x', -padding)
      .attr('y', -padding)
      .attr('width', maxWidth + 2 * padding)
      .attr('height', y + 2 * padding)
  }
  return {
    measurement: {
      height: y,
      usedPretext,
      width: maxWidth,
    },
    node: labelGroup.node(),
  }
}

export const createText = (
  el: D3Element,
  text = '',
  contents: Element[] = [],
  {
    txtColor = 'currentColor',
    style = '',
    isTitle = false,
    classes = '',
    useHtmlLabels = true,
    isNode = true,
    width = 300,
    addSvgBackground = false,
    fontFamily = DEFAULT_FONT_FAMILY,
    fontSize = 16,
  } = {},
): CreatedText | undefined => {
  log.info(
    'createText',
    text,
    () => JSON.stringify(contents, undefined, 2),
    style,
    isTitle,
    classes,
    useHtmlLabels,
    isNode,
    addSvgBackground,
  )

  if (!Array.isArray(contents) || contents.length === 0) return

  const structuredBlocks = hastToLines(contents)
  const svgLabel = createFormattedText(
    width,
    el,
    structuredBlocks,
    addSvgBackground,
    txtColor,
    fontSize,
    fontFamily,
  )

  log.info('structuredBlocks ', () => JSON.stringify(structuredBlocks, undefined, 2))
  return svgLabel
}
