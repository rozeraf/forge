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
