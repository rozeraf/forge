import { test, expect } from "bun:test"
import { resolveTemplate } from "./resolver"
import type { ForgeConfig } from "../config/schema"

const base: ForgeConfig = {
  name: "my-app",
  type: "vite",
  runtime: "bun",
  provider: "github",
  workflow: "dev-main",
  ci: {
    lint: true, typecheck: true, test: true, build: true,
    deploy: { target: "vercel", onBranch: "main", env: [] },
  },
  hooks: { tool: "lefthook", preCommit: [], commitMsg: "none" },
}

test("resolves vite+vercel+bun+github → correct path", () => {
  expect(resolveTemplate(base).path).toBe("templates/ci/github/vite-vercel-bun.yml")
})

test("resolves node+no-deploy+node-runtime+gitlab → correct path", () => {
  const config: ForgeConfig = {
    ...base,
    type: "node",
    runtime: "node",
    provider: "gitlab",
    ci: { lint: true, typecheck: true, test: true, build: true },
  }
  expect(resolveTemplate(config).path).toBe("templates/ci/gitlab/node.yml")
})

test("resolves nextjs+cloudflare+node+github → correct path", () => {
  const config: ForgeConfig = {
    ...base,
    type: "nextjs",
    runtime: "node",
    ci: { ...base.ci, deploy: { target: "cloudflare", onBranch: "main", env: [] } },
  }
  expect(resolveTemplate(config).path).toBe("templates/ci/github/nextjs-cloudflare.yml")
})

test("vars: INSTALL_CMD is bun install --frozen-lockfile for bun runtime", () => {
  expect(resolveTemplate(base).vars["INSTALL_CMD"]).toBe("bun install --frozen-lockfile")
})

test("vars: INSTALL_CMD is npm ci for node runtime", () => {
  expect(resolveTemplate({ ...base, runtime: "node" }).vars["INSTALL_CMD"]).toBe("npm ci")
})

test("vars: BUILD_OUTPUT is .next/ for nextjs", () => {
  expect(resolveTemplate({ ...base, type: "nextjs" }).vars["BUILD_OUTPUT"]).toBe(".next/")
})

test("vars: BUILD_OUTPUT is dist/ for vite", () => {
  expect(resolveTemplate(base).vars["BUILD_OUTPUT"]).toBe("dist/")
})

test("vars: DEPLOY_BRANCH from deploy config", () => {
  expect(resolveTemplate(base).vars["DEPLOY_BRANCH"]).toBe("main")
})

test("vars: PROJECT_NAME from config.name", () => {
  expect(resolveTemplate(base).vars["PROJECT_NAME"]).toBe("my-app")
})

test("vars: RUN_CMD is bun run for bun, npm run for node", () => {
  expect(resolveTemplate(base).vars["RUN_CMD"]).toBe("bun run")
  expect(resolveTemplate({ ...base, runtime: "node" }).vars["RUN_CMD"]).toBe("npm run")
})

test("vars: BUILD_CMD is bun run build for bun, npm run build for node", () => {
  expect(resolveTemplate(base).vars["BUILD_CMD"]).toBe("bun run build")
  expect(resolveTemplate({ ...base, runtime: "node" }).vars["BUILD_CMD"]).toBe("npm run build")
})

test("vars: NODE_VERSION is 20", () => {
  expect(resolveTemplate(base).vars["NODE_VERSION"]).toBe("20")
})
