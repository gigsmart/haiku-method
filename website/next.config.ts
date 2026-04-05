import type { NextConfig } from "next"

const isDev = process.env.NODE_ENV === "development"

const nextConfig: NextConfig = {
	...(isDev ? {} : { output: "export" }),
	images: {
		unoptimized: true,
	},
	trailingSlash: true,
}

export default nextConfig
