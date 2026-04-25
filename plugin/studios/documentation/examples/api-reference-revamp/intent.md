---
title: api-reference-revamp
studio: documentation
stages: [audit, outline, draft, review, publish]
status: complete
---

# API Reference Revamp

Rebuild the public API reference from the OpenAPI spec, add hand-written request/response examples for every endpoint, and ship versioned docs for the latest and previous-major versions. Older versions are EOL'd.

## Goals

- Generate endpoint pages from the OpenAPI spec (single source of truth)
- Hand-write one realistic request/response example per endpoint
- Two-version navigation: latest + previous-major, older versions redirect to EOL page
- Dogfood the docs by running every example in CI
