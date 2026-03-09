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
        message = edited as string
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
    message = input as string
  }

  await Bun.$`git commit -m ${message}`
  p.outro("Committed!")
}
