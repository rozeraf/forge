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
    viteTemplate = t as string
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
    deployBranch = branch as string

    if (deployTarget === "custom") {
      const script = await p.text({ message: "Custom deploy script", placeholder: "./deploy.sh" })
      if (p.isCancel(script)) { p.cancel("Cancelled"); process.exit(0) }
      customScript = script as string
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
    name: name as string,
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
