---
name: review
description: Pre-delivery code review with multi-agent fix loop
---

# Pre-Delivery Code Review

Run a multi-agent adversarial code review on the current branch's changes.

## Process

1. **Compute the diff** — Run `git diff main...HEAD` (or upstream branch). Also get `--stat` and `--name-only`.

2. **Load review context:**
   - Read `REVIEW.md` if it exists (review guidelines)
   - Read `CLAUDE.md` if it exists (project instructions)
   - Check `.haiku/settings.yml` for `review_agents` configuration

3. **Spawn review agents in parallel** — One subagent per review focus area:
   - Correctness
   - Security
   - Performance
   - Architecture
   - Test quality

   Each agent gets the full diff, review guidelines, and a focused mandate.

4. **Collect and process findings:**
   - Deduplicate by file+line, keeping higher severity
   - Filter out LOW findings unless total < 5
   - For HIGH findings: fix directly, commit, re-review (up to 3 cycles)

5. **Report:** APPROVED (no HIGH remaining) or NEEDS ATTENTION (user decides)

6. **Offer:** "Push and create PR" or "Done"
