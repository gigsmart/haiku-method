import type { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
	title: "Start Here - H·AI·K·U",
	description:
		"Everything you need to understand H·AI·K·U and start using it in your projects.",
	alternates: {
		canonical: "/docs/installation/",
	},
}

export default function StartHerePage() {
	redirect("/docs/installation/")
}
