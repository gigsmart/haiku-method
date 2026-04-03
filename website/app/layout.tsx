import type { Metadata } from "next"
import Script from "next/script"
import {
	Footer,
	Header,
	SoftwareApplicationJsonLd,
	ThemeProvider,
	WebSiteJsonLd,
} from "./components"
import "./globals.css"

const SITE_URL = "https://ai-dlc.dev"
const SITE_TITLE = "AI-DLC — A H·AI·K·U Profile for Software Development"
const SITE_DESCRIPTION =
	"The software development profile of the H·AI·K·U universal lifecycle framework — structured human-AI collaboration from intent to deployment"

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
			"application/rss+xml": "/feed.xml",
			"application/atom+xml": "/atom.xml",
			"application/feed+json": "/feed.json",
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
