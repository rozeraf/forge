import { test, expect, beforeEach, afterEach } from "bun:test"
import { findConfigPath, loadConfig } from "./load"
import { mkdtemp, rm, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "forge-test-"))
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true })
})

test("findConfigPath finds forge.config.ts in current dir", async () => {
  await Bun.write(join(tmpDir, "forge.config.ts"), `export default {}`)
  const result = await findConfigPath(tmpDir)
  expect(result).toBe(join(tmpDir, "forge.config.ts"))
})

test("findConfigPath finds forge.config.ts in parent dir", async () => {
  const subDir = join(tmpDir, "sub", "dir")
  await mkdir(subDir, { recursive: true })
  await Bun.write(join(tmpDir, "forge.config.ts"), `export default {}`)
  const result = await findConfigPath(subDir)
  expect(result).toBe(join(tmpDir, "forge.config.ts"))
})

test("findConfigPath returns null if not found", async () => {
  const result = await findConfigPath(tmpDir)
  expect(result).toBeNull()
})

test("loadConfig returns config from forge.config.ts", async () => {
  await Bun.write(
    join(tmpDir, "forge.config.ts"),
    `export default { name: "test", type: "node", runtime: "bun", provider: "github", workflow: "dev-main", ci: { lint: false, typecheck: false, test: false, build: false }, hooks: { tool: "lefthook", preCommit: [], commitMsg: "none" } }`
  )
  const config = await loadConfig(tmpDir)
  expect(config).toMatchObject({ name: "test", type: "node", runtime: "bun" })
})

test("loadConfig throws if forge.config.ts not found", async () => {
  await expect(loadConfig(tmpDir)).rejects.toThrow("forge.config.ts not found")
})
