---
name: api-surface
location: .haiku/intents/{intent-slug}/knowledge/API-SURFACE.md
scope: intent
format: text
required: true
---

# API Surface

The public contract this library exposes to consumers. Once published, changes to this surface are breaking changes. This document is the canonical reference for what consumers can depend on.

## Content Guide

### Public Entry Points
- **Every exported symbol** — functions, classes, types, constants, modules
- **Signatures** — full type signatures for every public symbol (parameters, return types, throws)
- **Purpose** — one-line description of what each entry point is for

### Error Model
- **Error mechanism** — how errors are surfaced (exceptions, result types, error callbacks, sentinel values)
- **Error classes/codes** — complete enumeration of error types consumers may encounter
- **Error stability** — which error types are part of the public contract (and thus breaking to change)

### Extension Points
- **Customization hooks** — how consumers extend or customize behavior (plugins, middleware, subclassing, config)
- **Stability of extension points** — which extension points are stable vs. experimental

### Semver Policy
- **What constitutes a breaking change** — signature changes are obvious; behavioral changes, new required parameters, stricter validation, and error-type changes all count
- **Deprecation policy** — how long deprecated APIs remain before removal

### Stability Tiers
- **Stable** — full semver guarantees
- **Experimental** — subject to change without major version bump, opt-in only
- **Internal** — not part of public contract, consumers must not depend on

## Quality Signals

- Every exported symbol is documented with full type signature
- Error model is complete — consumers know every error they can receive
- Extension points are explicit about stability
- Semver policy answers "is X a breaking change?" for non-obvious cases
