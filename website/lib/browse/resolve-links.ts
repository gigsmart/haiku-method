// H·AI·K·U Browse — provider URL resolution for frontmatter fields
//
// Resolves fields like ticket:, epic:, design_ref:, spec_url: into clickable
// links when provider configuration exists in .haiku/settings.yml.

export interface ProviderLink {
  /** Frontmatter field name (e.g. "ticket", "epic", "design_ref") */
  field: string
  /** Raw value from frontmatter */
  value: string
  /** Resolved URL, or null if no provider config exists */
  url: string | null
  /** Provider type (e.g. "jira", "linear") or "" if unknown */
  provider: string
}

/** URL templates for each provider type — mirrors the schema defaults */
const PROVIDER_URL_TEMPLATES: Record<string, string> = {
  jira: "https://{cloud_id}/browse/{key}",
  linear: "https://linear.app/{team_id}/issue/{key}",
  "github-issues": "https://github.com/{owner}/{repo}/issues/{number}",
  "gitlab-issues": "https://{host}/{project}/-/issues/{number}",
  figma: "https://figma.com/file/{key}",
  notion: "https://notion.so/{key}",
  confluence: "https://{cloud_id}/wiki/spaces/{space_key}/pages/{key}",
  "google-docs": "https://docs.google.com/document/d/{key}",
  penpot: "https://design.penpot.app/#/view/{key}",
  canva: "https://canva.com/design/{key}",
}

/**
 * Mapping from frontmatter field names to the settings provider category
 * that should be used for URL resolution.
 */
const FIELD_TO_CATEGORY: Record<string, string> = {
  ticket: "ticketing",
  epic: "ticketing",
  design_ref: "design",
  spec_url: "spec",
}

/** Fields to check in frontmatter for provider links */
const LINK_FIELDS = ["ticket", "epic", "design_ref", "spec_url", "branch"]

interface ProviderConfig {
  type: string
  config?: Record<string, unknown>
}

interface HaikuSettings {
  providers?: Record<string, ProviderConfig>
  [key: string]: unknown
}

/**
 * Interpolate a URL template with variables from provider config and a key value.
 * Template variables use {name} syntax.
 */
function interpolateTemplate(
  template: string,
  config: Record<string, unknown>,
  key: string,
): string {
  return template.replace(/\{(\w+)\}/g, (match, varName) => {
    if (varName === "key" || varName === "number") return key
    const val = config[varName]
    if (typeof val === "string") return val
    return match // leave unresolved variables as-is
  })
}

/**
 * Build a branch URL for GitHub or GitLab repos.
 */
function resolveBranchUrl(
  branchName: string,
  settings: HaikuSettings | null,
): string | null {
  // Try to infer the repo host from ticketing provider config
  const ticketing = settings?.providers?.ticketing
  if (!ticketing) return null

  if (ticketing.type === "github-issues") {
    const config = (ticketing.config || {}) as Record<string, unknown>
    const owner = config.owner as string | undefined
    const repo = config.repo as string | undefined
    if (owner && repo) {
      return `https://github.com/${owner}/${repo}/tree/${encodeURIComponent(branchName)}`
    }
  }

  if (ticketing.type === "gitlab-issues") {
    const config = (ticketing.config || {}) as Record<string, unknown>
    const host = (config.host as string) || "gitlab.com"
    const project = config.project_id as string | undefined
    if (project) {
      return `https://${host}/${project}/-/tree/${encodeURIComponent(branchName)}`
    }
  }

  return null
}

/**
 * Resolve frontmatter fields into provider links.
 *
 * Always returns an entry for every field that has a value — URL will be null
 * if no matching provider config is available (field is still shown as plain text).
 */
export function resolveLinks(
  frontmatter: Record<string, unknown>,
  settings: HaikuSettings | null,
): ProviderLink[] {
  const links: ProviderLink[] = []

  for (const field of LINK_FIELDS) {
    const rawValue = frontmatter[field]
    if (rawValue == null || rawValue === "" || rawValue === false) continue
    const value = String(rawValue)

    // Branch field uses a special resolution path
    if (field === "branch") {
      links.push({
        field,
        value,
        url: resolveBranchUrl(value, settings),
        provider: "",
      })
      continue
    }

    // Look up the provider category for this field
    const category = FIELD_TO_CATEGORY[field]
    if (!category) {
      links.push({ field, value, url: null, provider: "" })
      continue
    }

    const providerEntry = settings?.providers?.[category]
    if (!providerEntry) {
      links.push({ field, value, url: null, provider: "" })
      continue
    }

    const providerType = providerEntry.type
    const template =
      ((providerEntry.config?.url_template as string) || null) ??
      PROVIDER_URL_TEMPLATES[providerType]

    if (!template) {
      links.push({ field, value, url: null, provider: providerType })
      continue
    }

    const config = (providerEntry.config || {}) as Record<string, unknown>
    const url = interpolateTemplate(template, config, value)

    // Only emit a URL if all template variables were resolved
    const hasUnresolved = /\{(\w+)\}/.test(url)
    links.push({
      field,
      value,
      url: hasUnresolved ? null : url,
      provider: providerType,
    })
  }

  return links
}

/**
 * Parse a simple YAML settings file into a nested object.
 *
 * Handles the .haiku/settings.yml format which uses indented key-value pairs
 * with at most 3 levels of nesting. This is intentionally simple — it does not
 * handle all YAML features, just the subset used by settings.yml.
 */
export function parseSettingsYaml(raw: string): HaikuSettings {
  const result: Record<string, unknown> = {}
  const stack: Array<{ indent: number; obj: Record<string, unknown> }> = [
    { indent: -1, obj: result },
  ]

  for (const line of raw.split("\n")) {
    // Skip blank lines and comments
    if (/^\s*$/.test(line) || /^\s*#/.test(line)) continue

    const match = line.match(/^(\s*)([\w-]+):\s*(.*)$/)
    if (!match) continue

    const indent = match[1].length
    const key = match[2]
    let val: string | undefined = match[3].trim()

    // Pop stack back to the appropriate parent level
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop()
    }

    const parent = stack[stack.length - 1].obj

    if (val === "" || val === undefined) {
      // This key introduces a nested object
      const child: Record<string, unknown> = {}
      parent[key] = child
      stack.push({ indent, obj: child })
    } else {
      // Inline array: [a, b, c]
      if (val.startsWith("[") && val.endsWith("]")) {
        parent[key] = val
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean)
      } else if (val === "true") {
        parent[key] = true
      } else if (val === "false") {
        parent[key] = false
      } else if (/^\d+$/.test(val)) {
        parent[key] = parseInt(val, 10)
      } else {
        parent[key] = val.replace(/^["']|["']$/g, "")
      }
    }
  }

  return result as HaikuSettings
}
