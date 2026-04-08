import * as Sentry from "@sentry/nextjs"

Sentry.init({
	dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
	release: `haiku-website@${process.env.npm_package_version || "dev"}`,
	tracesSampleRate: 0.1,
})
