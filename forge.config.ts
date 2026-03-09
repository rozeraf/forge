import { defineConfig } from "./src/config/schema"

export default defineConfig({
  name: "forge",
  type: "node",
  runtime: "bun",
  provider: "github",
  workflow: "dev-main",
  ci: {
    lint: false,
    typecheck: true,
    test: true,
    build: false,
  },
  hooks: {
    tool: "lefthook",
    preCommit: ["bun run typecheck"],
    commitMsg: "conventional",
  },
})
