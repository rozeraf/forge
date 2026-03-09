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
    await Bun.$`git branch dev`.quiet().catch(() => {
      // Repo may have no commits yet; skip silently
    })
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
    await Bun.$`lefthook install`.quiet().catch(() => {
      p.log.warn("lefthook not found — skipping hook install (run `lefthook install` manually)")
    })
  } else {
    await Bun.$`bunx husky init`.quiet()
  }
}
