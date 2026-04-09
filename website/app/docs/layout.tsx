import { getDocsNavigation } from "@/lib/docs"
import type { ReactNode } from "react"
import { DocsSidebar } from "../components"

export default function DocsLayout({ children }: { children: ReactNode }) {
	const navigation = getDocsNavigation()

	return (
		<div className="mx-auto max-w-7xl px-4 py-8 lg:py-12 lg:pr-72">
			<DocsSidebar navigation={navigation} />
			<div className="min-w-0">{children}</div>
		</div>
	)
}
