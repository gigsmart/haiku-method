// locks.ts — Per-stage and per-intent advisory file locks.
//
// Why this exists: terminal-hat `advance_hat` triggers a merge of the
// unit branch into the stage branch. Two siblings finishing at the
// same instant both call mergeUnitWorktree(...) and race for the
// stage branch. Git refuses two worktrees on one branch and may also
// hit "merge in progress" / "uncommitted changes" failures depending
// on timing. We need to serialize the merge calls per stage.
//
// Why mkdir locks (not flock, not proper-lockfile):
//   - mkdir is atomic on POSIX and Windows. No native bindings, no
//     extra dependency.
//   - Cross-process: multiple MCP processes (different sessions, test
//     runs, etc.) acquire the same lock through the filesystem.
//   - Self-contained: ~80 lines, no library footprint.
//
// Stale-lock recovery:
//   - The lock dir contains a `holder.json` with the pid + timestamp.
//   - On acquire, if the existing dir is older than `STALE_AFTER_MS`
//     and its pid is no longer alive (verified via `process.kill(pid, 0)`),
//     the lock is stolen.
//   - The "kill 0" check is a no-op signal that throws ESRCH if the
//     process is gone — portable across POSIX and Windows.
//
// Failure modes the lock guards against:
//   - Two terminal-hat advance_hat calls racing on stage merge
//   - Two stage→main merges racing on intent main
//   - Concurrent fix-loop closure merges into the stage branch
//
// Failure modes the lock does NOT cover:
//   - Out-of-band git operations from a user's terminal — locks are
//     advisory; only the engine respects them.
//   - Deadlock between stage and intent locks — we don't need cycles
//     because the engine acquires at most one lock per call.

import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { primaryRepoRoot } from "./state-tools.js"

const ACQUIRE_RETRY_MS = 50
const ACQUIRE_TIMEOUT_MS = 30_000
const STALE_AFTER_MS = 5 * 60_000

type Holder = { pid: number; at: number; tag: string }

function lockRoot(): string {
	return join(primaryRepoRoot(), ".haiku", "locks")
}

function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0)
		return true
	} catch (err) {
		// `ESRCH` = no such process (truly dead).
		// `EPERM` = process exists but we lack permission to signal it
		// (alive but cross-user / cross-session — e.g. on Windows or
		// shared CI hosts). A bare `catch { return false }` would treat
		// EPERM as dead and let `steal()` delete a live holder's lock.
		return (err as NodeJS.ErrnoException).code === "EPERM"
	}
}

function readHolder(lockDir: string): Holder | null {
	const holderPath = join(lockDir, "holder.json")
	if (!existsSync(holderPath)) return null
	try {
		const raw = readFileSync(holderPath, "utf8")
		const parsed = JSON.parse(raw) as Partial<Holder>
		if (
			typeof parsed.pid === "number" &&
			typeof parsed.at === "number" &&
			typeof parsed.tag === "string"
		) {
			return parsed as Holder
		}
		return null
	} catch {
		return null
	}
}

function isStale(lockDir: string): boolean {
	let dirAge: number
	try {
		dirAge = Date.now() - statSync(lockDir).mtimeMs
	} catch {
		// Dir vanished mid-check — not stale, just gone.
		return false
	}
	if (dirAge < STALE_AFTER_MS) return false
	const holder = readHolder(lockDir)
	if (!holder) return true // no holder file, dir is wedged
	return !isAlive(holder.pid)
}

function tryAcquire(lockDir: string, tag: string): boolean {
	try {
		mkdirSync(lockDir, { recursive: false })
	} catch {
		return false
	}
	// Stamp the holder file atomically (best-effort — failure here
	// just leaves a holder-less lock dir, which the stale check
	// treats as wedged).
	const holder: Holder = { pid: process.pid, at: Date.now(), tag }
	try {
		writeFileSync(join(lockDir, "holder.json"), JSON.stringify(holder, null, 2))
	} catch {
		// Ignore — the lock is held even without the holder stamp.
	}
	return true
}

function steal(lockDir: string, tag: string): boolean {
	try {
		rmSync(lockDir, { recursive: true, force: true })
	} catch {
		return false
	}
	return tryAcquire(lockDir, tag)
}

/**
 * Acquire a named advisory lock. Blocks (with backoff) until the lock
 * is available, the timeout elapses, or a stale holder is detected.
 *
 * @param name        Lock identifier — e.g. `<slug>-<stage>` or `<slug>-main`.
 * @param tag         Diagnostic tag stamped into the holder file.
 * @returns           Path to the acquired lock dir. Pass to `releaseLock`.
 * @throws            If `ACQUIRE_TIMEOUT_MS` elapses without acquisition.
 */
function acquireLock(name: string, tag: string): string {
	const root = lockRoot()
	mkdirSync(root, { recursive: true })
	const lockDir = join(root, name)
	const deadline = Date.now() + ACQUIRE_TIMEOUT_MS
	while (Date.now() < deadline) {
		if (tryAcquire(lockDir, tag)) return lockDir
		if (isStale(lockDir)) {
			if (steal(lockDir, tag)) return lockDir
		}
		// Synchronous backoff via Atomics.wait — the canonical sync-sleep
		// idiom in Node. Doesn't peg the CPU like a busy-wait would.
		// `Atomics.wait` blocks until the value at view[0] != 0 or the
		// timeout elapses; we never write to it, so this just sleeps.
		const view = new Int32Array(new SharedArrayBuffer(4))
		Atomics.wait(view, 0, 0, ACQUIRE_RETRY_MS)
	}
	throw new Error(
		`acquireLock: timed out waiting for ${name} after ${ACQUIRE_TIMEOUT_MS}ms`,
	)
}

function releaseLock(lockDir: string): void {
	try {
		rmSync(lockDir, { recursive: true, force: true })
	} catch {
		// Best-effort. A lingering dir gets cleaned up by the stale
		// detector on the next acquire.
	}
}

/**
 * Run `fn` while holding an advisory lock named `<slug>-<stage>`.
 *
 * Wraps:
 *   - terminal-hat `advance_hat` on a unit (the unit-branch → stage
 *     merge)
 *   - terminal feedback-assessor on a fix bolt (the fix-chain → stage
 *     merge)
 *
 * Per-stage scope: parallelism across different stages or different
 * intents is preserved; only writes to the same stage branch
 * serialize.
 */
export function withStageLock<T>(slug: string, stage: string, fn: () => T): T {
	const lock = acquireLock(`${slug}-${stage}`, `stage-merge:${slug}/${stage}`)
	try {
		return fn()
	} finally {
		releaseLock(lock)
	}
}

/**
 * Run `fn` while holding an advisory lock named `<slug>-main`.
 *
 * Wraps the stage-branch → intent-main merge that fires when the
 * cursor emits `merge_stage`. Per-intent scope: parallelism across
 * different intents is preserved.
 */
export function withIntentMainLock<T>(slug: string, fn: () => T): T {
	const lock = acquireLock(`${slug}-main`, `intent-merge:${slug}`)
	try {
		return fn()
	} finally {
		releaseLock(lock)
	}
}

// Test-only escape hatch — internal callers can verify lock state
// without exposing the raw acquire/release primitives.
export const __testOnly = {
	acquireLock,
	releaseLock,
	lockRoot,
	isStale,
}
