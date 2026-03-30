import type { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
	title: "Big Picture - AI-DLC",
	description:
		"Interactive overview of the AI-DLC methodology showing the relationship between development phases, hats, operating modes, and core principles.",
	alternates: {
		canonical: "/#act1",
	},
}

export default function BigPicturePage() {
	redirect("/#act1")
}
