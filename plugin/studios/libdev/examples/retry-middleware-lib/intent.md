---
title: retry-middleware-lib
studio: libdev
stages: [inception, development, security, release]
status: complete
---

# Retry Middleware Library

Extract the in-house retry logic into a standalone open-source middleware library for Node and Bun runtimes. Default strategy is exponential backoff with decorrelated jitter; users can plug custom strategies via interface.

## Goals

- Node + Bun support; no Deno in initial release
- Decorrelated-jitter exponential backoff as the default strategy
- Pluggable strategy interface with at least 3 built-ins (fixed, exponential, decorrelated-jitter)
- 100% branch coverage, fuzz-tested failure injection
- Semver 1.0.0 release with migration notes from the internal version
