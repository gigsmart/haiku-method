/**
 * AI-DLC Configuration System
 *
 * Provides configuration loading with precedence:
 * 1. Intent frontmatter (highest priority)
 * 2. Repo settings (.ai-dlc/settings.yml)
 * 3. Built-in defaults (lowest priority)
 */

import { execSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"

/**
 * Change strategy determines how git branches are organized
 */
export type ChangeStrategy = "trunk" | "unit" | "intent"

/**
 * VCS configuration for git or jj
 */
export interface VcsConfig {
	/** How changes are organized: trunk, unit, or intent */
	change_strategy: ChangeStrategy
	/** Whether to create PR for elaborated intent review before planning */
	elaboration_review: boolean
	/** Default/main branch name. 'auto' means detect from remote */
	default_branch: string
	/** Whether to automatically merge completed unit branches */
	auto_merge?: boolean
	/** Whether to squash commits when merging */
	auto_squash?: boolean
}

// ============================================================================
// Provider Configuration
// ============================================================================

export type SpecProviderType = "notion" | "confluence" | "google-docs"
export type TicketingProviderType =
	| "jira"
	| "linear"
	| "github-issues"
	| "gitlab-issues"
export type DesignProviderType = "figma"
export type CommsProviderType = "slack" | "teams" | "discord"
export type VcsHostingType = "github" | "gitlab" | "bitbucket"
export type CiCdType = "github-actions" | "gitlab-ci" | "jenkins" | "circleci"

export interface ProviderEntry<T extends string> {
	type: T
	config?: Record<string, unknown>
	instructions?: string
}

export interface ResolvedProvider<T extends string> extends ProviderEntry<T> {
	mergedInstructions: string
	mcpHint: string
}

export interface ProvidersConfig {
	spec?: ProviderEntry<SpecProviderType> | null
	ticketing?: ProviderEntry<TicketingProviderType> | null
	design?: ProviderEntry<DesignProviderType> | null
	comms?: ProviderEntry<CommsProviderType> | null
	vcsHosting?: VcsHostingType | null
	ciCd?: CiCdType | null
}

export interface QualityGateEntry {
	/** Shell command to execute for this quality gate */
	command: string
	/** Whether this gate is active (default: true) */
	enabled?: boolean
}

export interface QualityGatesConfig {
	test?: QualityGateEntry
	lint?: QualityGateEntry
	typecheck?: QualityGateEntry
	build?: QualityGateEntry
	[key: string]: QualityGateEntry | undefined
}

export interface AiDlcSettings {
	git?: Partial<VcsConfig>
	jj?: Partial<VcsConfig>
	providers?: {
		spec?: ProviderEntry<SpecProviderType>
		ticketing?: ProviderEntry<TicketingProviderType>
		design?: ProviderEntry<DesignProviderType>
		comms?: ProviderEntry<CommsProviderType>
	}
	/** Quality gates (backpressure checks) to run during execution */
	quality_gates?: QualityGatesConfig
}

/**
 * Intent frontmatter with optional VCS overrides
 */
export interface IntentFrontmatter {
	workflow?: string
	created?: string
	status?: string
	completed?: string
	git?: Partial<VcsConfig>
	jj?: Partial<VcsConfig>
}

/**
 * Default VCS configuration values
 */
export const DEFAULT_VCS_CONFIG: VcsConfig = {
	change_strategy: "unit",
	elaboration_review: true,
	default_branch: "auto",
}

/**
 * Detect which VCS is being used in the given directory
 * @param directory - Directory to check (defaults to cwd)
 * @returns 'git' | 'jj' | null
 */
export function detectVcs(directory?: string): "git" | "jj" | null {
	const cwd = directory || process.cwd()

	try {
		// Check for jj first (it can coexist with git)
		execSync("jj root", { cwd, stdio: "pipe" })
		return "jj"
	} catch {
		// Not a jj repo
	}

	try {
		execSync("git rev-parse --git-dir", { cwd, stdio: "pipe" })
		return "git"
	} catch {
		// Not a git repo
	}

	return null
}

/**
 * Find the repo root directory
 * @param directory - Starting directory (defaults to cwd)
 * @returns Repo root path or null
 */
export function findRepoRoot(directory?: string): string | null {
	const cwd = directory || process.cwd()
	const vcs = detectVcs(cwd)

	if (!vcs) return null

	try {
		if (vcs === "jj") {
			return execSync("jj root", { cwd, stdio: "pipe" }).toString().trim()
		}
		return execSync("git rev-parse --show-toplevel", { cwd, stdio: "pipe" })
			.toString()
			.trim()
	} catch {
		return null
	}
}

/**
 * Parse YAML content using han parse yaml
 * @param content - YAML content string
 * @returns Parsed object or null
 */
function parseYaml(content: string): Record<string, unknown> | null {
	try {
		// Use han parse yaml for consistency with shell scripts
		const result = execSync("han parse yaml --json", {
			input: content,
			stdio: ["pipe", "pipe", "pipe"],
		})
		return JSON.parse(result.toString())
	} catch {
		// Fallback: try to parse as JSON (for simple cases)
		try {
			return JSON.parse(content)
		} catch {
			return null
		}
	}
}

/**
 * Load repo-level settings from .ai-dlc/settings.yml
 * @param repoRoot - Repository root directory
 * @returns Settings object or null if not found
 */
export function loadRepoSettings(repoRoot?: string): AiDlcSettings | null {
	const root = repoRoot || findRepoRoot()
	if (!root) return null

	const settingsPath = join(root, ".ai-dlc", "settings.yml")
	if (!existsSync(settingsPath)) return null

	try {
		const content = readFileSync(settingsPath, "utf-8")
		const parsed = parseYaml(content)
		if (!parsed) return null

		return parsed as AiDlcSettings
	} catch {
		return null
	}
}

/**
 * Load intent-level overrides from intent.md frontmatter
 * @param intentDir - Directory containing intent.md
 * @returns Partial settings from frontmatter or null
 */
export function loadIntentOverrides(
	intentDir: string,
): Pick<AiDlcSettings, "git" | "jj"> | null {
	const intentPath = join(intentDir, "intent.md")
	if (!existsSync(intentPath)) return null

	try {
		const content = readFileSync(intentPath, "utf-8")

		// Extract frontmatter between --- markers
		const match = content.match(/^---\n([\s\S]*?)\n---/)
		if (!match) return null

		const frontmatter = parseYaml(match[1])
		if (!frontmatter) return null

		const result: Pick<AiDlcSettings, "git" | "jj"> = {}

		if (frontmatter.git && typeof frontmatter.git === "object") {
			result.git = frontmatter.git as Partial<VcsConfig>
		}
		if (frontmatter.jj && typeof frontmatter.jj === "object") {
			result.jj = frontmatter.jj as Partial<VcsConfig>
		}

		return Object.keys(result).length > 0 ? result : null
	} catch {
		return null
	}
}

/**
 * Resolve the default branch name
 * If 'auto', detect from origin/HEAD or fall back to 'main'
 * @param configValue - The configured value ('auto' or explicit name)
 * @param directory - Directory to run git commands in
 * @returns Resolved branch name
 */
export function resolveDefaultBranch(
	configValue: string,
	directory?: string,
): string {
	if (configValue !== "auto") {
		return configValue
	}

	const cwd = directory || process.cwd()

	try {
		// Try to get the default branch from origin/HEAD
		const result = execSync("git symbolic-ref refs/remotes/origin/HEAD", {
			cwd,
			stdio: "pipe",
		})
			.toString()
			.trim()

		// Result looks like: refs/remotes/origin/main
		const parts = result.split("/")
		return parts[parts.length - 1]
	} catch {
		// Fallback: check if main or master exists
		try {
			execSync("git rev-parse --verify main", { cwd, stdio: "pipe" })
			return "main"
		} catch {
			try {
				execSync("git rev-parse --verify master", { cwd, stdio: "pipe" })
				return "master"
			} catch {
				// Ultimate fallback
				return "main"
			}
		}
	}
}

/**
 * Get merged VCS settings with precedence: intent → repo → defaults
 * @param options - Optional parameters
 * @returns Complete VcsConfig for the detected VCS
 */
export function getMergedSettings(options?: {
	intentDir?: string
	repoRoot?: string
	vcs?: "git" | "jj"
}): VcsConfig {
	const repoRoot = options?.repoRoot || findRepoRoot()
	const vcs = options?.vcs || detectVcs() || "git"

	// Start with defaults
	const merged: VcsConfig = { ...DEFAULT_VCS_CONFIG }

	// Layer 1: Repo settings
	if (repoRoot) {
		const repoSettings = loadRepoSettings(repoRoot)
		if (repoSettings?.[vcs]) {
			Object.assign(merged, repoSettings[vcs])
		}
	}

	// Layer 2: Intent overrides (highest priority)
	if (options?.intentDir) {
		const intentOverrides = loadIntentOverrides(options.intentDir)
		if (intentOverrides?.[vcs]) {
			Object.assign(merged, intentOverrides[vcs])
		}
	}

	// Resolve 'auto' default_branch to actual value
	if (merged.default_branch === "auto") {
		merged.default_branch = resolveDefaultBranch("auto", repoRoot || undefined)
	}

	return merged
}

/**
 * Get VCS config as environment variables (for shell scripts)
 * @param config - VcsConfig to export
 * @returns Object with AI_DLC_* environment variable names
 */
export function configToEnvVars(config: VcsConfig): Record<string, string> {
	return {
		AI_DLC_CHANGE_STRATEGY: config.change_strategy,
		AI_DLC_ELABORATION_REVIEW: config.elaboration_review ? "true" : "false",
		AI_DLC_DEFAULT_BRANCH: config.default_branch,
		AI_DLC_AUTO_MERGE: config.auto_merge ? "true" : "false",
		AI_DLC_AUTO_SQUASH: config.auto_squash ? "true" : "false",
	}
}

// ============================================================================
// Provider Detection & Loading
// ============================================================================

/** MCP tool hint mapping for provider types */
const PROVIDER_MCP_HINTS: Record<string, string> = {
	notion: "mcp__*notion*",
	confluence: "mcp__*confluence*",
	"google-docs": "mcp__*google*docs*",
	jira: "mcp__*jira*",
	linear: "mcp__*linear*",
	"github-issues": "gh issue",
	"gitlab-issues": "mcp__*gitlab*",
	figma: "mcp__*figma*",
	slack: "mcp__*slack*",
	teams: "mcp__*teams*",
	discord: "mcp__*discord*",
	github: "gh",
	gitlab: "mcp__*gitlab*",
	bitbucket: "mcp__*bitbucket*",
	"github-actions": "gh run",
	"gitlab-ci": "mcp__*gitlab*",
	jenkins: "mcp__*jenkins*",
	circleci: "mcp__*circleci*",
}

/**
 * Get MCP tool hint for a provider type
 */
export function getProviderMcpHint(providerType: string): string {
	return PROVIDER_MCP_HINTS[providerType] || ""
}

/**
 * Detect VCS hosting platform from git remote
 * @param directory - Directory to check (defaults to cwd)
 * @returns Platform identifier or null
 */
export function detectVcsHosting(directory?: string): VcsHostingType | null {
	const cwd = directory || process.cwd()

	try {
		const remoteUrl = execSync("git remote get-url origin", {
			cwd,
			stdio: "pipe",
		})
			.toString()
			.trim()

		if (remoteUrl.includes("github.com")) return "github"
		if (remoteUrl.includes("gitlab.com")) return "gitlab"
		if (remoteUrl.includes("bitbucket.org")) return "bitbucket"
	} catch {
		// No remote configured
	}

	return null
}

/**
 * Detect CI/CD system from repo files
 * @param directory - Directory to check (defaults to cwd)
 * @returns CI/CD identifier or null
 */
export function detectCiCd(directory?: string): CiCdType | null {
	const cwd = directory || process.cwd()

	if (existsSync(join(cwd, ".github", "workflows"))) return "github-actions"
	if (existsSync(join(cwd, ".gitlab-ci.yml"))) return "gitlab-ci"
	if (existsSync(join(cwd, "Jenkinsfile"))) return "jenkins"
	if (existsSync(join(cwd, ".circleci"))) return "circleci"

	return null
}

/**
 * Map from provider category key to the built-in markdown filename
 */
const PROVIDER_CATEGORY_MAP: Record<string, string> = {
	spec: "spec",
	ticketing: "ticketing",
	design: "design",
	comms: "comms",
}

/**
 * Load and merge provider instructions from three tiers:
 * 1. Built-in default (plugin/providers/{category}.md)
 * 2. Inline instructions from settings.yml
 * 3. Project override (.ai-dlc/providers/{type}.md)
 */
export function loadProviderInstructions(
	category: string,
	type: string,
	inlineInstructions?: string,
): string {
	let merged = ""

	// Tier 1: Built-in default
	const builtinPath = join(__dirname, "..", "providers", `${category}.md`)
	if (existsSync(builtinPath)) {
		const content = readFileSync(builtinPath, "utf-8")
		// Strip YAML frontmatter
		const body = content.replace(/^---[\s\S]*?---\n*/, "")
		merged = body
	}

	// Tier 2: Inline instructions from settings
	if (inlineInstructions) {
		merged += `\n\n### Project-Specific Instructions (from settings.yml)\n${inlineInstructions}`
	}

	// Tier 3: Project override
	const repoRoot = findRepoRoot()
	if (repoRoot) {
		const overridePath = join(repoRoot, ".ai-dlc", "providers", `${type}.md`)
		if (existsSync(overridePath)) {
			const content = readFileSync(overridePath, "utf-8")
			const body = content.replace(/^---[\s\S]*?---\n*/, "")
			merged += `\n\n### Project Override (from .ai-dlc/providers/${type}.md)\n${body}`
		}
	}

	return merged
}

/**
 * Load providers from settings, cache, and auto-detection
 * @param options - Optional repo root
 * @returns Complete providers configuration
 */
export function loadProviders(options?: {
	repoRoot?: string
}): ProvidersConfig {
	const repoRoot = options?.repoRoot || findRepoRoot()
	const result: ProvidersConfig = {
		spec: null,
		ticketing: null,
		design: null,
		comms: null,
		vcsHosting: null,
		ciCd: null,
	}

	// Source 1: Declared providers from settings.yml
	if (repoRoot) {
		const settings = loadRepoSettings(repoRoot)
		if (settings?.providers) {
			if (settings.providers.spec) {
				result.spec = settings.providers.spec as ProviderEntry<SpecProviderType>
			}
			if (settings.providers.ticketing) {
				result.ticketing = settings.providers
					.ticketing as ProviderEntry<TicketingProviderType>
			}
			if (settings.providers.design) {
				result.design = settings.providers
					.design as ProviderEntry<DesignProviderType>
			}
			if (settings.providers.comms) {
				result.comms = settings.providers
					.comms as ProviderEntry<CommsProviderType>
			}
		}
	}

	// Source 2: Cached providers from MCP discovery
	try {
		const cached = execSync("han keep load providers.json --quiet", {
			stdio: "pipe",
		})
			.toString()
			.trim()
		if (cached) {
			const cachedProviders = JSON.parse(cached) as ProvidersConfig
			for (const key of ["spec", "ticketing", "design", "comms"] as const) {
				if (!result[key] && cachedProviders[key]) {
					;(result as Record<string, unknown>)[key] = cachedProviders[key]
				}
			}
		}
	} catch {
		// No cached providers
	}

	// Source 3: Auto-detect VCS hosting and CI/CD
	const dir = repoRoot || undefined
	result.vcsHosting = detectVcsHosting(dir)
	result.ciCd = detectCiCd(dir)

	return result
}

/**
 * Load providers and resolve three-tier merged instructions for each
 * @param options - Optional repo root
 * @returns Providers with merged instructions and MCP hints
 */
export function loadResolvedProviders(options?: {
	repoRoot?: string
}): Record<string, ResolvedProvider<string>> {
	const providers = loadProviders(options)
	const resolved: Record<string, ResolvedProvider<string>> = {}

	for (const key of ["spec", "ticketing", "design", "comms"] as const) {
		const entry = providers[key]
		if (!entry) continue

		const category = PROVIDER_CATEGORY_MAP[key] || key
		const mergedInstructions = loadProviderInstructions(
			category,
			entry.type,
			entry.instructions,
		)

		resolved[key] = {
			...entry,
			mergedInstructions,
			mcpHint: getProviderMcpHint(entry.type),
		}
	}

	// Include VCS hosting as a resolved provider
	if (providers.vcsHosting) {
		resolved.vcsHosting = {
			type: providers.vcsHosting,
			mergedInstructions: "",
			mcpHint: getProviderMcpHint(providers.vcsHosting),
		}
	}

	// Include CI/CD as a resolved provider
	if (providers.ciCd) {
		resolved.ciCd = {
			type: providers.ciCd,
			mergedInstructions: "",
			mcpHint: getProviderMcpHint(providers.ciCd),
		}
	}

	return resolved
}
