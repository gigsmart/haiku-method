---
name: adopt
description: Reverse-engineer an existing feature into H·AI·K·U intent artifacts
---

# Adopt

Reverse-engineer an existing feature into H·AI·K·U intent artifacts for `/haiku:operate`.

## Process

### Phase 0 — Pre-checks
- Reject cowork mode
- Verify git repository
- Check for slug conflicts

### Phase 1 — Gather description
- Get feature description
- Ask for code paths (specific directories or search whole repo)
- Ask for git references (PRs, branches, date range)

### Phase 2 — Feature exploration (5 parallel subagents)
1. Code path analysis (modules, entry points, dependencies)
2. Git history analysis (commit groups, PR boundaries, timeline)
3. Test analysis (test files, coverage patterns, verified behaviors)
4. CI configuration analysis (pipelines, quality gates)
5. Deployment surface analysis (containers, infra, monitoring)

### Phase 3 — Propose intent and units (user confirms)
### Phase 4 — Reverse-engineer success criteria from tests
### Phase 5 — Generate operational plan (if operational surface found)
### Phase 6 — Write artifacts (intent.md, unit files, discovery.md, operations/)
### Phase 7 — Handoff (summary + next steps)

**CRITICAL:** MUST NOT modify existing code. All artifacts have status: completed.
Wait for user confirmation at each gate (Phase 3, 4, 5).
