import type { ForgeConfig } from "../config/schema"

export function resolveTemplate(config: ForgeConfig): { path: string; vars: Record<string, string> } {
  const suffix = config.runtime === "bun" ? "-bun" : ""
  const target = config.ci.deploy?.target
  const deployPart = target ? `-${target}` : ""
  const filename = `${config.type}${deployPart}${suffix}.yml`
  const dir = `templates/ci/${config.provider}`

  const vars: Record<string, string> = {
    PROJECT_NAME:  config.name,
    INSTALL_CMD:   config.runtime === "bun" ? "bun install --frozen-lockfile" : "npm ci",
    RUN_CMD:       config.runtime === "bun" ? "bun run" : "npm run",
    BUILD_CMD:     config.runtime === "bun" ? "bun run build" : "npm run build",
    BUILD_OUTPUT:  config.type === "nextjs" ? ".next/" : "dist/", // static/custom also get dist/
    DEPLOY_BRANCH: config.ci.deploy?.onBranch ?? "main",
    NODE_VERSION:  "20",
  }

  return { path: `${dir}/${filename}`, vars }
}
