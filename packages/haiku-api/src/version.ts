/**
 * Package-version constant surfaced in the OpenAPI `info.version` field.
 *
 * Kept as a tiny self-contained module so the TypeScript emit stays free of
 * `import.meta`/JSON-assertion dependencies (which vary across NodeNext vs
 * bundler targets). Bump in lockstep with `package.json`.
 */
export const PACKAGE_VERSION = "0.1.0"
