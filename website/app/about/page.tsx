import type { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
	title: "About - AI-DLC",
	description:
		"AI-DLC is a methodology born from the evolution of software development — from machine code to AI-driven autonomous workflows.",
	alternates: {
		canonical: "/#prologue",
	},
}

export default function AboutPage() {
	redirect("/#prologue")
}
