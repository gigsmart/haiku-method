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

const SITE_TITLE = "AI-DLC - AI-Driven Development Lifecycle"

export const metadata: Metadata = {
	title: {
		default: SITE_TITLE,
		template: "%s - AI-DLC",
	},
	description: SITE_DESCRIPTION,
	metadataBase: new URL(SITE_URL),
	openGraph: {
		title: "AI-DLC",
		description: SITE_DESCRIPTION,
		url: SITE_URL,
		siteName: "AI-DLC",
		type: "website",
		locale: "en_US",
		images: [
			{
				url: "/og-image.png",
				width: 1200,
				height: 630,
				alt: "AI-DLC - AI-Driven Development Lifecycle",
			},
		],
	},
	twitter: {
		card: "summary_large_image",
		title: "AI-DLC",
		description: SITE_DESCRIPTION,
		images: ["/og-image.png"],
	},
	alternates: {
		canonical: SITE_URL,
		types: {
			"application/rss+xml": [
				{ url: "/feed.xml", title: "AI-DLC — All" },
				{ url: "/blog/feed.xml", title: "AI-DLC — Blog" },
				{ url: "/changelog/feed.xml", title: "AI-DLC — Changelog" },
			],
			"application/atom+xml": [
				{ url: "/atom.xml", title: "AI-DLC — All" },
				{ url: "/blog/atom.xml", title: "AI-DLC — Blog" },
				{ url: "/changelog/atom.xml", title: "AI-DLC — Changelog" },
			],
			"application/feed+json": [
				{ url: "/feed.json", title: "AI-DLC — All" },
				{ url: "/blog/feed.json", title: "AI-DLC — Blog" },
				{ url: "/changelog/feed.json", title: "AI-DLC — Changelog" },
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
					name="AI-DLC"
					url={SITE_URL}
					description={SITE_DESCRIPTION}
				/>
				<SoftwareApplicationJsonLd
					name="AI-DLC"
					description={SITE_DESCRIPTION}
					url={SITE_URL}
					applicationCategory="DeveloperApplication"
					operatingSystem="Cross-platform"
					offers={{ price: "0", priceCurrency: "USD" }}
				/>
			</head>
			<body className="flex min-h-screen flex-col bg-white text-gray-900 antialiased dark:bg-gray-950 dark:text-gray-100">
				<ThemeProvider>
					<Header />
					<main className="flex-1">{children}</main>
					<Footer />
				</ThemeProvider>
			</body>
		</html>
	)
}
