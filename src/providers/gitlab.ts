export const gitlab = {
  setSecret: (name: string, value: string) =>
    Bun.$`glab variable set ${name} --value ${value}`,
  createMR: (source: string, target: string) =>
    Bun.$`glab mr create --source-branch ${source} --target-branch ${target} --fill`,
  mergeMR: () =>
    Bun.$`glab mr merge --squash --remove-source-branch`,
}
