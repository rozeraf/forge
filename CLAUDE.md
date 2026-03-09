# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun test                        # run all tests
bun test src/config/load.test.ts  # run a single test file
bun run bin/forge.ts <command>  # run CLI during development
```

## Runtime conventions

- Use `bun <file>` not `node` or `ts-node`
- Use `Bun.file` not `node:fs` readFile/writeFile
- Use `Bun.$\`cmd\`` not `execa`
- Use `bun:sqlite`, `Bun.redis`, `Bun.sql` — not third-party DB drivers
- Bun auto-loads `.env`; don't use dotenv

## Architecture

`forge` is a CLI tool that generates CI configs, git hooks, and gitignore files from a single `forge.config.ts` source of truth.

**Data flow:**
```
forge.config.ts
  → loadConfig() + validateConfig()
  → resolveTemplate(config)  →  templates/ci/{provider}/{type}-{deploy}-{runtime}.yml
  → render(template, vars)   →  .github/workflows/ci.yml  or  .gitlab-ci.yml
```

**Source layout:**
- `bin/forge.ts` — entry point; dispatches to `src/commands/*` via a plain object lookup
- `src/config/schema.ts` — all types (`ForgeConfig`, `ProjectType`, `Provider`, etc.) + `defineConfig` identity helper
- `src/config/load.ts` — `findConfigPath` (walks up via `dirname` loop) + `loadConfig` (dynamic import)
- `src/config/validate.ts` — throws on invalid combos (empty name, vite without vite field, custom deploy without customScript)
- `src/templates/resolver.ts` — maps a `ForgeConfig` to `{ path, vars }` where `path` is the template file and `vars` fills its placeholders
- `src/templates/engine.ts` — `render(template, vars)`: replaces `{{PLACEHOLDER}}` with values; unknowns → empty string
- `src/providers/github.ts` / `gitlab.ts` — thin wrappers around `gh` / `glab` CLI for secrets, PRs, MRs
- `src/commands/` — one file per CLI command (`init`, `sync`, `commit`, `release`, `feature`)
- `src/ai/commit.ts` — `buildPrompt` + `generateCommitMessage` (shells out to `claude -p`)

**Templates:**
- `templates/ci/{github,gitlab}/{type}-{deploy}-{runtime}.yml` — 20 static YAML files with `{{PLACEHOLDER}}` syntax
- `templates/hooks/husky/` — pre-commit and commit-msg shell templates
- `templates/gitignore/{node,vite,nextjs}` — static gitignore content
- Template filename convention: `{type}[-{deploy}][-bun].yml` — e.g. `vite-vercel-bun.yml`, `node.yml`

**`{{PLACEHOLDER}}` vs `${{ secrets.X }}`:** The engine regex `\{\{(\w+)\}\}` only matches word-only keys (no dots), so GitHub Actions expressions like `${{ secrets.TOKEN }}` pass through untouched.

**`forge sync` idempotency:** Running sync multiple times is safe — all outputs (CI yaml, lefthook.yml, .gitignore) are overwritten. External tools (lefthook, husky) fail gracefully with a warning if not installed.

**Command arg passing:** `init` and `sync` take no args. `commit`, `release`, and `feature` receive the raw `args` array from `bin/forge.ts` and parse flags themselves (e.g. `--all`, `--manual`, `--no-pr`).
