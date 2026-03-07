/**
 * Replaces {{PLACEHOLDER}} patterns in `template` with values from `vars`.
 * Unknown placeholders are replaced with an empty string.
 */
export function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "")
}
