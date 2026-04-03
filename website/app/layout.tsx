import type { Metadata } from "next"
import Script from "next/script"
import { SITE_DESCRIPTION, SITE_URL } from "@/lib/feed"
import {
	Footer,
	Header,
	SoftwareApplicationJsonLd,
	ThemeProvider,
	WebSiteJsonLd,
} from "./components"
import "./globals.css"

const SITE_TITLE = "H·AI·K·U — Structured Human-AI Collaboration"

export const metadata: Metadata = {
	title: {
		default: SITE_TITLE,
		template: "%s - H·AI·K·U",
	},
	description: SITE_DESCRIPTION,
	metadataBase: new URL(SITE_URL),
	openGraph: {
		title: "H·AI·K·U",
		description: SITE_DESCRIPTION,
		url: SITE_URL,
		siteName: "H·AI·K·U",
		type: "website",
		locale: "en_US",
		images: [
			{
				url: "/og-image.png",
				width: 1200,
				height: 630,
				alt: "H·AI·K·U — Structured Human-AI Collaboration",
			},
		],
	},
	twitter: {
		card: "summary_large_image",
		title: "H·AI·K·U",
		description: SITE_DESCRIPTION,
		images: ["/og-image.png"],
	},
	alternates: {
		canonical: SITE_URL,
		types: {
			"application/rss+xml": [
				{ url: "/feed.xml", title: "H·AI·K·U — All" },
				{ url: "/blog/feed.xml", title: "H·AI·K·U — Blog" },
				{ url: "/changelog/feed.xml", title: "H·AI·K·U — Changelog" },
			],
			"application/atom+xml": [
				{ url: "/atom.xml", title: "H·AI·K·U — All" },
				{ url: "/blog/atom.xml", title: "H·AI·K·U — Blog" },
				{ url: "/changelog/atom.xml", title: "H·AI·K·U — Changelog" },
			],
			"application/feed+json": [
				{ url: "/feed.json", title: "H·AI·K·U — All" },
				{ url: "/blog/feed.json", title: "H·AI·K·U — Blog" },
				{ url: "/changelog/feed.json", title: "H·AI·K·U — Changelog" },
			],
		},
	},
	robots: {
		index: true,
		follow: true,
		googleBot: {
			index: true,
			follow: true,
			"max-video-preview": -1,
			"max-image-preview": "large",
			"max-snippet": -1,
		},
	},
}

export default function RootLayout({
	children,
}: {
	children: React.ReactNode
}) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<Script
					defer
					data-domain="ai-dlc.dev"
					src="https://plausible.io/js/script.js"
					strategy="afterInteractive"
				/>
				<WebSiteJsonLd
					name="H·AI·K·U"
					url={SITE_URL}
					description={SITE_DESCRIPTION}
				/>
				<SoftwareApplicationJsonLd
					name="H·AI·K·U"
					description={SITE_DESCRIPTION}
					url={SITE_URL}
					applicationCategory="DeveloperApplication"
					operatingSystem="Cross-platform"
					offers={{ price: "0", priceCurrency: "USD" }}
				/>
			</head>
			<body className="flex min-h-screen flex-col bg-white text-stone-900 antialiased dark:bg-stone-950 dark:text-stone-100">
				<ThemeProvider>
					<Header />
					<main className="flex-1">{children}</main>
					<Footer />
				</ThemeProvider>
			</body>
		</html>
	)
}
