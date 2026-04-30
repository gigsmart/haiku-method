"use client"

import { type ReactNode, useEffect, useRef } from "react"

interface ModalProps {
	open: boolean
	title: string
	subtitle?: string
	children: ReactNode
	onClose: () => void
}

const FOCUSABLE_SELECTOR = [
	"a[href]",
	"button:not([disabled])",
	"textarea:not([disabled])",
	"input:not([disabled])",
	"select:not([disabled])",
	'[tabindex]:not([tabindex="-1"])',
].join(",")

export function Modal({
	open,
	title,
	subtitle,
	children,
	onClose,
}: ModalProps) {
	const dialogRef = useRef<HTMLDivElement>(null)
	const previousFocus = useRef<HTMLElement | null>(null)

	// Focus management:
	//   - on open: capture the previously-focused element, move focus into
	//     the dialog (first focusable, falling back to the dialog itself).
	//   - on close: restore focus to whatever was focused before open.
	//   - while open: trap Tab / Shift+Tab inside the dialog so keyboard
	//     users can't accidentally leave (browsers otherwise allow Tab to
	//     escape the dialog and reach the page chrome behind the backdrop).
	//   - Escape closes (preserved from the previous implementation).
	useEffect(() => {
		if (!open) return
		previousFocus.current = (document.activeElement as HTMLElement) ?? null
		const dialog = dialogRef.current
		if (dialog) {
			const first = dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
			;(first ?? dialog).focus()
		}

		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose()
				return
			}
			if (e.key !== "Tab" || !dialog) return
			const focusable = Array.from(
				dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
			).filter((el) => !el.hasAttribute("aria-hidden"))
			if (focusable.length === 0) {
				e.preventDefault()
				dialog.focus()
				return
			}
			const first = focusable[0]
			const last = focusable[focusable.length - 1]
			const active = document.activeElement as HTMLElement | null
			if (e.shiftKey) {
				if (active === first || !dialog.contains(active)) {
					e.preventDefault()
					last?.focus()
				}
			} else {
				if (active === last) {
					e.preventDefault()
					first?.focus()
				}
			}
		}
		window.addEventListener("keydown", onKey)
		return () => {
			window.removeEventListener("keydown", onKey)
			previousFocus.current?.focus?.()
		}
	}, [open, onClose])

	return (
		<div
			className={`modal-backdrop${open ? " open" : ""}`}
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose()
			}}
			aria-hidden={!open}
		>
			<div
				ref={dialogRef}
				className="modal"
				role="dialog"
				aria-modal="true"
				aria-label={title}
				tabIndex={-1}
			>
				<div className="modal-header">
					<div>
						<div className="modal-title">{title}</div>
						{subtitle ? <div className="modal-stage">{subtitle}</div> : null}
					</div>
					<button type="button" className="modal-close" onClick={onClose}>
						close · esc
					</button>
				</div>
				<div className="modal-body">{children}</div>
			</div>
		</div>
	)
}

/** Wrap renderInline / renderMarkdown HTML strings so the modal can use them as JSX. */
export function HtmlBlock({
	html,
	className,
	style,
}: {
	html: string
	className?: string
	style?: React.CSSProperties
}) {
	return (
		<div
			className={className}
			style={style}
			// biome-ignore lint/security/noDangerouslySetInnerHtml: trusted prototype copy
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	)
}
