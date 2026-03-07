# repo-forge Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build `forge` CLI — a tool that manages git project setup and daily workflow through a single `forge.config.ts` source of truth.

**Architecture:** Two layers: init/sync for project setup (generates CI configs, hooks, gitignore from config) and commit/release/feature for daily workflow. Config schema drives everything — templates fill in values from config, providers abstract GitHub/GitLab differences.

**Tech Stack:** Bun (runtime + shell + test), TypeScript (native, no compilation), @clack/prompts (interactive prompts), bun:test for unit tests.

**Current state:** `package.json` already has `bin.forge → ./bin/forge.ts` and `@clack/prompts` dep. `index.ts` is a placeholder to be removed. `tsconfig.json` is standard Bun config.

---

## Stage 1: Foundation

### Task 1: Config Schema

**Files:**
- Create: `src/config/schema.ts`
- Create: `src/config/schema.test.ts`

**Step 1: Write the failing test**

```typescript
// src/config/schema.test.ts
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
```

**Step 2: Run test to verify it fails**

```bash
bun test src/config/schema.test.ts
```
Expected: FAIL — Cannot find module './schema'

**Step 3: Write implementation**

```typescript
// src/config/schema.ts
export type ProjectType = "nextjs" | "vite" | "node" | "static" | "custom"
export type Provider = "github" | "gitlab"
export type Runtime = "bun" | "node"
export type Workflow = "dev-main" | "dev-main-features"
export type DeployTarget = "vercel" | "cloudflare" | "custom"
export type HookTool = "lefthook" | "husky"

export interface CIStep {
  name: string
  run: string
}

export interface DeployConfig {
  target: DeployTarget
  onBranch: string
  customScript?: string
  env: string[]
}

export interface CIConfig {
  lint: boolean
  typecheck: boolean
  test: boolean
  build: boolean
  extra?: CIStep[]
  deploy?: DeployConfig
}

export interface HooksConfig {
  tool: HookTool
  preCommit: string[]
  commitMsg: "conventional" | "none"
}

export interface ViteScaffold {
  template: "react-ts" | "react" | "vanilla-ts" | "vanilla"
}

export interface ForgeConfig {
  name: string
  type: ProjectType
  runtime: Runtime
  provider: Provider
  workflow: Workflow
  vite?: ViteScaffold
  ci: CIConfig
  hooks: HooksConfig
}

export function defineConfig(config: ForgeConfig): ForgeConfig {
  return config
}
```

**Step 4: Run test to verify it passes**

```bash
bun test src/config/schema.test.ts
```
Expected: PASS

**Step 5: Commit via commit-agent**

---

### Task 2: Config Loader

**Files:**
- Create: `src/config/load.ts`
- Create: `src/config/load.test.ts`

**Step 1: Write the failing tests**

```typescript
// src/config/load.test.ts
import { test, expect, beforeEach, afterEach } from "bun:test"
import { findConfigPath } from "./load"
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
```

**Step 2: Run test to verify it fails**

```bash
bun test src/config/load.test.ts
```
Expected: FAIL — Cannot find module './load'

**Step 3: Write implementation**

```typescript
// src/config/load.ts
import { join, dirname } from "node:path"
import type { ForgeConfig } from "./schema"

export async function findConfigPath(startDir: string): Promise<string | null> {
  let dir = startDir
  while (true) {
    const candidate = join(dir, "forge.config.ts")
    if (await Bun.file(candidate).exists()) return candidate
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

export async function loadConfig(startDir = process.cwd()): Promise<ForgeConfig> {
  const configPath = await findConfigPath(startDir)
  if (!configPath) {
    throw new Error("forge.config.ts not found. Run `forge init` first.")
  }
  const mod = await import(configPath)
  return mod.default ?? mod
}
```

**Step 4: Run test to verify it passes**

```bash
bun test src/config/load.test.ts
```
Expected: PASS

**Step 5: Commit via commit-agent**

---

### Task 3: Config Validator

**Files:**
- Create: `src/config/validate.ts`
- Create: `src/config/validate.test.ts`

**Step 1: Write the failing tests**

```typescript
// src/config/validate.test.ts
import { test, expect } from "bun:test"
import { validateConfig } from "./validate"
import type { ForgeConfig } from "./schema"

const base: ForgeConfig = {
  name: "my-app",
  type: "vite",
  runtime: "bun",
  provider: "github",
  workflow: "dev-main",
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
```

**Step 2: Run test to verify it fails**

```bash
bun test src/config/validate.test.ts
```
Expected: FAIL — Cannot find module './validate'

**Step 3: Write implementation**

```typescript
// src/config/validate.ts
import type { ForgeConfig } from "./schema"

export function validateConfig(config: ForgeConfig): void {
  if (!config.name?.trim()) {
    throw new Error("forge.config.ts: 'name' is required")
  }
  if (config.type === "vite" && !config.vite) {
    throw new Error("forge.config.ts: 'vite' config required when type is 'vite'")
  }
  if (config.ci.deploy?.target === "custom" && !config.ci.deploy.customScript) {
    throw new Error("forge.config.ts: 'customScript' required when deploy target is 'custom'")
  }
}
```

**Step 4: Run test to verify it passes**

```bash
bun test src/config/validate.test.ts
```
Expected: PASS

**Step 5: Commit via commit-agent**

---

### Task 4: CLI Entry Point

**Files:**
- Create: `bin/forge.ts`
- Delete: `index.ts` (was placeholder)

**Step 1: Write implementation**

```typescript
// bin/forge.ts
const [command, ...args] = Bun.argv.slice(2)

const commands: Record<string, () => Promise<void>> = {
  init:    () => import("../src/commands/init").then(m => m.run()),
  sync:    () => import("../src/commands/sync").then(m => m.run()),
  commit:  () => import("../src/commands/commit").then(m => m.run(args)),
  release: () => import("../src/commands/release").then(m => m.run(args)),
  feature: () => import("../src/commands/feature").then(m => m.run(args)),
}

if (!command || !(command in commands)) {
  console.log("Usage: forge <init|sync|commit|release|feature>")
  process.exit(1)
}

await commands[command]!()
```

**Step 2: Verify**

```bash
bun bin/forge.ts
```
Expected: prints "Usage: forge <init|sync|commit|release|feature>" and exits 1

```bash
bun bin/forge.ts invalid
```
Expected: same output

**Step 3: Remove placeholder**

```bash
git rm index.ts
```

**Step 4: Commit via commit-agent**

---

## Stage 2: Init & Sync

### Task 5: Template Engine

**Files:**
- Create: `src/templates/engine.ts`
- Create: `src/templates/engine.test.ts`

**Step 1: Write the failing tests**

```typescript
// src/templates/engine.test.ts
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
```

**Step 2: Run test to verify it fails**

```bash
bun test src/templates/engine.test.ts
```
Expected: FAIL — Cannot find module './engine'

**Step 3: Write implementation**

```typescript
// src/templates/engine.ts
export function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "")
}
```

**Step 4: Run test to verify it passes**

```bash
bun test src/templates/engine.test.ts
```
Expected: PASS

**Step 5: Commit via commit-agent**

---

### Task 6: Template Resolver

**Files:**
- Create: `src/templates/resolver.ts`
- Create: `src/templates/resolver.test.ts`

**Step 1: Write the failing tests**

```typescript
// src/templates/resolver.test.ts
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
```

**Step 2: Run test to verify it fails**

```bash
bun test src/templates/resolver.test.ts
```
Expected: FAIL — Cannot find module './resolver'

**Step 3: Write implementation**

```typescript
// src/templates/resolver.ts
import type { ForgeConfig } from "../config/schema"

export function resolveTemplate(config: ForgeConfig): { path: string; vars: Record<string, string> } {
  const suffix = config.runtime === "bun" ? "-bun" : ""
  const target = config.ci.deploy?.target
  const deployPart = target ? `-${target}` : ""
  const filename = `${config.type}${deployPart}${suffix}.yml`
  const dir = `templates/ci/${config.provider}`

  const vars: Record<string, string> = {
    PROJECT_NAME:  config.name,
    INSTALL_CMD:   config.runtime === "bun" ? "bun install --frozen-lockfile" : "npm ci",
    RUN_CMD:       config.runtime === "bun" ? "bun run" : "npm run",
    BUILD_CMD:     config.runtime === "bun" ? "bun run build" : "npm run build",
    BUILD_OUTPUT:  config.type === "nextjs" ? ".next/" : "dist/",
    DEPLOY_BRANCH: config.ci.deploy?.onBranch ?? "main",
    NODE_VERSION:  "20",
  }

  return { path: `${dir}/${filename}`, vars }
}
```

**Step 4: Run test to verify it passes**

```bash
bun test src/templates/resolver.test.ts
```
Expected: PASS

**Step 5: Commit via commit-agent**

---

### Task 7: CI Templates

Create all CI template files. Use `vite-vercel-bun.yml` as the reference structure for all variants.

**Files:**
- Create: `templates/ci/github/vite-vercel-bun.yml` ← reference
- Create: `templates/ci/github/vite-vercel.yml`
- Create: `templates/ci/github/vite-cloudflare-bun.yml`
- Create: `templates/ci/github/vite-cloudflare.yml`
- Create: `templates/ci/github/nextjs-vercel-bun.yml`
- Create: `templates/ci/github/nextjs-vercel.yml`
- Create: `templates/ci/github/nextjs-cloudflare-bun.yml`
- Create: `templates/ci/github/nextjs-cloudflare.yml`
- Create: `templates/ci/github/node-bun.yml`
- Create: `templates/ci/github/node.yml`
- Create: `templates/ci/gitlab/vite-vercel-bun.yml`
- Create: `templates/ci/gitlab/vite-vercel.yml`
- Create: `templates/ci/gitlab/vite-cloudflare-bun.yml`
- Create: `templates/ci/gitlab/vite-cloudflare.yml`
- Create: `templates/ci/gitlab/nextjs-vercel-bun.yml`
- Create: `templates/ci/gitlab/nextjs-vercel.yml`
- Create: `templates/ci/gitlab/nextjs-cloudflare-bun.yml`
- Create: `templates/ci/gitlab/nextjs-cloudflare.yml`
- Create: `templates/ci/gitlab/node-bun.yml`
- Create: `templates/ci/gitlab/node.yml`

**Step 1: Create reference template — `templates/ci/github/vite-vercel-bun.yml`**

```yaml
name: CI

on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install
        run: {{INSTALL_CMD}}

      - name: Lint
        run: {{RUN_CMD}} lint

      - name: Typecheck
        run: {{RUN_CMD}} typecheck

      - name: Test
        run: {{RUN_CMD}} test

      - name: Build
        run: {{BUILD_CMD}}

  deploy:
    needs: ci
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/{{DEPLOY_BRANCH}}'
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install
        run: {{INSTALL_CMD}}

      - name: Deploy to Vercel
        run: bunx vercel --prod --token ${{ secrets.VERCEL_TOKEN }}
```

**Step 2: Create all other GitHub templates**

`vite-vercel.yml` — same as vite-vercel-bun.yml but use `actions/setup-node@v4` with `node-version: {{NODE_VERSION}}` instead of `oven-sh/setup-bun@v2`, and replace `bun` commands with `npm`:

```yaml
name: CI

on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: {{NODE_VERSION}}

      - name: Install
        run: {{INSTALL_CMD}}

      - name: Lint
        run: {{RUN_CMD}} lint

      - name: Typecheck
        run: {{RUN_CMD}} typecheck

      - name: Test
        run: {{RUN_CMD}} test

      - name: Build
        run: {{BUILD_CMD}}

  deploy:
    needs: ci
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/{{DEPLOY_BRANCH}}'
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: {{NODE_VERSION}}

      - name: Install
        run: {{INSTALL_CMD}}

      - name: Deploy to Vercel
        run: npx vercel --prod --token ${{ secrets.VERCEL_TOKEN }}
```

`vite-cloudflare-bun.yml` — same as vite-vercel-bun.yml but deploy step uses Wrangler:

```yaml
      - name: Deploy to Cloudflare
        run: bunx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

`vite-cloudflare.yml` — node runtime + Wrangler via npx.

`nextjs-vercel-bun.yml` and `nextjs-vercel.yml` — identical to vite variants (Next.js deploys via Vercel CLI the same way; BUILD_OUTPUT differs but that's a var).

`nextjs-cloudflare-bun.yml` and `nextjs-cloudflare.yml` — same as vite-cloudflare but for nextjs.

`node-bun.yml` — no deploy job:

```yaml
name: CI

on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install
        run: {{INSTALL_CMD}}

      - name: Lint
        run: {{RUN_CMD}} lint

      - name: Typecheck
        run: {{RUN_CMD}} typecheck

      - name: Test
        run: {{RUN_CMD}} test
```

`node.yml` — same but with node setup instead of bun.

**Step 3: Create GitLab CI templates**

Reference: `templates/ci/gitlab/vite-vercel-bun.yml`

```yaml
image: oven/bun:latest

stages:
  - ci
  - deploy

cache:
  paths:
    - node_modules/

install:
  stage: ci
  script:
    - {{INSTALL_CMD}}
  artifacts:
    paths:
      - node_modules/
    expire_in: 1 hour

lint:
  stage: ci
  needs: [install]
  script:
    - {{RUN_CMD}} lint

typecheck:
  stage: ci
  needs: [install]
  script:
    - {{RUN_CMD}} typecheck

test:
  stage: ci
  needs: [install]
  script:
    - {{RUN_CMD}} test

build:
  stage: ci
  needs: [install]
  script:
    - {{BUILD_CMD}}

deploy:
  stage: deploy
  needs: [lint, typecheck, test, build]
  only:
    - {{DEPLOY_BRANCH}}
  script:
    - bunx vercel --prod --token $VERCEL_TOKEN
  environment:
    name: production
```

GitLab variants follow the same pattern — swap `image`, setup commands, and deploy script per runtime/target. `node.yml` and `node-bun.yml` have no deploy stage. Cloudflare variants use `bunx wrangler deploy` / `npx wrangler deploy`. Node runtime variants use `image: node:{{NODE_VERSION}}`.

**Step 4: Write integration test (add to engine.test.ts)**

```typescript
import { join } from "node:path"

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
  expect(result).not.toContain("{{")
  expect(result).toContain("bun install --frozen-lockfile")
})
```

**Step 5: Run tests**

```bash
bun test src/templates/engine.test.ts
```
Expected: PASS

**Step 6: Commit via commit-agent**

---

### Task 8: Hook and Gitignore Templates

**Files:**
- Create: `templates/hooks/lefthook.yml` (base template, commands injected by sync)
- Create: `templates/hooks/husky/pre-commit`
- Create: `templates/hooks/husky/commit-msg`
- Create: `templates/gitignore/nextjs`
- Create: `templates/gitignore/node`
- Create: `templates/gitignore/vite`

**Step 1: Create hook templates**

`templates/hooks/husky/pre-commit`:
```sh
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

{{PRE_COMMIT_COMMANDS}}
```

`templates/hooks/husky/commit-msg`:
```sh
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

{{COMMIT_MSG_CHECK}}
```

Note: lefthook.yml is generated programmatically in sync (dynamic command list), not from a static template.

**Step 2: Create gitignore templates**

`templates/gitignore/node`:
```
node_modules/
dist/
.env
.env.local
*.log
```

`templates/gitignore/vite`:
```
node_modules/
dist/
dist-ssr/
*.local
.env
.env.local
```

`templates/gitignore/nextjs`:
```
node_modules/
.next/
out/
.env
.env.local
.env*.local
```

**Step 3: No tests needed** (static files, correctness verified visually)

**Step 4: Commit via commit-agent**

---

### Task 9: Providers

**Files:**
- Create: `src/providers/github.ts`
- Create: `src/providers/gitlab.ts`

These are thin wrappers — no unit tests (require external CLI tools).

**Step 1: Write GitHub provider**

```typescript
// src/providers/github.ts
export const github = {
  setSecret: (name: string, value: string) =>
    Bun.$`gh secret set ${name} --body ${value}`,
  createPR: (base: string, head: string) =>
    Bun.$`gh pr create --base ${base} --head ${head} --fill`,
  mergePR: () =>
    Bun.$`gh pr merge --squash --delete-branch`,
}
```

**Step 2: Write GitLab provider**

```typescript
// src/providers/gitlab.ts
export const gitlab = {
  setSecret: (name: string, value: string) =>
    Bun.$`glab variable set ${name} --value ${value}`,
  createMR: (source: string, target: string) =>
    Bun.$`glab mr create --source-branch ${source} --target-branch ${target} --fill`,
  mergeMR: () =>
    Bun.$`glab mr merge --squash --remove-source-branch`,
}
```

**Step 3: Commit via commit-agent**

---

### Task 10: Sync Command

**Files:**
- Create: `src/commands/sync.ts`

Sync is idempotent. It loads config, resolves template, renders it, writes output files, sets up hooks, gitignore, branches, and secrets. External tool calls mean no unit tests — verify by running manually.

**Step 1: Write implementation**

```typescript
// src/commands/sync.ts
import { loadConfig } from "../config/load"
import { validateConfig } from "../config/validate"
import { resolveTemplate } from "../templates/resolver"
import { render } from "../templates/engine"
import { join, dirname } from "node:path"
import { mkdir } from "node:fs/promises"
import * as p from "@clack/prompts"
import type { ForgeConfig } from "../config/schema"

export async function run(): Promise<void> {
  p.intro("forge sync")
  const config = await loadConfig()
  validateConfig(config)

  const s = p.spinner()

  // 1. Write CI config
  s.start("Writing CI config")
  const { path: templateRelPath, vars } = resolveTemplate(config)
  const templateFile = Bun.file(join(import.meta.dir, "../../", templateRelPath))
  if (!(await templateFile.exists())) {
    s.stop(`Template not found: ${templateRelPath}`)
    p.log.warn(`Skipping CI — template ${templateRelPath} not implemented yet`)
  } else {
    const rendered = render(await templateFile.text(), vars)
    const ciPath = config.provider === "github" ? ".github/workflows/ci.yml" : ".gitlab-ci.yml"
    await mkdir(dirname(ciPath), { recursive: true })
    await Bun.write(ciPath, rendered)
    s.stop(`CI config → ${ciPath}`)
  }

  // 2. Write hooks config
  s.start("Setting up hooks")
  await writeHooksConfig(config)
  s.stop("Hooks config written")

  // 3. Write .gitignore
  s.start("Writing .gitignore")
  await writeGitignore(config)
  s.stop(".gitignore written")

  // 4. Ensure branches exist
  s.start("Checking branches")
  await ensureBranches()
  s.stop("Branches ready")

  // 5. Set env secrets
  if (config.ci.deploy?.env?.length) {
    s.start("Checking env secrets")
    await ensureSecrets(config)
    s.stop("Secrets configured")
  }

  // 6. Install hooks
  s.start("Installing hooks")
  await installHooks(config)
  s.stop("Hooks installed")

  p.outro("Sync complete")
}

async function writeHooksConfig(config: ForgeConfig): Promise<void> {
  if (config.hooks.tool === "lefthook") {
    const commandLines = config.hooks.preCommit
      .map((cmd, i) => `    cmd-${i + 1}:\n      run: ${cmd}`)
      .join("\n")
    const commitMsgSection = config.hooks.commitMsg === "conventional"
      ? `\ncommit-msg:\n  commands:\n    commitlint:\n      run: bunx commitlint --edit {1}\n`
      : ""
    await Bun.write(
      "lefthook.yml",
      `pre-commit:\n  commands:\n${commandLines}\n${commitMsgSection}`
    )
  } else {
    const templateDir = join(import.meta.dir, "../../templates/hooks/husky")
    await mkdir(".husky", { recursive: true })

    const preCommitTpl = await Bun.file(join(templateDir, "pre-commit")).text()
    await Bun.write(
      ".husky/pre-commit",
      render(preCommitTpl, { PRE_COMMIT_COMMANDS: config.hooks.preCommit.join("\n") })
    )

    const commitMsgTpl = await Bun.file(join(templateDir, "commit-msg")).text()
    const check = config.hooks.commitMsg === "conventional" ? "bunx commitlint --edit $1" : ""
    await Bun.write(".husky/commit-msg", render(commitMsgTpl, { COMMIT_MSG_CHECK: check }))
  }
}

async function writeGitignore(config: ForgeConfig): Promise<void> {
  const type = config.type === "static" || config.type === "custom" ? "node" : config.type
  const templatePath = join(import.meta.dir, `../../templates/gitignore/${type}`)
  const file = Bun.file(templatePath)
  if (await file.exists()) {
    await Bun.write(".gitignore", await file.text())
  }
}

async function ensureBranches(): Promise<void> {
  const branches = await Bun.$`git branch --list`.text()
  if (!branches.includes("dev")) {
    await Bun.$`git branch dev`.quiet()
  }
}

async function ensureSecrets(config: ForgeConfig): Promise<void> {
  for (const name of config.ci.deploy?.env ?? []) {
    let value = process.env[name]
    if (!value) {
      const result = await p.text({
        message: `Enter value for secret ${name}:`,
        validate: v => (v ? undefined : "Value required"),
      })
      if (p.isCancel(result)) continue
      value = result
    }
    if (config.provider === "github") {
      await Bun.$`gh secret set ${name} --body ${value}`.quiet()
    } else {
      await Bun.$`glab variable set ${name} --value ${value}`.quiet()
    }
  }
}

async function installHooks(config: ForgeConfig): Promise<void> {
  if (config.hooks.tool === "lefthook") {
    await Bun.$`lefthook install`.quiet()
  } else {
    await Bun.$`bunx husky init`.quiet()
  }
}
```

**Step 2: Smoke test**

Create a minimal `forge.config.ts` in a temp dir and run sync:

```bash
mkdir /tmp/forge-sync-test && cd /tmp/forge-sync-test
git init
cat > forge.config.ts << 'EOF'
import { defineConfig } from "/home/raf/git/users/rozeraf/forge/src/config/schema"
export default defineConfig({
  name: "test-app",
  type: "node",
  runtime: "bun",
  provider: "github",
  workflow: "dev-main",
  ci: { lint: false, typecheck: false, test: true, build: false },
  hooks: { tool: "lefthook", preCommit: ["bun run test"], commitMsg: "none" },
})
EOF
bun /home/raf/git/users/rozeraf/forge/bin/forge.ts sync
```
Expected: Writes `.github/workflows/ci.yml`, `lefthook.yml`, `.gitignore`.

**Step 3: Commit via commit-agent**

---

### Task 11: Init Command

**Files:**
- Create: `src/commands/init.ts`

**Step 1: Write implementation**

```typescript
// src/commands/init.ts
import * as p from "@clack/prompts"
import { existsSync } from "node:fs"
import { basename } from "node:path"
import type { ForgeConfig, ProjectType, Runtime, Provider, Workflow, DeployTarget, HookTool } from "../config/schema"

export async function run(): Promise<void> {
  if (existsSync("forge.config.ts")) {
    console.error("forge.config.ts already exists. Use `forge sync` to apply changes.")
    process.exit(1)
  }

  p.intro("forge init")

  const name = await p.text({
    message: "Project name",
    defaultValue: basename(process.cwd()),
    placeholder: basename(process.cwd()),
  })
  if (p.isCancel(name)) { p.cancel("Cancelled"); process.exit(0) }

  const type = await p.select<{ value: ProjectType; label: string }[], ProjectType>({
    message: "Project type",
    options: [
      { value: "nextjs", label: "Next.js" },
      { value: "vite", label: "Vite" },
      { value: "node", label: "Node.js" },
      { value: "static", label: "Static" },
      { value: "custom", label: "Custom" },
    ],
  })
  if (p.isCancel(type)) { p.cancel("Cancelled"); process.exit(0) }

  let viteTemplate: string | undefined
  if (type === "vite") {
    const t = await p.select({
      message: "Vite template",
      options: [
        { value: "react-ts", label: "React + TypeScript" },
        { value: "react", label: "React" },
        { value: "vanilla-ts", label: "Vanilla TypeScript" },
        { value: "vanilla", label: "Vanilla" },
      ],
    })
    if (p.isCancel(t)) { p.cancel("Cancelled"); process.exit(0) }
    viteTemplate = t
  }

  const runtime = await p.select<{ value: Runtime; label: string }[], Runtime>({
    message: "Runtime",
    options: [
      { value: "bun", label: "Bun" },
      { value: "node", label: "Node.js" },
    ],
  })
  if (p.isCancel(runtime)) { p.cancel("Cancelled"); process.exit(0) }

  const provider = await p.select<{ value: Provider; label: string }[], Provider>({
    message: "Git provider",
    options: [
      { value: "github", label: "GitHub" },
      { value: "gitlab", label: "GitLab" },
    ],
  })
  if (p.isCancel(provider)) { p.cancel("Cancelled"); process.exit(0) }

  const workflow = await p.select<{ value: Workflow; label: string }[], Workflow>({
    message: "Branch workflow",
    options: [
      { value: "dev-main", label: "dev → main" },
      { value: "dev-main-features", label: "feature/* → dev → main" },
    ],
  })
  if (p.isCancel(workflow)) { p.cancel("Cancelled"); process.exit(0) }

  const deployTarget = await p.select<{ value: DeployTarget | "none"; label: string }[], DeployTarget | "none">({
    message: "Deploy target",
    options: [
      { value: "none", label: "None" },
      { value: "vercel", label: "Vercel" },
      { value: "cloudflare", label: "Cloudflare" },
      { value: "custom", label: "Custom" },
    ],
  })
  if (p.isCancel(deployTarget)) { p.cancel("Cancelled"); process.exit(0) }

  let deployBranch = "main"
  let customScript: string | undefined
  let envVars: string[] = []

  if (deployTarget !== "none") {
    const branch = await p.text({ message: "Deploy branch", defaultValue: "main", placeholder: "main" })
    if (p.isCancel(branch)) { p.cancel("Cancelled"); process.exit(0) }
    deployBranch = branch

    if (deployTarget === "custom") {
      const script = await p.text({ message: "Custom deploy script", placeholder: "./deploy.sh" })
      if (p.isCancel(script)) { p.cancel("Cancelled"); process.exit(0) }
      customScript = script
    }

    envVars = await collectList("Add env variable name (empty to finish)", "VERCEL_TOKEN")
  }

  const hooksTool = await p.select<{ value: HookTool; label: string }[], HookTool>({
    message: "Git hooks tool",
    options: [
      { value: "lefthook", label: "Lefthook" },
      { value: "husky", label: "Husky" },
    ],
  })
  if (p.isCancel(hooksTool)) { p.cancel("Cancelled"); process.exit(0) }

  const preCommitCmds = await collectList("Pre-commit command (empty to finish)", "bun run lint")

  const commitMsg = await p.select<{ value: "conventional" | "none"; label: string }[], "conventional" | "none">({
    message: "Commit message convention",
    options: [
      { value: "conventional", label: "Conventional Commits" },
      { value: "none", label: "None" },
    ],
  })
  if (p.isCancel(commitMsg)) { p.cancel("Cancelled"); process.exit(0) }

  const lint      = await p.confirm({ message: "Add lint step to CI?", initialValue: true })
  const typecheck = await p.confirm({ message: "Add typecheck step to CI?", initialValue: true })
  const test      = await p.confirm({ message: "Add test step to CI?", initialValue: true })
  const build     = await p.confirm({ message: "Add build step to CI?", initialValue: true })

  const config: ForgeConfig = {
    name,
    type,
    runtime,
    provider,
    workflow,
    ...(type === "vite" && viteTemplate ? { vite: { template: viteTemplate as any } } : {}),
    ci: {
      lint: !!lint,
      typecheck: !!typecheck,
      test: !!test,
      build: !!build,
      ...(deployTarget !== "none" ? {
        deploy: {
          target: deployTarget,
          onBranch: deployBranch,
          ...(deployTarget === "custom" ? { customScript } : {}),
          env: envVars,
        },
      } : {}),
    },
    hooks: {
      tool: hooksTool,
      preCommit: preCommitCmds,
      commitMsg,
    },
  }

  // Scaffold vite if needed
  if (type === "vite" && viteTemplate) {
    const s = p.spinner()
    s.start("Scaffolding Vite project")
    await Bun.$`bun create vite@latest . --template ${viteTemplate}`.quiet()
    await Bun.$`bun install`.quiet()
    s.stop("Vite project scaffolded")
  }

  await Bun.write("forge.config.ts", generateConfigFile(config))
  p.log.success("forge.config.ts created")

  const { run: sync } = await import("./sync")
  await sync()

  p.outro("Project initialized!")
}

async function collectList(message: string, placeholder: string): Promise<string[]> {
  const items: string[] = []
  while (true) {
    const item = await p.text({ message, placeholder })
    if (p.isCancel(item) || !item) break
    items.push(item)
  }
  return items
}

function generateConfigFile(config: ForgeConfig): string {
  return `import { defineConfig } from "forge"\n\nexport default defineConfig(${JSON.stringify(config, null, 2)})\n`
}
```

**Step 2: Smoke test**

```bash
mkdir /tmp/forge-init-test && cd /tmp/forge-init-test
git init
bun /home/raf/git/users/rozeraf/forge/bin/forge.ts init
```
Expected: Wizard runs, `forge.config.ts` created, sync runs.

**Step 3: Commit via commit-agent**

---

## Stage 3: Workflow

### Task 12: AI Commit Helper

**Files:**
- Create: `src/ai/commit.ts`
- Create: `src/ai/commit.test.ts`

**Step 1: Write the failing test**

```typescript
// src/ai/commit.test.ts
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
```

**Step 2: Run test to verify it fails**

```bash
bun test src/ai/commit.test.ts
```
Expected: FAIL — Cannot find module './commit'

**Step 3: Write implementation**

```typescript
// src/ai/commit.ts
const SYSTEM_PROMPT = `You are a commit message generator.
Output only the commit message string, nothing else.
No explanation, no markdown, no quotes.
Follow conventional commits: type(scope): description
Types: feat, fix, chore, refactor, docs, style, test`

export function buildPrompt(diff: string): string {
  return `${SYSTEM_PROMPT}\n\nDiff:\n${diff}`
}

export async function generateCommitMessage(diff: string): Promise<string | null> {
  try {
    const prompt = buildPrompt(diff)
    const result = await Bun.$`claude -p ${prompt}`.text()
    return result.trim()
  } catch {
    return null
  }
}
```

**Step 4: Run test to verify it passes**

```bash
bun test src/ai/commit.test.ts
```
Expected: PASS

**Step 5: Commit via commit-agent**

---

### Task 13: Commit Command

**Files:**
- Create: `src/commands/commit.ts`

**Step 1: Write implementation**

```typescript
// src/commands/commit.ts
import * as p from "@clack/prompts"
import { generateCommitMessage } from "../ai/commit"

export async function run(args: string[]): Promise<void> {
  const all    = args.includes("--all")
  const manual = args.includes("--manual")

  p.intro("forge commit")

  if (all) {
    await Bun.$`git add -A`.quiet()
    p.log.info("Staged all changes")
  }

  const staged = await Bun.$`git diff --staged --name-only`.text()
  if (!staged.trim()) {
    p.log.warn("No staged changes. Use --all to stage everything.")
    process.exit(0)
  }

  let message: string | undefined

  if (!manual) {
    const s = p.spinner()
    s.start("Generating commit message")
    const diff = await Bun.$`git diff --staged`.text()
    const generated = await generateCommitMessage(diff)
    s.stop(generated ? "Message generated" : "AI unavailable — falling back to manual input")

    if (generated) {
      const choice = await p.select({
        message: `"${generated}"`,
        options: [
          { value: "accept", label: "Accept" },
          { value: "edit", label: "Edit" },
          { value: "regenerate", label: "Regenerate" },
          { value: "manual", label: "Enter manually" },
        ],
      })
      if (p.isCancel(choice)) { p.cancel("Cancelled"); process.exit(0) }

      if (choice === "accept") {
        message = generated
      } else if (choice === "edit") {
        const edited = await p.text({ message: "Edit message", defaultValue: generated })
        if (p.isCancel(edited)) { p.cancel("Cancelled"); process.exit(0) }
        message = edited
      } else if (choice === "regenerate") {
        const s2 = p.spinner()
        s2.start("Regenerating")
        const diff2 = await Bun.$`git diff --staged`.text()
        message = (await generateCommitMessage(diff2)) ?? undefined
        s2.stop(message ? "Done" : "Failed")
      }
    }
  }

  if (!message) {
    const input = await p.text({
      message: "Commit message",
      placeholder: "feat: add something",
      validate: v => (v ? undefined : "Message required"),
    })
    if (p.isCancel(input)) { p.cancel("Cancelled"); process.exit(0) }
    message = input
  }

  await Bun.$`git commit -m ${message}`
  p.outro("Committed!")
}
```

**Step 2: Smoke test**

```bash
# In a test git repo with staged changes:
echo "test" > test.txt && git add test.txt
bun /home/raf/git/users/rozeraf/forge/bin/forge.ts commit --manual
```
Expected: Prompts for message, commits.

**Step 3: Commit via commit-agent**

---

### Task 14: Release Command

**Files:**
- Create: `src/commands/release.ts`

**Step 1: Write implementation**

```typescript
// src/commands/release.ts
import * as p from "@clack/prompts"
import { loadConfig } from "../config/load"

export async function run(args: string[]): Promise<void> {
  const noPR = args.includes("--no-pr")

  p.intro("forge release")

  const config = await loadConfig()

  const branch = (await Bun.$`git rev-parse --abbrev-ref HEAD`.text()).trim()
  if (branch !== "dev") {
    p.log.error(`Must be on 'dev' branch (currently '${branch}')`)
    process.exit(1)
  }

  const s = p.spinner()

  if (config.ci.lint)      { s.start("Lint");      await Bun.$`bun run lint`;      s.stop("Lint passed") }
  if (config.ci.typecheck) { s.start("Typecheck"); await Bun.$`bun run typecheck`; s.stop("Typecheck passed") }
  if (config.ci.test)      { s.start("Tests");     await Bun.$`bun test`;          s.stop("Tests passed") }
  if (config.ci.build)     { s.start("Build");     await Bun.$`bun run build`;     s.stop("Build passed") }

  s.start("Pushing dev")
  await Bun.$`git push origin dev`
  s.stop("Pushed")

  if (noPR) {
    s.start("Merging dev → main")
    await Bun.$`git checkout main`
    await Bun.$`git merge dev --squash`
    await Bun.$`git push origin main`
    await Bun.$`git checkout dev`
    s.stop("Merged")
  } else {
    s.start("Creating PR/MR")
    if (config.provider === "github") {
      await Bun.$`gh pr create --base main --head dev --fill`
    } else {
      await Bun.$`glab mr create --source-branch dev --target-branch main --fill`
    }
    s.stop("PR/MR created")
  }

  p.outro("Release complete!")
}
```

**Step 2: Commit via commit-agent**

---

## Stage 4: Expansion

### Task 15: Feature Command

**Files:**
- Create: `src/commands/feature.ts`

**Step 1: Write implementation**

```typescript
// src/commands/feature.ts
import * as p from "@clack/prompts"
import { loadConfig } from "../config/load"

export async function run(args: string[]): Promise<void> {
  const [subcommand, name] = args

  const config = await loadConfig()

  if (config.workflow !== "dev-main-features") {
    console.error("forge feature requires workflow: 'dev-main-features' in forge.config.ts")
    process.exit(1)
  }

  if (!subcommand || (subcommand !== "start" && subcommand !== "finish")) {
    console.error("Usage: forge feature <start|finish> <name>")
    process.exit(1)
  }

  if (!name) {
    console.error("Usage: forge feature <start|finish> <name>")
    process.exit(1)
  }

  if (subcommand === "start") {
    await start(name)
  } else {
    await finish(name, config.provider)
  }
}

async function start(name: string): Promise<void> {
  p.intro(`forge feature start ${name}`)
  const s = p.spinner()

  s.start("Updating dev")
  await Bun.$`git checkout dev`
  await Bun.$`git pull`
  s.stop("dev up to date")

  s.start(`Creating feature/${name}`)
  await Bun.$`git checkout -b feature/${name}`
  await Bun.$`git push -u origin feature/${name}`
  s.stop(`Branch feature/${name} ready`)

  p.outro(`Working on feature/${name}`)
}

async function finish(name: string, provider: string): Promise<void> {
  p.intro(`forge feature finish ${name}`)
  const s = p.spinner()

  s.start("Pushing feature branch")
  await Bun.$`git push origin feature/${name}`
  s.stop("Pushed")

  s.start("Creating PR/MR → dev")
  if (provider === "github") {
    await Bun.$`gh pr create --base dev --head feature/${name} --fill`
  } else {
    await Bun.$`glab mr create --source-branch feature/${name} --target-branch dev --fill`
  }
  s.stop("PR/MR created")

  p.outro(`PR/MR created for feature/${name} → dev`)
}
```

**Step 2: Commit via commit-agent**

---

### Task 16: Self-Dogfooding

**Files:**
- Create: `forge.config.ts`

**Step 1: Write forge.config.ts for this project**

```typescript
// forge.config.ts
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
```

**Step 2: Run sync**

```bash
bun bin/forge.ts sync
```
Expected: Writes `.github/workflows/ci.yml` (node-bun.yml rendered), `lefthook.yml`, `.gitignore`.

**Step 3: Commit via commit-agent**

---

## Full Test Suite

Run at any time:

```bash
bun test
```

Tests that exist:
- `src/config/schema.test.ts`
- `src/config/load.test.ts`
- `src/config/validate.test.ts`
- `src/templates/engine.test.ts`
- `src/templates/resolver.test.ts`
- `src/ai/commit.test.ts`

Expected: all PASS.
