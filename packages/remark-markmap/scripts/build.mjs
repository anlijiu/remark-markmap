"use strict";
import esbuild from "esbuild";
import nodemon from "nodemon";
import { parseArgs } from "util";
import { nodeExternalsPlugin } from "esbuild-node-externals";
const buildConfig = {
  entryPoints: ["src/*.ts"],
  outdir: "dist",
  bundle: false,
  keepNames: true,
  format: "esm",
  platform: "node",
  target: "node20",
  // format: "iife",
  // platform: "browser",
  tsconfig: "tsconfig.json",
  loader: { ".ts": "ts" },
  plugins: [nodeExternalsPlugin()]
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
const buildFn = async () => await esbuild.build(buildConfig).then(() => console.log("======== \u26A1 Build Done! ========")).catch(console.error);
const watchFn = async () => {
  const ctx = await esbuild.context(buildConfig);
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
