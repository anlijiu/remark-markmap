import esbuild, { BuildOptions } from 'esbuild'
import nodemon from 'nodemon'
import { parseArgs } from 'util'
import { nodeExternalsPlugin } from 'esbuild-node-externals'

/**
 * 我们不需要 cjs (不在node环境中使用)
 * esm 和 iife ,  在 playwright 里面 addscripttag ， 用的就是 iife , 搞到 window上
 */

// iife — <script> 标签引入的自执行函数。如果你想为你的应用创建一个包，你需要用到的可能就是这种。
const iifeBuildConfig: BuildOptions = {
  entryPoints: { markmap: 'src/index.ts' },
  outdir: 'dist',
  bundle: true,
  logLevel: 'info',
  chunkNames: 'chunks/markmap/[name]-[hash]',
  platform: 'browser',
  resolveExtensions: ['.ts', '.js', '.json', '.jison', '.yaml'],
  outExtension: { '.js': '.js' },
  keepNames: true,
  format: 'iife',
  sourcemap: 'external',
  external: ['require', 'fs', 'path'],
  metafile: false,
  splitting: false,
  globalName: '__esbuild_esm_markmap',
  footer: {
    js: 'globalThis.markmap = globalThis.__esbuild_esm_markmap.default;',
  },
  tsconfig: 'tsconfig.json',
  loader: { '.ts': 'ts' },
  // plugins: [nodeExternalsPlugin()],
}

//esm — 将 bundle 保存为 ES 模块文件。适用于其他打包工具，在现代浏览器中用 <script type=module> 标签引入（别名：ems, module）。
const esmBuildConfig: BuildOptions = {
  entryPoints: { 'markmap.core': 'src/index.ts' },
  outdir: 'dist',
  bundle: true,
  logLevel: 'info',
  chunkNames: 'chunks/markmap.core/[name]-[hash]',
  platform: 'browser',
  resolveExtensions: ['.ts', '.js', '.json', '.jison', '.yaml'],
  outExtension: { '.js': '.mjs' },
  keepNames: true,
  format: 'esm',
  sourcemap: 'external',
  external: ['require', 'fs', 'path'],
  metafile: false,
  splitting: true,
  // globalName: '__esbuild_esm_markmap',
  // footer: {
  //   js: 'globalThis.markmap = globalThis.__esbuild_esm_markmap.default;',
  // },
  tsconfig: 'tsconfig.json',
  loader: { '.ts': 'ts' },
  // plugins: [nodeExternalsPlugin()],
}

const { values: args } = parseArgs({
  options: {
    watch: {
      type: 'boolean',
      short: 'w',
    },
    dev: {
      type: 'boolean',
      short: 'd',
    },
  },
})

const buildFn = async () => {
  await esbuild
    .build(esmBuildConfig)
    .then(() => console.log('======== ⚡ Build esm Done! ========'))
    .catch(console.error)

  await esbuild
    .build(iifeBuildConfig)
    .then(() => console.log('======== ⚡ Build iife Done! ========'))
    .catch(console.error)
}

const watchFn = async () => {
  const ctx = await esbuild.context(esmBuildConfig)
  await ctx.watch()
  console.log('======== 👀 Watch Mode Enabled ========')
}

const execute = async () => {
  if (args.watch || args.dev) {
    await watchFn()
  } else {
    await buildFn()
  }

  if (args.dev) {
    nodemon({
      script: 'dist/index.js',
      ext: 'js',
      runOnChangeOnly: true, // prevent run twice if script file not exist
    })

    nodemon
      .on('start', () => {
        console.log('======== 🚦 Nodemon started ========')
      })
      .on('quit', () => {
        console.log('======== 👋 Nodemon quit ========')
        process.exit()
      })
      .on('restart', (files) => {
        console.log('======== 🔨 Nodemon Restarted ========')
      })
  }
}

await execute()
