import { buildTree } from '@anlijiu/markmap'
import markmap from '@anlijiu/markmap'

import { remarkMarkmap } from '@anlijiu/remark-markmap'
// import {buildTree} from '@anlijiu/markmap'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import rehypeStringify from 'rehype-stringify'
import Mustache from 'mustache'
import fs from 'fs'

async function test() {
  const parser = new unified()
    .use(remarkParse)
    .use(remarkMarkmap)
    .use(remarkRehype, { handlers: { markmap: markmap.markmapHandler } })
    .use(rehypeStringify)
  // .processSync(fs.readFileSync(`${process.cwd()}/content/math.mdx`))

  // let vfile = await parser.process(fs.readFileSync(`${process.cwd()}/test/2.md`))
  let vfile = await parser.process(fs.readFileSync(`${process.cwd()}/test/5.md`))

  let template = fs.readFileSync(`${process.cwd()}/index.mustache`, 'utf-8')
  let htmlcontent = vfile.value

  const view = {
    htmlcontent: htmlcontent,
  }
  let htmlStr = Mustache.render(template, view)
  fs.writeFileSync('/tmp/c.html', htmlStr)
  console.log('c /tmp/c.html')
  // console.log('xxxxxxxxxx result: ', result)
}

test()
