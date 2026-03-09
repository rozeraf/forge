import { test, expect } from "bun:test"
import { buildPrompt } from "./commit"

test("buildPrompt includes the diff", () => {
  const diff = "diff --git a/foo.ts b/foo.ts\n+const x = 1"
  const prompt = buildPrompt(diff)
  expect(prompt).toContain(diff)
})

test("buildPrompt mentions conventional commits", () => {
  const prompt = buildPrompt("some diff")
  expect(prompt.toLowerCase()).toContain("conventional commits")
})
