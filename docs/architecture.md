# Architecture

## Overview

forge has two layers:

- **Setup layer** (`init`, `sync`) — generates project files from config
- **Workflow layer** (`commit`, `release`, `feature`) — daily git operations

Both layers read `forge.config.ts` as their source of truth.

## Source layout

```
bin/forge.ts              entry point — command dispatch table
src/
  config/
    schema.ts             ForgeConfig type + defineConfig identity helper
    load.ts               findConfigPath (walks dirs) + loadConfig (dynamic import)
    validate.ts           throws on invalid config combos
  templates/
    engine.ts             render(template, vars) — replaces {{PLACEHOLDER}}
    resolver.ts           maps ForgeConfig → { path, vars } for template lookup
  providers/
    github.ts             thin wrapper: gh secret set, gh pr create, gh pr merge
    gitlab.ts             thin wrapper: glab variable set, glab mr create
  commands/
    init.ts               interactive wizard → writes forge.config.ts → calls sync
    sync.ts               generates CI yaml, hooks config, .gitignore, secrets
    commit.ts             staged diff → AI message → git commit
    release.ts            local CI checks → push dev → PR/MR to main
    feature.ts            create/finish feature/* branches with PR/MR
  ai/
    commit.ts             buildPrompt + generateCommitMessage (shells to claude -p)
templates/
  ci/
    github/               20 GitHub Actions YAML templates
    gitlab/               20 GitLab CI YAML templates
  hooks/
    husky/                pre-commit and commit-msg shell templates
  gitignore/              node, vite, nextjs static gitignore files
```

## Config → file generation

`forge sync` is the core of the setup layer. Its pipeline:

```
forge.config.ts
  → loadConfig()       dynamic import, walks up dirs to find the file
  → validateConfig()   throws on: empty name, vite without vite field,
                       custom deploy without customScript
  → resolveTemplate()  builds template filename and vars map
  → render()           replaces {{PLACEHOLDER}} in template text
  → Bun.write()        writes to .github/workflows/ci.yml or .gitlab-ci.yml
```

`resolveTemplate` constructs the template filename from config fields:

```
{type}[-{deploy.target}][-bun].yml

Examples:
  node + bun runtime             →  node-bun.yml
  vite + vercel + node runtime   →  vite-vercel.yml
  nextjs + cloudflare + bun      →  nextjs-cloudflare-bun.yml
```

The template file is then read from `templates/ci/{provider}/{filename}`.

## Template placeholder syntax

Templates use `{{PLACEHOLDER}}` (double braces, word characters only). The engine regex `\{\{(\w+)\}\}` deliberately does not match GitHub Actions expressions like `${{ secrets.TOKEN }}` because the dot in `secrets.TOKEN` is not a word character. Unknown placeholders are replaced with an empty string.

Variables injected by `resolveTemplate`:

| Variable | Source |
|----------|--------|
| `PROJECT_NAME` | `config.name` |
| `INSTALL_CMD` | runtime: `bun install --frozen-lockfile` / `npm ci` |
| `RUN_CMD` | runtime: `bun run` / `npm run` |
| `BUILD_CMD` | runtime: `bun run build` / `npm run build` |
| `BUILD_OUTPUT` | type: nextjs → `.next/`, others → `dist/` |
| `DEPLOY_BRANCH` | `config.ci.deploy.onBranch` or `"main"` |
| `NODE_VERSION` | hardcoded `"20"` |

## Hooks generation

Two paths depending on `config.hooks.tool`:

**lefthook** — generates `lefthook.yml` inline (no template file needed):
```yaml
pre-commit:
  commands:
    cmd-1:
      run: <preCommit[0]>
commit-msg:          # only if commitMsg === "conventional"
  commands:
    commitlint:
      run: bunx commitlint --edit {1}
```

**husky** — reads `templates/hooks/husky/pre-commit` and `commit-msg`, renders them with `{{PRE_COMMIT_COMMANDS}}` and `{{COMMIT_MSG_CHECK}}`, writes to `.husky/`.

## Workflow layer

These commands all load and validate config, then drive git and provider CLI tools:

**commit** — `git diff --staged` → `claude -p <prompt>` → present choice (accept/edit/regenerate/manual) → `git commit -m`

**release** — validates `branch === "dev"` → runs enabled CI checks → `git push origin dev` → `gh pr create` / `glab mr create` (or direct squash merge with `--no-pr`)

**feature** — `start`: checkout dev, pull, `git checkout -b feature/<name>`, push; `finish`: push, create PR/MR targeting dev

## Provider abstraction

`src/providers/github.ts` and `gitlab.ts` wrap the respective CLI tools:

```typescript
// github.ts
export const github = {
  setSecret: (name, value) => Bun.$`gh secret set ${name} --body ${value}`,
  createPR:  (base, head)  => Bun.$`gh pr create --base ${base} --head ${head} --fill`,
  mergePR:   ()            => Bun.$`gh pr merge --squash --delete-branch`,
}
```

Commands call the provider by name from `config.provider` rather than importing both.

## Key constraints

- No build step — TypeScript runs directly via Bun
- No test for commands that shell out (sync, commit, release, feature) — tested via manual smoke tests
- Tested modules: config schema, loader, validator, template engine, template resolver, AI prompt builder
