# forge

Git workflow automation driven by a single `forge.config.ts`. Generates CI pipelines, git hooks, and gitignore — then gives you commands for daily development flow.

## What it does

Put a `forge.config.ts` in your project root. Run `forge sync`. Everything is generated from that config:

- `.github/workflows/ci.yml` or `.gitlab-ci.yml`
- `lefthook.yml` or `.husky/` hooks
- `.gitignore`

Then use the workflow commands to commit, release, and manage features without remembering branch names or provider-specific CLI flags.

## Install

```bash
bun install -g forge
```

Requires [Bun](https://bun.sh). For GitHub projects: [gh CLI](https://cli.github.com). For GitLab: [glab CLI](https://gitlab.com/gitlab-org/cli).

## Setup

```bash
# Interactive wizard — creates forge.config.ts then runs sync
forge init

# Or write forge.config.ts manually, then:
forge sync
```

### forge.config.ts

```typescript
import { defineConfig } from "forge"

export default defineConfig({
  name: "my-app",
  type: "vite",           // nextjs | vite | node | static | custom
  runtime: "bun",         // bun | node
  provider: "github",     // github | gitlab
  workflow: "dev-main",   // dev-main | dev-main-features

  vite: { template: "react-ts" },  // required when type: "vite"

  ci: {
    lint: true,
    typecheck: true,
    test: true,
    build: true,
    deploy: {
      target: "vercel",   // vercel | cloudflare | custom
      onBranch: "main",
      env: ["VERCEL_TOKEN"],
    },
  },

  hooks: {
    tool: "lefthook",     // lefthook | husky
    preCommit: ["bun run lint", "bun run typecheck"],
    commitMsg: "conventional",  // conventional | none
  },
})
```

## Commands

### `forge sync`

Regenerates all project files from `forge.config.ts`. Idempotent — safe to run any time the config changes.

```bash
forge sync
```

Writes: CI config, hooks config, `.gitignore`. Creates `dev` branch if missing. Prompts for any secrets listed in `ci.deploy.env` that aren't already set in the environment.

### `forge commit`

AI-assisted commit using `claude` CLI to generate a conventional commit message from the staged diff.

```bash
forge commit           # generate message, then accept / edit / regenerate
forge commit --all     # stage everything first
forge commit --manual  # skip AI, go straight to manual input
```

### `forge release`

Runs CI checks locally, pushes `dev`, and opens a PR/MR to `main`.

```bash
forge release          # push dev + open PR/MR → main
forge release --no-pr  # squash-merge dev directly into main
```

Must be on the `dev` branch.

### `forge feature`

Manages feature branches. Requires `workflow: "dev-main-features"` in config.

```bash
forge feature start <name>   # checkout dev, pull, create feature/<name>, push
forge feature finish <name>  # push feature/<name>, open PR/MR → dev
```

## Supported CI templates

| Type | Deploy | Runtimes |
|------|--------|----------|
| node | — | node, bun |
| vite | vercel, cloudflare | node, bun |
| nextjs | vercel, cloudflare | node, bun |
| static, custom | — | (uses node template) |

GitLab and GitHub variants exist for all combinations.
