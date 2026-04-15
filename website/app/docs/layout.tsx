import { getDocsNavigation } from "@/lib/docs"
import type { ReactNode } from "react"
import { DocsSidebar } from "../components"

export default function DocsLayout({ children }: { children: ReactNode }) {
	const navigation = getDocsNavigation()

	return (
		<div className="mx-auto max-w-7xl px-4 py-8 lg:py-12">
			<div className="lg:flex lg:gap-8">
				<div className="min-w-0 flex-1">{children}</div>
				<DocsSidebar navigation={navigation} />
			</div>
		</div>
	)
}
