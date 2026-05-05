// state/schemas/_ajv.ts — Shared AJV instance for the per-schema files.
//
// One AJV instance compiles every state schema (unit / intent / stage
// state). Sharing it avoids duplicate compilation work and keeps a
// single configuration (`allErrors: true, strict: false`) — the
// permissive `strict: false` lets schemas use `additionalProperties:
// true` without AJV warning, and `allErrors: true` is what every
// `validateUnitFrontmatter` / handler caller relies on to surface
// every violation in one pass.
//
// Settings.yml validation has its own AJV instance — it needs to
// register provider sub-schemas via `addSchema` and we don't want
// those registrations leaking into the state schema validators.

import { Ajv } from "ajv"

export const stateAjv = new Ajv({ allErrors: true, strict: false })
