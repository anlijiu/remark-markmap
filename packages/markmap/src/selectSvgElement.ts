import { select } from 'd3-selection'
import type { HTML, SVG } from './types'

/**
 * Selects the SVG element using {@link id}.
 *
 * @param id - The diagram ID.
 * @returns The selected {@link SVG} element using {@link id}.
 */
export const selectSvgElement = (id: string): SVG => {
  // handle root and document for when rendering in sandbox mode
  const root: any = select('body')
  const svg: SVG = root.select(`#${id}`)
  return svg
}
