import { select } from 'd3-selection'
import { compile, serialize, stringify } from 'stylis'
import { getStyles } from './styles'
import theme from './theme'
import { log } from './logger'

import type { D3Element, MindmapNode, RenderResult } from './types'

import * as renderer from './markmap-renderer'
import { decodeEntities, uint8ArrayToHex, uint8ArrayFromHex } from './utils'
import { setA11yDiagramInfo, addSVGa11yTitleDescription } from './accessibility'

const XMLNS_SVG_STD = 'http://www.w3.org/2000/svg'
const XMLNS_XLINK_STD = 'http://www.w3.org/1999/xlink'
const XMLNS_XHTML_STD = 'http://www.w3.org/1999/xhtml'

/**
 * Clean up svgCode. Do replacements needed
 *
 * @param svgCode - the code to clean up
 * @param inSandboxMode - security level
 * @param useArrowMarkerUrls - should arrow marker's use full urls? (vs. just the anchors)
 * @returns the cleaned up svgCode
 */
export const cleanUpSvgCode = (
  svgCode = '',
  inSandboxMode: boolean,
  useArrowMarkerUrls: boolean,
): string => {
  let cleanedUpSvg = svgCode

  // Replace marker-end urls with just the # anchor (remove the preceding part of the URL)
  if (!useArrowMarkerUrls && !inSandboxMode) {
    cleanedUpSvg = cleanedUpSvg.replace(
      /marker-end="url\([\d+./:=?A-Za-z-]*?#/g,
      'marker-end="url(#',
    )
  }

  cleanedUpSvg = decodeEntities(cleanedUpSvg)

  // replace old br tags with newer style
  cleanedUpSvg = cleanedUpSvg.replace(/<br>/g, '<br/>')

  return cleanedUpSvg
}

/**
 * Converts a string/boolean into a boolean
 *
 * @param val - String or boolean to convert
 * @returns The result from the input
 */
export const evaluate = (val?: string | boolean): boolean =>
  val === false || ['false', 'null', '0'].includes(String(val).trim().toLowerCase()) ? false : true

/**
 * Add accessibility (a11y) information to the diagram.
 *
 * @param diagramType - diagram type
 * @param svgNode - d3 node to insert the a11y title and desc info
 * @param a11yTitle - a11y title
 * @param a11yDescr - a11y description
 */
function addA11yInfo(
  diagramType: string,
  svgNode: D3Element,
  a11yTitle?: string,
  a11yDescr?: string,
): void {
  setA11yDiagramInfo(svgNode, diagramType)
  addSVGa11yTitleDescription(svgNode, a11yTitle, a11yDescr, svgNode.attr('id'))
}

/**
 * Append an enclosing div, then svg, then g (group) to the d3 parentRoot. Set attributes.
 * Only set the style attribute on the enclosing div if divStyle is given.
 * Only set the xmlns:xlink attribute on svg if svgXlink is given.
 * Return the last node appended
 *
 * @param parentRoot - the d3 node to append things to
 * @param id - the value to set the id attr to
 * @param enclosingDivId - the id to set the enclosing div to
 * @param divStyle - if given, the style to set the enclosing div to
 * @param svgXlink - if given, the link to set the new svg element to
 * @returns - returns the parentRoot that had nodes appended
 */
export const appendDivSvgG = (
  parentRoot: D3Element,
  id: string,
  enclosingDivId: string,
  divStyle?: string,
  svgXlink?: string,
  theme: string = 'light',
): D3Element => {
  const enclosingDiv = parentRoot.append('div')
  enclosingDiv.attr('id', enclosingDivId)
  if (divStyle) {
    enclosingDiv.attr('style', divStyle)
  }

  const svgNode = enclosingDiv
    .append('svg')
    .attr('id', id)
    .attr('width', '100%')
    .attr('xmlns', XMLNS_SVG_STD)
    .attr('data-theme', theme)
  if (svgXlink) {
    svgNode.attr('xmlns:xlink', svgXlink)
  }

  svgNode.append('g')
  return parentRoot
}

/**
 * Append an iFrame node to the given parentNode and set the id, style, and 'sandbox' attributes
 *  Return the appended iframe d3 node
 *
 * @param parentNode - the d3 node to append the iFrame node to
 * @param iFrameId - id to use for the iFrame
 * @returns the appended iframe d3 node
 */
function sandboxedIframe(parentNode: D3Element, iFrameId: string): D3Element {
  return parentNode
    .append('iframe')
    .attr('id', iFrameId)
    .attr('style', 'width: 100%; height: 100%;')
    .attr('sandbox', '')
}

/**
 * Remove any existing elements from the given document
 *
 * @param doc - the document to removed elements from
 * @param id - id for any existing SVG element
 * @param divSelector - selector for any existing enclosing div element
 * @param iFrameSelector - selector for any existing iFrame element
 */
export const removeExistingElements = (
  doc: Document,
  id: string,
  divId: string,
  iFrameId: string,
) => {
  // Remove existing SVG element if it exists
  doc.getElementById(id)?.remove()
  // Remove previous temporary element if it exists
  // Both div and iframe needs to be cleared in case there is a config change happening between renders.
  doc.getElementById(divId)?.remove()
  doc.getElementById(iFrameId)?.remove()
}

const createUserStyles = ({ svgId }: { svgId: string }) => {
  const allStyles = getStyles()
  return serialize(compile(`${svgId}{${allStyles}}`), stringify)
}

export const render = async function (
  id: string,
  node: MindmapNode,
  opts: any,
  svgContainingElement?: Element,
): Promise<{ svg: string }> {
  log.debug('dom-renderer.ts  render in, opts: ', opts)
  const idSelector = '#' + id
  const iFrameID = 'i' + id
  const iFrameID_selector = '#' + iFrameID
  const enclosingDivID = 'd' + id
  const enclosingDivID_selector = '#' + enclosingDivID

  const removeTempElements = () => {
    // -------------------------------------------------------------------------------
    // Remove the temporary HTML element if appropriate
    const tmpElementSelector = isSandboxed ? iFrameID_selector : enclosingDivID_selector
    const node = select(tmpElementSelector).node()
    if (node && 'remove' in node) {
      node.remove()
    }
  }

  let root: any = select('body')

  const isSandboxed = false //config.securityLevel === SECURITY_LVL_SANDBOX;
  const isLooseSecurityLevel = true //config.securityLevel === SECURITY_LVL_LOOSE;

  // const fontFamily = config.fontFamily;
  const fontFamily = 'arial,sans-serif'

  // -------------------------------------------------------------------------------
  // Define the root d3 node
  // In regular execution the svgContainingElement will be the element with a mermaid class

  if (svgContainingElement !== undefined) {
    if (svgContainingElement) {
      svgContainingElement.innerHTML = ''
    }

    if (isSandboxed) {
      // If we are in sandboxed mode, we do everything mermaid related in a (sandboxed )iFrame
      const iframe = sandboxedIframe(select(svgContainingElement), iFrameID)
      root = select(iframe.nodes()[0]!.contentDocument!.body)
      root.node().style.margin = 0
    } else {
      root = select(svgContainingElement)
    }
    appendDivSvgG(
      root,
      id,
      enclosingDivID,
      `font-family: ${fontFamily}`,
      XMLNS_XLINK_STD,
      opts.sitetheme,
    )
  } else {
    // No svgContainingElement was provided

    // If there is an existing element with the id, we remove it. This likely a previously rendered diagram
    removeExistingElements(window.document, id, enclosingDivID, iFrameID)

    // Add the temporary div used for rendering with the enclosingDivID.
    // This temporary div will contain a svg with the id == id

    if (isSandboxed) {
      // If we are in sandboxed mode, we do everything mermaid related in a (sandboxed) iFrame
      const iframe = sandboxedIframe(select('body'), iFrameID)
      root = select(iframe.nodes()[0]!.contentDocument!.body)
      root.node().style.margin = 0
    } else {
      root = select('body')
    }

    appendDivSvgG(root, id, enclosingDivID, '', XMLNS_XLINK_STD, opts.sitetheme)
  }

  // Get the temporary div element containing the svg
  const element = root.select(enclosingDivID_selector).node()

  // -------------------------------------------------------------------------------
  // Create and insert the styles (user styles, theme styles, config styles)

  // Insert an element into svg. This is where we put the styles
  const svg = element.firstChild
  const firstChild = svg.firstChild
  const rules = createUserStyles({ svgId: idSelector })
  log.debug('rulesrules: ', rules)
  // const diagramClassDefs = renderer.getClasses?.(node);
  //
  // // const rules = createUserStyles(config, diagramType, diagramClassDefs, idSelector);
  //
  const style1 = document.createElement('style')
  style1.innerHTML = rules
  svg.insertBefore(style1, firstChild)
  const sitetheme = opts.sitetheme ?? 'light' // site theme , light / dark

  const parsedOpts = {
    themeIds: uint8ArrayFromHex(opts.theme),
    borderIds: uint8ArrayFromHex(opts.border),
    shapeIds: uint8ArrayFromHex(opts.shape),
    linkshapeIds: uint8ArrayFromHex(opts.linkshape),
    sitetheme: sitetheme,
  }

  log.debug('markmap - dom-renderer.ts render parsedOpts: ', parsedOpts)

  theme.updateByThemeOpts(parsedOpts)
  // -------------------------------------------------------------------------------
  // Draw the diagram with the renderer
  await renderer.draw(node, id, parsedOpts)

  // This is the d3 node for the svg element
  const svgNode = root.select(`${enclosingDivID_selector} svg`)
  const a11yTitle: string | undefined = undefined //diag.db.getAccTitle?.();
  const a11yDescr: string | undefined = undefined //diag.db.getAccDescription?.();
  addA11yInfo('markmap', svgNode, a11yTitle, a11yDescr)
  // -------------------------------------------------------------------------------
  // Clean up SVG code
  root.select(`[id="${id}"]`).selectAll('foreignobject > *').attr('xmlns', XMLNS_XHTML_STD)

  // Fix for when the base tag is used
  let svgCode: string = root.select(enclosingDivID_selector).node().innerHTML

  // console.debug('config.arrowMarkerAbsolute', config.arrowMarkerAbsolute);
  svgCode = cleanUpSvgCode(svgCode, isSandboxed, false)

  log.debug('dom-renderer.ts  svgCode: ', svgCode)
  // if (isSandboxed) {
  //   const svgEl = root.select(enclosingDivID_selector + ' svg').node();
  //   svgCode = putIntoIFrame(svgCode, svgEl);
  // } else if (!isLooseSecurityLevel) {
  //   // Sanitize the svgCode using DOMPurify
  //   svgCode = DOMPurify.sanitize(svgCode, {
  //     ADD_TAGS: DOMPURIFY_TAGS,
  //     ADD_ATTR: DOMPURIFY_ATTR,
  //   });
  // }

  removeTempElements()

  return {
    svg: svgCode,
  }
}

export const renderMock = async function (
  id: string,
  node: MindmapNode,
  svgContainingElement?: Element,
): Promise<{ svg: string }> {
  return {
    svg: '',
  }
}

export default {
  render,
  renderMock,
}
