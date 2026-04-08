---
title: Privacy Policy
description: How H·AI·K·U handles your data
order: 98
---

**Effective date:** April 8, 2026

H·AI·K·U is an open-source project maintained by GigSmart, Inc. This policy explains what data the plugin and website touch, where it goes, and what we don't do.

## The plugin runs locally

The H·AI·K·U plugin runs entirely inside your Claude Code environment. It reads and writes files on your local filesystem — intents, units, iteration state, configuration. None of that data is sent to GigSmart servers. We don't have a backend. We don't collect telemetry by default. Your code and project content stay on your machine.

## The website is static

The website at haikumethod.ai is a static Next.js site hosted on GitHub Pages. There are no user accounts, no login sessions, no tracking cookies, no analytics, no tracking pixels, and no ad networks.

## Optional third-party integrations

These only apply if you explicitly enable them:

**Sentry** — If you configure a `SENTRY_DSN` environment variable, crash reports (stack traces and error messages) are sent to the configured Sentry instance. These reports don't contain your code or project content. Don't set the env var and nothing gets sent.

**GitHub/GitLab OAuth** — The browse feature on the website uses OAuth to let you view your repos. The auth proxy (a Google Cloud Function) exchanges OAuth codes for access tokens but does not store or log them. Tokens are stored in your browser's localStorage only and are never sent to GigSmart.

**OpenTelemetry** — The plugin supports optional OpenTelemetry instrumentation. It's disabled by default. If you configure it, telemetry goes wherever you point it — that's your call.

## What we don't do

- We don't sell your data
- We don't share your data with third parties
- We don't run analytics or tracking pixels
- We don't use ad networks
- We don't collect personally identifiable information

## Changes

If this policy changes, the updated version will be posted here with a new effective date.

## Contact

Questions about privacy? Email [oss@gigsmart.com](mailto:oss@gigsmart.com).
