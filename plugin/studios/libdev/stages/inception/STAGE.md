---
name: inception
description: Understand the problem, define API surface, and elaborate into units
hats: [researcher, api-architect, elaborator]
review: ask
elaboration: collaborative
unit_types: [research]
inputs: []
---

# Inception

Library inception covers both discovery (what problem does this solve, who are the target consumers, what's the competitive landscape) AND API shape
(public surface, semver policy, extension points, error model). Unlike
application development there is no separate product or design phase — API
decisions are made here because the API *is* the product.

## Completion Signal (RFC 2119)

Discovery document **MUST** exist with problem statement and target consumers.
Public API surface **MUST** be specified with semver policy, error model, and
extension points identified. Units **MUST** have verifiable criteria. Unit DAG
**MUST** be acyclic.
