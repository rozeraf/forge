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
