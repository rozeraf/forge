export const github = {
  setSecret: (name: string, value: string) =>
    Bun.$`gh secret set ${name} --body ${value}`,
  createPR: (base: string, head: string) =>
    Bun.$`gh pr create --base ${base} --head ${head} --fill`,
  mergePR: () =>
    Bun.$`gh pr merge --squash --delete-branch`,
}
