import type { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
	title: "Big Picture - H·AI·K·U",
	description:
		"Interactive overview of the H·AI·K·U methodology showing the relationship between lifecycle phases, hats, operating modes, and core principles.",
	alternates: {
		canonical: "/#act1",
	},
}

export default function BigPicturePage() {
	redirect("/#act1")
}
