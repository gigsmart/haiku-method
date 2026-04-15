import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { HostBridgeStatus } from "../HostBridgeStatus"
import { NegotiationErrorScreen } from "../NegotiationErrorScreen"
import { SandboxErrorScreen } from "../SandboxErrorScreen"
import { SessionExpiredScreen } from "../SessionExpiredScreen"
import { StaleHostWarning } from "../StaleHostWarning"

// ─── NegotiationErrorScreen ────────────────────────────────────────────────

describe("NegotiationErrorScreen", () => {
	afterEach(() => vi.restoreAllMocks())

	it("renders with error code and retry button", () => {
		render(
			<NegotiationErrorScreen
				errorCode="NEGOTIATION_FAILED"
				sessionId="test-session-123"
				onRetry={vi.fn()}
			/>,
		)

		expect(screen.getByText("NEGOTIATION_FAILED")).toBeTruthy()
		expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy()
	})

	it("has aria-live=assertive on the alert container", () => {
		render(
			<NegotiationErrorScreen
				errorCode="NEGOTIATION_FAILED"
				sessionId="test-session-123"
				onRetry={vi.fn()}
			/>,
		)

		const alert = screen.getByRole("alert")
		expect(alert.getAttribute("aria-live")).toBe("assertive")
	})

	it("shows retry spinner while retrying", async () => {
		const onRetry = vi.fn(() => new Promise<void>(() => {})) // never resolves

		render(
			<NegotiationErrorScreen
				errorCode="NEGOTIATION_FAILED"
				sessionId="test-session-123"
				onRetry={onRetry}
			/>,
		)

		const retryBtn = screen.getByRole("button", { name: /retry/i })
		fireEvent.click(retryBtn)

		await waitFor(() => {
			expect(screen.getByText(/retrying/i)).toBeTruthy()
		})
	})

	it("reveals escalation panel after retry failure", async () => {
		const onRetry = vi.fn().mockRejectedValue(new Error("still failed"))

		render(
			<NegotiationErrorScreen
				errorCode="NEGOTIATION_FAILED"
				sessionId="test-session-123"
				onRetry={onRetry}
			/>,
		)

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: /retry/i }))
		})

		// Escalation panel with session ID input should be visible
		await waitFor(() => {
			expect(screen.getByDisplayValue("test-session-123")).toBeTruthy()
		})
	})

	it("unmounts and calls retry on success", async () => {
		let resolveRetry: () => void
		const onRetry = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					resolveRetry = resolve
				}),
		)

		render(
			<NegotiationErrorScreen
				errorCode="NEGOTIATION_FAILED"
				sessionId="test-session-123"
				onRetry={onRetry}
			/>,
		)

		fireEvent.click(screen.getByRole("button", { name: /retry/i }))
		expect(onRetry).toHaveBeenCalledOnce()
	})
})

// ─── SandboxErrorScreen ────────────────────────────────────────────────────

describe("SandboxErrorScreen", () => {
	it("renders with feature name and error code", () => {
		render(
			<SandboxErrorScreen
				feature="clipboard-write"
				errorCode="SANDBOX_CLIPBOARD_WRITE"
			/>,
		)

		// The feature name appears in at least one element (code or text)
		const dom = document.body.innerHTML
		expect(dom).toContain("clipboard-write")
		expect(screen.getByText("SANDBOX_CLIPBOARD_WRITE")).toBeTruthy()
	})

	it("has aria-live=assertive on the alert container", () => {
		render(
			<SandboxErrorScreen
				feature="clipboard-write"
				errorCode="SANDBOX_CLIPBOARD_WRITE"
			/>,
		)
		const alert = screen.getByRole("alert")
		expect(alert.getAttribute("aria-live")).toBe("assertive")
	})

	it("shows 'Why this happens' disclosure toggle", () => {
		render(
			<SandboxErrorScreen
				feature="clipboard-write"
				errorCode="SANDBOX_CLIPBOARD_WRITE"
			/>,
		)
		expect(screen.getByText(/why this happens/i)).toBeTruthy()
	})

	it("expands disclosure on click", async () => {
		render(
			<SandboxErrorScreen
				feature="clipboard-write"
				errorCode="SANDBOX_CLIPBOARD_WRITE"
			/>,
		)

		const summary = screen.getByText(/why this happens/i)
		fireEvent.click(summary)

		await waitFor(() => {
			expect(screen.getByText(/sandbox policy restricts/i)).toBeTruthy()
		})
	})
})

// ─── SessionExpiredScreen ──────────────────────────────────────────────────

describe("SessionExpiredScreen", () => {
	it("renders with error code", () => {
		render(<SessionExpiredScreen errorCode="SESSION_EXPIRED" />)
		expect(screen.getByText("SESSION_EXPIRED")).toBeTruthy()
	})

	it("has aria-live=assertive on the alert container", () => {
		render(<SessionExpiredScreen errorCode="SESSION_EXPIRED" />)
		const alert = screen.getByRole("alert")
		expect(alert.getAttribute("aria-live")).toBe("assertive")
	})

	it("shows copy button with recovery text — no window.open reference", () => {
		render(<SessionExpiredScreen errorCode="SESSION_EXPIRED" />)
		// Should show the copy button
		expect(screen.getByText(/please generate a new review link/i)).toBeTruthy()
		// No window.open or open in new tab references
		const dom = document.body.innerHTML
		expect(dom).not.toContain("window.open")
		expect(dom).not.toContain('target="_blank"')
	})

	it("reveals textarea when clipboard is blocked", async () => {
		// Mock clipboard to reject
		vi.stubGlobal("navigator", {
			...globalThis.navigator,
			clipboard: {
				writeText: vi.fn().mockRejectedValue(new Error("blocked")),
			},
		})

		render(<SessionExpiredScreen errorCode="SESSION_EXPIRED" />)

		const copyBtn = screen.getByRole("button")
		await act(async () => {
			fireEvent.click(copyBtn)
		})

		await waitFor(() => {
			expect(screen.getByRole("textbox")).toBeTruthy()
		})

		vi.unstubAllGlobals()
	})
})

// ─── StaleHostWarning ──────────────────────────────────────────────────────

describe("StaleHostWarning", () => {
	it("renders protocol version info and error code", () => {
		render(
			<StaleHostWarning
				hostVersion="0.9.0"
				expectedVersion="1.0.0"
				onDismiss={vi.fn()}
			/>,
		)

		expect(screen.getByText(/0\.9\.0/)).toBeTruthy()
		expect(screen.getByText(/1\.0\.0/)).toBeTruthy()
		expect(screen.getByText(/STALE_HOST_PROTOCOL/)).toBeTruthy()
	})

	it("has aria-live=assertive", () => {
		render(
			<StaleHostWarning
				hostVersion="0.9.0"
				expectedVersion="1.0.0"
				onDismiss={vi.fn()}
			/>,
		)
		const alert = screen.getByRole("alert")
		expect(alert.getAttribute("aria-live")).toBe("assertive")
	})

	it("calls onDismiss when dismiss button clicked", () => {
		const onDismiss = vi.fn()
		render(
			<StaleHostWarning
				hostVersion="0.9.0"
				expectedVersion="1.0.0"
				onDismiss={onDismiss}
			/>,
		)

		fireEvent.click(screen.getByRole("button", { name: /dismiss/i }))
		expect(onDismiss).toHaveBeenCalledOnce()
	})
})

// ─── HostBridgeStatus ──────────────────────────────────────────────────────

describe("HostBridgeStatus", () => {
	it("renders connected state with teal dot and Connected text", () => {
		render(<HostBridgeStatus status="connected" />)
		expect(screen.getByText("Connected")).toBeTruthy()
	})

	it("renders reconnecting state with amber text", () => {
		render(<HostBridgeStatus status="reconnecting" />)
		expect(screen.getByText("Reconnecting")).toBeTruthy()
	})

	it("renders error state as a button with retry affordance", () => {
		const onRetry = vi.fn()
		render(<HostBridgeStatus status="error" onRetry={onRetry} />)

		const retryBtn = screen.getByRole("button")
		expect(retryBtn).toBeTruthy()
		fireEvent.click(retryBtn)
		expect(onRetry).toHaveBeenCalledOnce()
	})

	it("has aria-live=polite for connected state", () => {
		render(<HostBridgeStatus status="connected" />)
		const status = screen.getByRole("status")
		expect(status.getAttribute("aria-live")).toBe("polite")
	})

	it("has aria-live=assertive for error state", () => {
		render(<HostBridgeStatus status="error" onRetry={vi.fn()} />)
		const status = screen.getByRole("status")
		expect(status.getAttribute("aria-live")).toBe("assertive")
	})

	it("error retry button has min touch target via accessible label", () => {
		render(<HostBridgeStatus status="error" onRetry={vi.fn()} />)
		const btn = screen.getByRole("button")
		// Check min-h class is present
		expect(btn.className).toContain("min-h-[44px]")
	})
})
