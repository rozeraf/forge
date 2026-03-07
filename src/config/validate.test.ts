import { test, expect } from "bun:test"
import { validateConfig } from "./validate"
import type { ForgeConfig } from "./schema"

const base: ForgeConfig = {
  name: "my-app",
  type: "vite",
  runtime: "bun",
  provider: "github",
  workflow: "dev-main",
  vite: { template: "react-ts" },
  ci: { lint: true, typecheck: true, test: true, build: true },
  hooks: { tool: "lefthook", preCommit: [], commitMsg: "none" },
}

test("validateConfig passes valid config", () => {
  expect(() => validateConfig(base)).not.toThrow()
})

test("validateConfig throws if name is empty", () => {
  expect(() => validateConfig({ ...base, name: "" })).toThrow("name")
})

test("validateConfig throws if type is vite but vite field is missing", () => {
  expect(() => validateConfig({ ...base, type: "vite", vite: undefined })).toThrow("vite")
})

test("validateConfig passes if type is vite and vite field is present", () => {
  expect(() => validateConfig({ ...base, type: "vite", vite: { template: "react-ts" } })).not.toThrow()
})

test("validateConfig throws if deploy target is custom but no customScript", () => {
  const config: ForgeConfig = {
    ...base,
    ci: { ...base.ci, deploy: { target: "custom", onBranch: "main", env: [] } },
  }
  expect(() => validateConfig(config)).toThrow("customScript")
})
