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
