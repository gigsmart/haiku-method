// H·AI·K·U Browse — path-based URL builder and parser
//
// URL pattern: /browse/{host}/{...project}/[intent/{slug}/[stage/{stage}/[{unit}/]]]
// Special views: /browse/{host}/{...project}/board/
// Branch param: ?branch=feature

export interface BrowseLocation {
  host: string
  project: string        // "org/repo" or "org/group/subgroup/project"
  intent?: string
  stage?: string
  unit?: string
  view?: "board"
  branch?: string
}

/** Reserved path keywords that delimit the end of the project path */
const RESERVED_KEYWORDS = new Set(["intent", "board"])

/**
 * Build a path-based browse URL from a BrowseLocation.
 *
 * Examples:
 *   buildBrowseUrl({ host: "github.com", project: "org/repo" })
 *   → "/browse/github.com/org/repo/"
 *
 *   buildBrowseUrl({ host: "github.com", project: "org/repo", view: "board" })
 *   → "/browse/github.com/org/repo/board/"
 *
 *   buildBrowseUrl({ host: "github.com", project: "org/repo", intent: "add-login" })
 *   → "/browse/github.com/org/repo/intent/add-login/"
 *
 *   buildBrowseUrl({ host: "github.com", project: "org/repo", intent: "add-login", stage: "dev", unit: "unit-01" })
 *   → "/browse/github.com/org/repo/intent/add-login/stage/dev/unit-01/"
 */
export function buildBrowseUrl(loc: BrowseLocation): string {
  const base = `/browse/${loc.host}/${loc.project}`

  let path: string
  if (loc.intent) {
    path = `${base}/intent/${loc.intent}/`
    if (loc.stage) {
      path = `${base}/intent/${loc.intent}/stage/${loc.stage}/`
      if (loc.unit) {
        path = `${base}/intent/${loc.intent}/stage/${loc.stage}/${loc.unit}/`
      }
    }
  } else if (loc.view === "board") {
    path = `${base}/board/`
  } else {
    path = `${base}/`
  }

  if (loc.branch) {
    path += `?branch=${encodeURIComponent(loc.branch)}`
  }

  return path
}

/**
 * Parse a catch-all path segment array into a BrowseLocation.
 *
 * The segments come from Next.js [...path] parameter. The first segment is always
 * the host, then the parser scans for a reserved keyword ("intent" or "board") to
 * determine where the project path ends.
 *
 * Examples:
 *   ["github.com", "org", "repo"]
 *   → { host: "github.com", project: "org/repo" }
 *
 *   ["github.com", "org", "repo", "board"]
 *   → { host: "github.com", project: "org/repo", view: "board" }
 *
 *   ["github.com", "org", "repo", "intent", "add-login"]
 *   → { host: "github.com", project: "org/repo", intent: "add-login" }
 *
 *   ["github.com", "org", "repo", "intent", "add-login", "stage", "dev", "unit-01"]
 *   → { host: "github.com", project: "org/repo", intent: "add-login", stage: "dev", unit: "unit-01" }
 *
 *   ["gitlab.com", "org", "group", "subgroup", "project", "intent", "my-intent"]
 *   → { host: "gitlab.com", project: "org/group/subgroup/project", intent: "my-intent" }
 */
export function parseBrowsePath(segments: string[]): BrowseLocation | null {
  if (segments.length < 3) return null

  const host = segments[0]

  // Scan for reserved keyword to find boundary between project path and action
  let keywordIndex = -1
  for (let i = 1; i < segments.length; i++) {
    if (RESERVED_KEYWORDS.has(segments[i])) {
      keywordIndex = i
      break
    }
  }

  let project: string
  const loc: BrowseLocation = { host, project: "" }

  if (keywordIndex === -1) {
    // No keyword found — everything after host is the project path (list view)
    project = segments.slice(1).join("/")
    loc.project = project
    return loc
  }

  // Everything between host and keyword is the project path
  project = segments.slice(1, keywordIndex).join("/")
  if (!project) return null
  loc.project = project

  const keyword = segments[keywordIndex]

  if (keyword === "board") {
    loc.view = "board"
    return loc
  }

  if (keyword === "intent") {
    const remaining = segments.slice(keywordIndex + 1)
    if (remaining.length >= 1) loc.intent = remaining[0]
    // Parse stage: either "stage/{name}" keyword format or legacy "{name}" positional format
    if (remaining.length >= 3 && remaining[1] === "stage") {
      // New format: intent/{slug}/stage/{stage}[/{unit}]
      loc.stage = remaining[2]
      if (remaining.length >= 4) loc.unit = remaining[3]
    } else if (remaining.length >= 2 && remaining[1] !== "stage") {
      // Legacy format: intent/{slug}/{stage}[/{unit}]
      loc.stage = remaining[1]
      if (remaining.length >= 3) loc.unit = remaining[2]
    }
    return loc
  }

  return loc
}
