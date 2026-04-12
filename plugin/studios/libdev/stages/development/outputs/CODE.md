---
name: code
location: (project source tree)
scope: repo
format: code
required: true
---

# Code

Library implementation output — code and tests written directly to the project source tree. This is not a document; it is the working library that satisfies the API surface contract and unit completion criteria.

## Content Guide

- **Match the API surface exactly** — every exported symbol's signature and error model
- **Write tests against the public API** — tests should look like consumer code, not internal inspection
- **Keep internal symbols clearly internal** — naming conventions, export gates, or language-specific visibility
- **Follow ecosystem idioms** — use the language's conventional patterns for libraries (e.g., Node.js package structure, Python packaging, Rust crate layout)

## Completion

Complete when all unit completion criteria pass verification, the reviewer approves, and `api-compatibility` confirms no unintended breaking changes.

## Quality Signals

- Public API matches the inception-phase API Surface document exactly
- Tests exercise every declared public entry point and error path
- Internal symbols are not accessible or re-exported by accident
- Code follows language/ecosystem idioms for libraries
