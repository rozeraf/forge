import type { ForgeConfig } from "./schema"

export function validateConfig(config: ForgeConfig): void {
  if (!config.name?.trim()) {
    throw new Error("forge.config.ts: 'name' is required")
  }
  if (config.type === "vite" && !config.vite) {
    throw new Error("forge.config.ts: 'vite' config required when type is 'vite'")
  }
  if (config.ci.deploy?.target === "custom" && !config.ci.deploy.customScript) {
    throw new Error("forge.config.ts: 'customScript' required when deploy target is 'custom'")
  }
}
