import type { Metadata } from "next"
import { Header } from "./components/Header"
import { Footer } from "./components/Footer"
import "./globals.css"

const SITE_URL = "https://haikumethod.ai"
const SITE_TITLE = "HAIKU - Human AI Knowledge Unification"
const SITE_DESCRIPTION =
	"A universal framework for structured human-AI collaboration across any domain."

export const metadata: Metadata = {
	title: {
		default: SITE_TITLE,
		template: "%s - HAIKU",
	},
	description: SITE_DESCRIPTION,
	metadataBase: new URL(SITE_URL),
	openGraph: {
		title: "HAIKU",
		description: SITE_DESCRIPTION,
		url: SITE_URL,
		siteName: "HAIKU",
		type: "website",
		locale: "en_US",
	},
	twitter: {
		card: "summary_large_image",
		title: "HAIKU",
		description: SITE_DESCRIPTION,
	},
	alternates: {
		canonical: SITE_URL,
	},
}

export default function RootLayout({
	children,
}: {
	children: React.ReactNode
}) {
	return (
		<html lang="en">
			<body className="flex min-h-screen flex-col bg-white text-stone-900 antialiased">
				<Header />
				<main className="flex-1">{children}</main>
				<Footer />
			</body>
		</html>
	)
}
