import { test, expect } from "bun:test"
import { defineConfig } from "./schema"
import type { ForgeConfig } from "./schema"

test("defineConfig returns the same object", () => {
  const config: ForgeConfig = {
    name: "my-app",
    type: "vite",
    runtime: "bun",
    provider: "github",
    workflow: "dev-main",
    ci: { lint: true, typecheck: true, test: true, build: true },
    hooks: { tool: "lefthook", preCommit: ["bun run lint"], commitMsg: "conventional" },
  }
  expect(defineConfig(config)).toBe(config)
})
