import {
	type KeyboardEvent,
	type ReactNode,
	useCallback,
	useRef,
	useState,
} from "react"

export interface TabDef {
	id: string
	label: string
	content: ReactNode
	disabled?: boolean
}

interface Props {
	groupId: string
	tabs: TabDef[]
}

export function Tabs({ groupId, tabs }: Props) {
	const enabledTabs = tabs.filter((t) => !t.disabled)
	const [activeId, setActiveId] = useState(enabledTabs[0]?.id ?? "")
	const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

	const setRef = useCallback(
		(id: string) => (el: HTMLButtonElement | null) => {
			if (el) tabRefs.current.set(id, el)
			else tabRefs.current.delete(id)
		},
		[],
	)

	function activate(id: string) {
		setActiveId(id)
		tabRefs.current.get(id)?.focus()
	}

	function handleKeyDown(e: KeyboardEvent) {
		const enabledIds = enabledTabs.map((t) => t.id)
		const idx = enabledIds.indexOf(activeId)
		if (idx < 0) return

		let nextIdx: number | undefined
		if (e.key === "ArrowRight") nextIdx = (idx + 1) % enabledIds.length
		else if (e.key === "ArrowLeft")
			nextIdx = (idx - 1 + enabledIds.length) % enabledIds.length
		else if (e.key === "Home") nextIdx = 0
		else if (e.key === "End") nextIdx = enabledIds.length - 1

		if (nextIdx !== undefined) {
			e.preventDefault()
			activate(enabledIds[nextIdx])
		}
	}

	return (
		<div data-tabs={groupId}>
			<div
				role="tablist"
				aria-label="Review sections"
				className="flex overflow-x-auto border-b border-stone-200 dark:border-stone-700 -mx-1 mb-6 sticky top-[53px] z-30 bg-white dark:bg-stone-950 pb-0"
				onKeyDown={handleKeyDown}
			>
				{tabs.map((tab) => {
					const isActive = tab.id === activeId
					const disabled = tab.disabled ?? false
					return (
						<button
							key={tab.id}
							type="button"
							ref={setRef(tab.id)}
							role="tab"
							id={`tab-${groupId}-${tab.id}`}
							aria-selected={isActive && !disabled}
							aria-controls={`panel-${groupId}-${tab.id}`}
							tabIndex={isActive && !disabled ? 0 : -1}
							aria-disabled={disabled || undefined}
							onClick={() => !disabled && activate(tab.id)}
							className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
								disabled
									? "border-transparent text-stone-400 dark:text-stone-600 cursor-not-allowed"
									: isActive
										? "border-teal-600 text-teal-600 dark:border-teal-400 dark:text-teal-400"
										: "border-transparent text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:border-stone-300 dark:hover:border-stone-600 cursor-pointer"
							}`}
						>
							{tab.label}
						</button>
					)
				})}
			</div>

			{tabs.map((tab) => {
				const isActive = tab.id === activeId
				return (
					<div
						key={tab.id}
						role="tabpanel"
						id={`panel-${groupId}-${tab.id}`}
						aria-labelledby={`tab-${groupId}-${tab.id}`}
						hidden={!isActive || tab.disabled}
						className="focus:outline-none"
					>
						{isActive && tab.content}
					</div>
				)
			})}
		</div>
	)
}
