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
