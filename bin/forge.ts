#!/usr/bin/env bun
const [command, ...args] = Bun.argv.slice(2)

const commands: Record<string, () => Promise<void>> = {
  init:    () => import("../src/commands/init").then(m => m.run()),
  sync:    () => import("../src/commands/sync").then(m => m.run()),
  commit:  () => import("../src/commands/commit").then(m => m.run(args)),
  release: () => import("../src/commands/release").then(m => m.run(args)),
  feature: () => import("../src/commands/feature").then(m => m.run(args)),
}

if (!command || !(command in commands)) {
  console.error("Usage: forge <init|sync|commit|release|feature>")
  process.exit(1)
}

await commands[command]!()
