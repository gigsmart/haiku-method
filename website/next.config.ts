import type { NextConfig } from "next"
import { withSentryConfig } from "@sentry/nextjs"

const isDev = process.env.NODE_ENV === "development"

const nextConfig: NextConfig = {
	...(isDev ? {} : { output: "export" }),
	images: {
		unoptimized: true,
	},
	trailingSlash: true,
}

export default withSentryConfig(nextConfig, {
	// Suppress source map upload (no auth token configured yet)
	silent: true,
	// Disable automatic instrumentation that requires a server runtime
	// (this is a statically exported site)
	disableLogger: true,
})
