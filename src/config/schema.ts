export type ProjectType = "nextjs" | "vite" | "node" | "static" | "custom"
export type Provider = "github" | "gitlab"
export type Runtime = "bun" | "node"
export type Workflow = "dev-main" | "dev-main-features"
export type DeployTarget = "vercel" | "cloudflare" | "custom"
export type HookTool = "lefthook" | "husky"

export interface CIStep {
  name: string
  run: string
}

export interface DeployConfig {
  target: DeployTarget
  onBranch: string
  customScript?: string
  env: string[]
}

export interface CIConfig {
  lint: boolean
  typecheck: boolean
  test: boolean
  build: boolean
  extra?: CIStep[]
  deploy?: DeployConfig
}

export interface HooksConfig {
  tool: HookTool
  preCommit: string[]
  commitMsg: "conventional" | "none"
}

export interface ViteScaffold {
  template: "react-ts" | "react" | "vanilla-ts" | "vanilla"
}

export interface ForgeConfig {
  name: string
  type: ProjectType
  runtime: Runtime
  provider: Provider
  workflow: Workflow
  vite?: ViteScaffold
  ci: CIConfig
  hooks: HooksConfig
}

export function defineConfig(config: ForgeConfig): ForgeConfig {
  return config
}
