import type { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
	title: "About - H·AI·K·U",
	description:
		"H·AI·K·U is a methodology for structured human-AI collaboration — from intent to delivery across any domain.",
	alternates: {
		canonical: "/#prologue",
	},
}

export default function AboutPage() {
	redirect("/#prologue")
}
