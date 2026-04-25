/**
 * Keyboard-shortcut registry + `useShortcut` hook per
 * `stages/design/artifacts/keyboard-shortcut-map.html §1` (bindings table).
 *
 * The registry below is a hand-authored mirror of keyboard-shortcut-map.html
 * §1. Parsing the HTML file at runtime would add an HTML parser + build-time
 * codegen for zero deterministic benefit — the table is 17 rows and rarely
 * drifts. A stage-wide drift-detection audit (unit-15) can diff this registry
 * against the HTML grep when it lands.
 *
 * Scope semantics: "scope" is a free-form string the consumer declares to
 * disambiguate disjoint contexts (e.g. "global", "dialog", "feedback-card").
 * Two shortcuts at different scopes can share a key. Two shortcuts at the
 * SAME scope with the same key throw `KeyboardShortcutConflict` in dev mode.
 *
 * The two-key `g <letter>` sequences from the shortcut map are NOT handled
 * by `useShortcut` — a future `useKeySequence` hook (or the Esc-precedence
 * ladder in `keyboard-shortcut-map.html §2`) owns that. This hook is the
 * single-key primitive.
 */

import { useEffect, useRef } from "react"

// ── Registry ───────────────────────────────────────────────────────────────

export interface ShortcutBinding {
	/** Chord in W3C `aria-keyshortcuts` format (e.g. "Enter", "g o", "c"). */
	key: string
	/** Human-readable action label (mirrors the shortcut-map "Action" column). */
	action: string
	/**
	 * Declarative scope context (mirrors the shortcut-map "Scope" column).
	 * E.g. "global", "global (2-key)", "global (feedback-card focused)".
	 */
	scope: string
	/** How the shortcut behaves while focus is in an input/textarea. */
	inInput: "suppressed" | "blurs input"
	/** Plain-text notes / guards / context column. */
	notes: string
	/** Canonical aria-keyshortcuts attribute value for bound UI elements. */
	aria: string
}

/**
 * Canonical mirror of keyboard-shortcut-map.html §1 (lines 96–230 of the spec).
 * 17 entries. Drift detection lives in unit-15 stage-wide audit.
 */
export const KEYBOARD_SHORTCUT_REGISTRY: readonly ShortcutBinding[] = [
	{
		key: "j",
		action: "Focus next feedback card (sidebar)",
		scope: "global",
		inInput: "suppressed",
		notes: "Only if sidebar has >=1 feedback item. Scroll focused into view.",
		aria: "j",
	},
	{
		key: "k",
		action: "Focus previous feedback card",
		scope: "global",
		inInput: "suppressed",
		notes: "Clamped at top/bottom; no wrap.",
		aria: "k",
	},
	{
		key: "[",
		action: "Previous stage",
		scope: "global",
		inInput: "suppressed",
		notes: "Upcoming stages are skipped. Clamped at first reachable.",
		aria: "[",
	},
	{
		key: "]",
		action: "Next stage",
		scope: "global",
		inInput: "suppressed",
		notes: "Upcoming stages skipped. Clamped at last reachable.",
		aria: "]",
	},
	{
		key: "g o",
		action: "Jump to Overview tab",
		scope: "global (2-key)",
		inInput: "suppressed",
		notes:
			"Gmail-style latch; second key must arrive within 1000ms or latch expires.",
		aria: "g o",
	},
	{
		key: "g u",
		action: "Jump to Units tab",
		scope: "global (2-key)",
		inInput: "suppressed",
		notes: "Same 1s latch. No visual arming indicator.",
		aria: "g u",
	},
	{
		key: "g k",
		action: "Jump to Knowledge tab",
		scope: "global (2-key)",
		inInput: "suppressed",
		notes: "Latched g takes precedence over bare k (previous-feedback).",
		aria: "g k",
	},
	{
		key: "g p",
		action: "Jump to outputs (P) tab",
		scope: "global (2-key)",
		inInput: "suppressed",
		notes: "Preserves current stage selection.",
		aria: "g p",
	},
	{
		key: "Enter",
		action: "Cross-flash focused feedback <-> target artifact",
		scope: "global (feedback-card focused)",
		inInput: "suppressed",
		notes: "Applies .fb-flash and .unit-flash; scrolls target into view.",
		aria: "Enter",
	},
	{
		key: "n",
		action: "Next unseen artifact in active tab",
		scope: "global",
		inInput: "suppressed",
		notes: "Only fires on Units / Knowledge / Outputs tabs.",
		aria: "n",
	},
	{
		key: "a",
		action: "Approve",
		scope: "global",
		inInput: "suppressed",
		notes: "Only when an active Approve button is rendered in the sidebar.",
		aria: "a",
	},
	{
		key: "c",
		action: "Create annotation at focused artifact / line",
		scope: "global",
		inInput: "suppressed",
		notes:
			"Renamed from `a` per FB-14 to resolve Approve collision. See annotation-gesture-spec.html §7.",
		aria: "c",
	},
	{
		key: "r",
		action: "Reopen (if closed/rejected) or Request Changes",
		scope: "global",
		inInput: "suppressed",
		notes:
			"Context-dependent: focused feedback with status in {closed, rejected} reopens it; otherwise opens revisit modal.",
		aria: "r",
	},
	{
		key: "/",
		action: "Focus feedback textarea (sidebar general-comment)",
		scope: "global",
		inInput: "suppressed",
		notes:
			"Calls .focus() on #sb-comment. preventDefault so browser quick-find does not open.",
		aria: "/",
	},
	{
		key: "Escape",
		action: "Dismiss (modal -> popover -> help overlay -> blur input)",
		scope: "global",
		inInput: "blurs input",
		notes: "Exactly one level dismissed per press. Strict precedence.",
		aria: "Escape",
	},
	{
		key: "?",
		action: "Toggle shortcuts help overlay",
		scope: "global",
		inInput: "suppressed",
		notes: "Idempotent; re-pressing closes. Backdrop click also closes.",
		aria: "?",
	},
	{
		key: "Tab",
		action: "Move focus to next / previous tabbable",
		scope: "global",
		inInput: "suppressed",
		notes:
			"Native browser behavior. Shortcut registry lists it for completeness; no app handler intercepts it outside focus-traps.",
		aria: "Tab",
	},
] as const

// ── Conflict-detection error ───────────────────────────────────────────────

export class KeyboardShortcutConflict extends Error {
	public readonly key: string
	public readonly scope: string
	constructor(key: string, scope: string, existingAction?: string) {
		const suffix = existingAction
			? ` (existing handler: ${existingAction})`
			: ""
		super(
			`KeyboardShortcutConflict: duplicate binding for key="${key}" scope="${scope}"${suffix}`,
		)
		this.name = "KeyboardShortcutConflict"
		this.key = key
		this.scope = scope
	}
}

// ── useShortcut ────────────────────────────────────────────────────────────

interface RegistryEntry {
	handler: (event: KeyboardEvent) => void
	guard?: () => boolean
	allowInInput?: boolean
}

/**
 * Module-level registry keyed by `${scope}::${key}`. Used for dev-mode
 * conflict detection AND for dispatching keydown events to handlers without
 * multiplying document-level listeners (single shared listener below).
 */
const registry = new Map<string, RegistryEntry>()

function registryKey(key: string, scope: string): string {
	return `${scope}::${key}`
}

function isInInput(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false
	const tag = target.tagName
	if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
	if (target.isContentEditable) return true
	return false
}

function handleDocumentKeydown(event: KeyboardEvent): void {
	// Ignore when a modifier other than shift is held — single-key shortcuts
	// MUST NOT intercept platform shortcuts (Ctrl/Cmd/Alt variants).
	if (event.metaKey || event.ctrlKey || event.altKey) return
	const key = event.key
	const inInput = isInInput(event.target)
	for (const [scopedKey, entry] of registry.entries()) {
		const [, k] = scopedKey.split("::")
		if (k !== key) continue
		if (inInput && !entry.allowInInput) continue
		if (entry.guard && !entry.guard()) continue
		entry.handler(event)
	}
}

let listenerInstalled = false
let listenerRefCount = 0

function installListenerIfNeeded(): void {
	if (listenerInstalled || typeof document === "undefined") return
	document.addEventListener("keydown", handleDocumentKeydown)
	listenerInstalled = true
}

function uninstallListenerIfUnused(): void {
	if (listenerRefCount > 0) return
	if (!listenerInstalled) return
	if (typeof document === "undefined") return
	document.removeEventListener("keydown", handleDocumentKeydown)
	listenerInstalled = false
}

export interface UseShortcutOptions {
	/**
	 * Context label for conflict detection. Two hooks with the same key at
	 * different scopes coexist; same key + same scope throws in DEV.
	 */
	scope: string
	/**
	 * Optional gate. Handler fires only when `guard()` returns true. Use this
	 * to inject context that JavaScript can't detect (e.g. SR browse mode —
	 * not JS-detectable; consumer checks a user setting instead).
	 */
	guard?: () => boolean
	/** When true, the handler fires even while focus is in an input. */
	allowInInput?: boolean
}

/**
 * Register a single-key shortcut handler for the app's global keydown stream.
 *
 * Duplicate `(key, scope)` bindings throw `KeyboardShortcutConflict` in dev
 * mode (`import.meta.env.DEV === true`). Production silently keeps the first
 * registration — last-write-wins would break the earlier consumer without
 * warning.
 */
export function useShortcut(
	key: string,
	handler: (event: KeyboardEvent) => void,
	opts: UseShortcutOptions,
): void {
	// Stash the latest handler/guard/allowInInput in refs so the registered
	// callback always sees the most recent closure without re-registering the
	// hook (which would thrash the registry on every parent render).
	const handlerRef = useRef(handler)
	const guardRef = useRef(opts.guard)
	const allowInInputRef = useRef(opts.allowInInput)
	useEffect(() => {
		handlerRef.current = handler
		guardRef.current = opts.guard
		allowInInputRef.current = opts.allowInInput
	})

	useEffect(() => {
		const k = registryKey(key, opts.scope)
		if (registry.has(k)) {
			// Dev-mode conflict detection. Vitest runs in dev, so tests hit this.
			const isDev =
				typeof import.meta !== "undefined" &&
				// biome-ignore lint/suspicious/noExplicitAny: import.meta.env is Vite-specific
				(import.meta as any).env?.DEV !== false
			if (isDev) {
				throw new KeyboardShortcutConflict(key, opts.scope)
			}
			return
		}
		const entry: RegistryEntry = {
			handler: (event) => handlerRef.current(event),
			guard: () => (guardRef.current ? guardRef.current() : true),
		}
		Object.defineProperty(entry, "allowInInput", {
			get() {
				return allowInInputRef.current
			},
		})
		registry.set(k, entry)
		listenerRefCount += 1
		installListenerIfNeeded()

		return () => {
			registry.delete(k)
			listenerRefCount = Math.max(0, listenerRefCount - 1)
			uninstallListenerIfUnused()
		}
	}, [key, opts.scope])
}

// ── Test-only internals (exported for unit tests) ──────────────────────────

/** @internal Reset the registry. Intended for test afterEach isolation. */
export function __resetShortcutRegistryForTests(): void {
	registry.clear()
	listenerRefCount = 0
	if (listenerInstalled && typeof document !== "undefined") {
		document.removeEventListener("keydown", handleDocumentKeydown)
		listenerInstalled = false
	}
}
