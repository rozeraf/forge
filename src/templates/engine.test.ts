import { test, expect } from "bun:test"
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
