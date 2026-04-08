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
	silent: true,
})
