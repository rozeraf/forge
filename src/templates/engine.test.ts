import { test, expect } from "bun:test"
import { join } from "node:path"
import { render } from "./engine"

test("render replaces placeholder with value", () => {
  expect(render("run: {{INSTALL_CMD}}", { INSTALL_CMD: "bun install" })).toBe("run: bun install")
})

test("render replaces multiple occurrences of same placeholder", () => {
  expect(render("{{NAME}} - {{NAME}}", { NAME: "foo" })).toBe("foo - foo")
})

test("render replaces multiple different placeholders", () => {
  expect(render("{{A}} + {{B}}", { A: "1", B: "2" })).toBe("1 + 2")
})

test("render leaves unknown placeholders as empty string", () => {
  expect(render("{{UNKNOWN}}", {})).toBe("")
})

test("render handles template with no placeholders", () => {
  expect(render("no placeholders here", {})).toBe("no placeholders here")
})

test("renders github/vite-vercel-bun.yml without leftover placeholders", async () => {
  const templatePath = join(import.meta.dir, "../../templates/ci/github/vite-vercel-bun.yml")
  const template = await Bun.file(templatePath).text()
  const result = render(template, {
    INSTALL_CMD: "bun install --frozen-lockfile",
    RUN_CMD: "bun run",
    BUILD_CMD: "bun run build",
    BUILD_OUTPUT: "dist/",
    DEPLOY_BRANCH: "main",
    NODE_VERSION: "20",
  })
  expect(result).not.toMatch(/\{\{\w+\}\}/)
  expect(result).toContain("bun install --frozen-lockfile")
})
