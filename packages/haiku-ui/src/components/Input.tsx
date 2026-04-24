import { forwardRef, type InputHTMLAttributes } from "react"

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
	invalid?: boolean
}

const BASE =
	"text-xs p-2 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder:text-stone-500 dark:placeholder:text-stone-400 border transition-colors"

const VALID_BORDER =
	"border-stone-300 dark:border-stone-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-900 focus-visible:border-teal-500"

const INVALID_BORDER =
	"border-red-500 dark:border-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-900"

// Disabled input uses a muted surface + AA-compliant text. No opacity composite.
const DISABLED_STATE =
	"disabled:bg-stone-100 disabled:text-stone-600 disabled:border-stone-400 dark:disabled:bg-stone-800 dark:disabled:text-stone-300 dark:disabled:border-stone-500 disabled:cursor-not-allowed"

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
	{ invalid = false, className = "", disabled = false, ...rest },
	ref,
) {
	const borderClass = invalid ? INVALID_BORDER : VALID_BORDER
	const combined =
		`${BASE} ${borderClass} ${DISABLED_STATE} ${className}`.trim()
	return (
		<input
			{...rest}
			ref={ref}
			disabled={disabled}
			aria-disabled={disabled || undefined}
			aria-invalid={invalid || undefined}
			data-invalid={invalid || undefined}
			className={combined}
		/>
	)
})
