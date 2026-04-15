import type { NextConfig } from "next"
import { withSentryConfig } from "@sentry/nextjs"

const isDev = process.env.NODE_ENV === "development"

const nextConfig: NextConfig = {
	...(isDev ? {} : { output: "export" }),
	// @haiku/review-ui and @haiku/shared are workspace packages that ship raw
	// TypeScript sources; Next needs to transpile them from node_modules.
	transpilePackages: ["@haiku/review-ui", "@haiku/shared"],
	images: {
		unoptimized: true,
	},
	trailingSlash: true,
}

export default withSentryConfig(nextConfig, {
	silent: true,
})
