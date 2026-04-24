/**
 * Page-title context — shell owns the <Header> title; per-page modules
 * (mounted inside the shell) can override it via `usePageTitle(newTitle)`.
 *
 * Why a context instead of prop-drilling: the shell renders `<Header>` as
 * a sibling of the active page module, so the page cannot reach the header
 * with props. The context gives the page a one-line hook to override the
 * default title; unmount restores it automatically.
 *
 * Document-title (the browser tab) is set directly by each page module via
 * `document.title = ...` — that's orthogonal to the in-DOM <h1> title and
 * does not route through this context.
 */

import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react"

export interface PageTitleValue {
	title: string
	setTitle: (next: string | null) => void
}

const PageTitleContext = createContext<PageTitleValue | null>(null)

export function PageTitleProvider({
	defaultTitle,
	children,
}: {
	defaultTitle: string
	children: ReactNode
}): React.ReactElement {
	const [title, setTitleState] = useState<string>(defaultTitle)
	const value: PageTitleValue = {
		title,
		setTitle: (next) => setTitleState(next ?? defaultTitle),
	}
	return (
		<PageTitleContext.Provider value={value}>
			{children}
		</PageTitleContext.Provider>
	)
}

export function usePageTitle(next: string | null | undefined): void {
	const ctx = useContext(PageTitleContext)
	useEffect(() => {
		if (!ctx) return
		if (next) ctx.setTitle(next)
		return () => {
			ctx.setTitle(null)
		}
	}, [ctx, next])
}

export function useShellTitle(): string | null {
	return useContext(PageTitleContext)?.title ?? null
}
