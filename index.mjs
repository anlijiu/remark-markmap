import { buildTree } from '@anlijiu/markmap'
import markmap from '@anlijiu/markmap'
import { stringifyEntities } from 'stringify-entities'

import { rehypeShiki } from '@astrojs/markdown-remark'

import { remarkMarkmap } from '@anlijiu/remark-markmap'
// import {buildTree} from '@anlijiu/markmap'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import remarkGfm from 'remark-gfm'
import { unified } from 'unified'
import rehypeStringify from 'rehype-stringify'
import Mustache from 'mustache'
import fs from 'fs'

var dir = './.cache/svg'

if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true })
}

const STRINGIFY_ENTITIES_DEFAULT_DANGEROUS_CHARACTERS = ['"', '&', "'", '<', '>', '`']

const STRINGIFY_ENTITIES_DEFAULT_SVELTE_DANGEROUS_CHARACTERS = ['{', '}']

const shikiConfig = {
  langs: ['javascript'],
  theme: 'github-dark',
  themes: {},
  wrap: false,
  transformers: [],
}
async function test() {
  const parser = new unified()
    .use(remarkParse)
    .use(remarkMarkmap)
    .use(remarkRehype, { handlers: { markmap: markmap.markmapHandler } })
    .use(rehypeShiki, shikiConfig)
    .use(() => (tree) => {
      console.log('-- rehype tree:', JSON.stringify(tree, undefined, 2))
    })
    .use(rehypeStringify, { allowDangerousHtml: true, allowDangerousCharacters: true })
  // .processSync(fs.readFileSync(`${process.cwd()}/content/math.mdx`))

  let vfile = await parser.process(fs.readFileSync(`${process.cwd()}/test/1.md`))
  // let vfile = await parser.process(fs.readFileSync(`${process.cwd()}/test/2.md`))
  // let vfile = await parser.process(fs.readFileSync(`${process.cwd()}/test/3.md`))

  let template = fs.readFileSync(`${process.cwd()}/index.mustache`, 'utf-8')
  let htmlcontent = vfile.value

  const view = {
    htmlcontent: htmlcontent,
  }
  let htmlStr = Mustache.render(template, view)
  fs.writeFileSync('/tmp/c.html', htmlStr)
  console.log('c /tmp/c.html')
  // console.log(htmlStr);
  // console.log('xxxxxxxxxx result: ', result)
}

test()
