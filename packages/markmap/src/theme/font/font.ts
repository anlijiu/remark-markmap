type Params = {
  level: number //节点深度
  section: number //节点属于哪个组(root节点's children index)
  idx: number //节点属于父节点's children index
}

export interface FontManager {
  fontSize: (level: number) => number
  fontFamily: (type: number) => string
}

class FontManagerImpl implements FontManager {
  private _fontSizeList = [38, 28, 22, 20, 18, 16]

  fontSize(level: number) {
    const fontSize = this._fontSizeList[level] ?? 16
    return fontSize
  }

  fontFamily(_nodeType: number): string {
    return ''
  }
}

const fontManager = new FontManagerImpl()

export default fontManager
