// auto-update.ts — Background auto-updater for the H·AI·K·U MCP binary
//
// Periodically polls GitHub releases for a newer version. When one is found
// the new binary is downloaded and staged. On the next MCP tool call the
// server yields to the new binary via spawn(…, {stdio:'inherit'}).
//
// Kill-switch: HAIKU_AUTO_UPDATE=0

import { spawn } from "node:child_process"
import {
	chmodSync,
	copyFileSync,
	createWriteStream,
	existsSync,
	mkdirSync,
	renameSync,
	unlinkSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { autoUpdate } from "./config.js"
import { reportError } from "./sentry.js"
import { MCP_VERSION } from "./version.js"

const GITHUB_REPO = "gigsmart/haiku-method"

// ── State ──────────────────────────────────────────────────────────────────

let pendingBinaryPath: string | null = null
let pendingVersion: string | null = null
let checking = false
let timer: ReturnType<typeof setTimeout> | null = null

/** Whether a downloaded update is ready to swap in. */
export function hasPendingUpdate(): boolean {
	return pendingBinaryPath !== null
}

/** Version string of the pending update (or null). */
export function getPendingVersion(): string | null {
	return pendingVersion
}

// ── Semver helpers ─────────────────────────────────────────────────────────

function parseSemver(v: string): [number, number, number] | null {
	const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v)
	if (!m) return null
	return [Number(m[1]), Number(m[2]), Number(m[3])]
}

function isNewer(latest: string, current: string): boolean {
	const a = parseSemver(latest)
	const b = parseSemver(current)
	if (!a || !b) return false
	if (a[0] !== b[0]) return a[0] > b[0]
	if (a[1] !== b[1]) return a[1] > b[1]
	return a[2] > b[2]
}

// ── GitHub release check ───────────────────────────────────────────────────

interface GitHubAsset {
	name: string
	browser_download_url: string
}

interface GitHubRelease {
	tag_name: string
	assets: GitHubAsset[]
}

async function fetchLatestRelease(): Promise<GitHubRelease | null> {
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), 15_000)
	try {
		const res = await fetch(
			`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
			{
				headers: {
					Accept: "application/vnd.github+json",
					"User-Agent": `haiku-mcp/${MCP_VERSION}`,
				},
				signal: controller.signal,
			},
		)
		if (!res.ok) return null
		return (await res.json()) as GitHubRelease
	} catch {
		return null
	} finally {
		clearTimeout(timeout)
	}
}

// ── Download & stage ───────────────────────────────────────────────────────

/** Download the standalone binary asset and stage it for hot-swap. */
async function downloadBinary(url: string, version: string): Promise<string> {
	const stagingDir = join(tmpdir(), "haiku-update")
	if (!existsSync(stagingDir)) mkdirSync(stagingDir, { recursive: true })

	const dest = join(stagingDir, `haiku-${version}`)

	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), 120_000) // 2 min
	try {
		const res = await fetch(url, { signal: controller.signal })
		if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

		const ws = createWriteStream(dest)
		await pipeline(Readable.fromWeb(res.body as ReadableStream), ws)
		chmodSync(dest, 0o755)
		return dest
	} catch (err) {
		// Clean up partial download
		try {
			unlinkSync(dest)
		} catch {
			/* */
		}
		throw err
	} finally {
		clearTimeout(timeout)
	}
}

// ── Core check loop ────────────────────────────────────────────────────────

async function checkForUpdate(): Promise<void> {
	if (checking || pendingBinaryPath) return
	checking = true
	try {
		if (MCP_VERSION === "dev") return // don't auto-update dev builds

		const release = await fetchLatestRelease()
		if (!release) return

		const latestVersion = release.tag_name.replace(/^v/, "")
		if (!isNewer(latestVersion, MCP_VERSION)) return

		// Look for the standalone binary asset first, then fall back to zip
		const binaryAsset = release.assets.find(
			(a) => a.name === "haiku" || a.name === "haiku-mcp",
		)

		if (binaryAsset) {
			const path = await downloadBinary(
				binaryAsset.browser_download_url,
				latestVersion,
			)
			pendingBinaryPath = path
			pendingVersion = latestVersion
			console.error(
				`[haiku] Update downloaded: ${MCP_VERSION} -> ${latestVersion}`,
			)
			return
		}

		// Fall back to extracting the binary from the zip asset
		const zipAsset = release.assets.find((a) => a.name.endsWith(".zip"))
		if (!zipAsset) return

		const binaryPath = await downloadAndExtractFromZip(
			zipAsset.browser_download_url,
			latestVersion,
		)
		if (binaryPath) {
			pendingBinaryPath = binaryPath
			pendingVersion = latestVersion
			console.error(
				`[haiku] Update downloaded: ${MCP_VERSION} -> ${latestVersion}`,
			)
		}
	} catch (err) {
		reportError(err, { context: "auto-update-check" })
	} finally {
		checking = false
	}
}

/** Download the plugin zip, extract only plugin/bin/haiku. */
async function downloadAndExtractFromZip(
	url: string,
	version: string,
): Promise<string | null> {
	const stagingDir = join(tmpdir(), "haiku-update")
	if (!existsSync(stagingDir)) mkdirSync(stagingDir, { recursive: true })

	const zipPath = join(stagingDir, `haiku-${version}.zip`)
	const binaryDest = join(stagingDir, `haiku-${version}`)

	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), 120_000)
	try {
		const res = await fetch(url, { signal: controller.signal })
		if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

		const ws = createWriteStream(zipPath)
		await pipeline(Readable.fromWeb(res.body as ReadableStream), ws)

		// Extract just the binary using unzip
		const result = spawn(
			"unzip",
			["-o", "-j", zipPath, "plugin/bin/haiku", "-d", stagingDir],
			{ stdio: "pipe" },
		)
		await new Promise<void>((resolve, reject) => {
			result.on("close", (code) =>
				code === 0 ? resolve() : reject(new Error(`unzip exited with ${code}`)),
			)
			result.on("error", (err: NodeJS.ErrnoException) => {
				if (err.code === "ENOENT") {
					console.error(
						"[haiku] Auto-update zip fallback requires 'unzip' (not found in PATH)",
					)
				}
				reject(err)
			})
		})

		// unzip -j flattens to stagingDir/haiku — rename to versioned name
		const extractedPath = join(stagingDir, "haiku")
		if (existsSync(extractedPath)) {
			renameSync(extractedPath, binaryDest)
			chmodSync(binaryDest, 0o755)
		}

		return existsSync(binaryDest) ? binaryDest : null
	} catch (err) {
		reportError(err, { context: "auto-update-zip-extract" })
		return null
	} finally {
		clearTimeout(timeout)
		try {
			unlinkSync(zipPath)
		} catch {
			/* */
		}
	}
}

// ── Hot-swap ───────────────────────────────────────────────────────────────

/**
 * Replace the current binary on disk and yield to the new process.
 *
 * Call this after the current MCP response has been written. It:
 * 1. Copies the staged binary over the running binary path
 * 2. Spawns the new binary with inherited stdio (same fd's)
 * 3. Exits when the child exits
 *
 * The calling code must call `server.close()` first to release stdin.
 */
export function execNewBinary(): void {
	const newBinary = pendingBinaryPath as string
	const currentBinary = process.argv[1] // path to the running binary

	// Try to replace the on-disk binary so future cold starts use the new
	// version too. If this fails (permissions, etc.) we still exec from the
	// staging path.
	let execPath = newBinary
	try {
		const dest = currentBinary
		const tempDest = `${dest}.updating`
		// Copy staged binary next to current, then atomic rename
		copyFileSync(newBinary, tempDest)
		chmodSync(tempDest, 0o755)
		renameSync(tempDest, dest)
		execPath = dest
		// Clean up the staged binary now that it's been copied on-disk
		try {
			unlinkSync(newBinary)
		} catch {
			/* */
		}
		console.error(`[haiku] Binary replaced on disk: ${dest}`)
	} catch (err) {
		console.error("[haiku] Could not replace binary on disk:", err)
		// exec from staging path instead
	}

	console.error(
		`[haiku] Yielding to updated binary (${MCP_VERSION} -> ${pendingVersion})`,
	)

	const child = spawn(execPath, ["mcp"], {
		stdio: "inherit",
		env: process.env,
	})

	child.on("exit", (code) => process.exit(code ?? 0))
	child.on("error", (err) => {
		console.error("[haiku] Hot-swap spawn failed:", err)
		process.exit(1)
	})

	// The child now owns stdio. The caller already stopped the update checker
	// and closed the MCP server. The event loop stays alive because of the
	// child's event listeners. When the child exits, process.exit() fires.
}

// ── Lifecycle ──────────────────────────────────────────────────────────────

/** Start the background update checker. */
export function startUpdateChecker(): void {
	if (!autoUpdate.enabled) {
		console.error("[haiku] Auto-update disabled (HAIKU_AUTO_UPDATE=0)")
		return
	}
	if (MCP_VERSION === "dev") {
		console.error("[haiku] Auto-update skipped (dev build)")
		return
	}

	console.error(
		`[haiku] Auto-update enabled (check every ${Math.round(autoUpdate.intervalMs / 60_000)}m)`,
	)

	// First check after a short delay (let the server finish init)
	timer = setTimeout(async () => {
		// Assign interval first so stopUpdateChecker can cancel it even if
		// checkForUpdate triggers a hot-swap synchronously.
		timer = setInterval(checkForUpdate, autoUpdate.intervalMs)
		await checkForUpdate()
	}, autoUpdate.initialDelayMs)
}

/** Stop the update checker (used during hot-swap). */
export function stopUpdateChecker(): void {
	if (timer) {
		clearInterval(timer)
		clearTimeout(timer)
		timer = null
	}
}
