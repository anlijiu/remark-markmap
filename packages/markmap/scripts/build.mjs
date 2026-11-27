"use strict";
import esbuild from "esbuild";
import nodemon from "nodemon";
import { parseArgs } from "util";
import { readFileSync } from "node:fs";
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const externalDeps = Object.keys(pkg.dependencies ?? {}).flatMap((dep) => [dep, `${dep}/*`]);
const iifeBuildConfig = {
  entryPoints: { markmap: "src/index.ts" },
  outdir: "dist",
  bundle: true,
  logLevel: "info",
  chunkNames: "chunks/markmap/[name]-[hash]",
  platform: "browser",
  resolveExtensions: [".ts", ".js", ".json", ".jison", ".yaml"],
  outExtension: { ".js": ".js" },
  keepNames: true,
  format: "iife",
  sourcemap: "external",
  external: ["require", "fs", "path"],
  metafile: false,
  splitting: false,
  globalName: "__esbuild_esm_markmap",
  footer: {
    js: "globalThis.markmap = globalThis.__esbuild_esm_markmap.default;"
  },
  tsconfig: "tsconfig.json",
  loader: { ".ts": "ts" }
  // plugins: [nodeExternalsPlugin()],
};
const esmBuildConfig = {
  entryPoints: { "markmap.core": "src/index.ts" },
  outdir: "dist",
  bundle: true,
  logLevel: "info",
  chunkNames: "chunks/markmap.core/[name]-[hash]",
  platform: "browser",
  resolveExtensions: [".ts", ".js", ".json", ".jison", ".yaml"],
  outExtension: { ".js": ".mjs" },
  keepNames: true,
  format: "esm",
  sourcemap: "external",
  external: ["require", "fs", "path", ...externalDeps],
  metafile: false,
  splitting: true,
  // globalName: '__esbuild_esm_markmap',
  // footer: {
  //   js: 'globalThis.markmap = globalThis.__esbuild_esm_markmap.default;',
  // },
  tsconfig: "tsconfig.json",
  loader: { ".ts": "ts" }
  // plugins: [nodeExternalsPlugin()],
};
const { values: args } = parseArgs({
  options: {
    watch: {
      type: "boolean",
      short: "w"
    },
    dev: {
      type: "boolean",
      short: "d"
    }
  }
});
const buildFn = async () => {
  await esbuild.build(esmBuildConfig).then(() => console.log("======== \u26A1 Build esm Done! ========")).catch(console.error);
  await esbuild.build(iifeBuildConfig).then(() => console.log("======== \u26A1 Build iife Done! ========")).catch(console.error);
};
const watchFn = async () => {
  const ctx = await esbuild.context(esmBuildConfig);
  await ctx.watch();
  console.log("======== \u{1F440} Watch Mode Enabled ========");
};
const execute = async () => {
  if (args.watch || args.dev) {
    await watchFn();
  } else {
    await buildFn();
  }
  if (args.dev) {
    nodemon({
      script: "dist/index.js",
      ext: "js",
      runOnChangeOnly: true
      // prevent run twice if script file not exist
    });
    nodemon.on("start", () => {
      console.log("======== \u{1F6A6} Nodemon started ========");
    }).on("quit", () => {
      console.log("======== \u{1F44B} Nodemon quit ========");
      process.exit();
    }).on("restart", (files) => {
      console.log("======== \u{1F528} Nodemon Restarted ========");
    });
  }
};
await execute();
