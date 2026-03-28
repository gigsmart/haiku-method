---
name: backpressure
description: Use when implementing or understanding backpressure in AI-DLC workflows. Covers quality gates, Stop hooks, and how automated enforcement guides AI behavior toward quality.
user-invocable: false
allowed-tools:
  - Read
  - Bash
  - Grep
  - Glob
---

# AI-DLC Backpressure

Backpressure is automated enforcement that blocks progress until quality standards are met. Instead of prescribing process steps, backpressure creates natural incentives for quality.

## The Problem with Prescription

Traditional development processes prescribe steps:

```markdown
1. Write tests first
2. Run linter before commit
3. Get code review approval
4. Deploy to staging before production
```

These become checkbox exercises:
- Teams learn to game the process
- Quality checks become formalities
- "Did you run the linter?" → "Yes" (actually: no)

## The Backpressure Alternative

Backpressure makes quality gates **blocking**:

```bash
# You cannot proceed until tests pass
bun test || exit 1

# You cannot proceed until lint is clean
biome check || exit 1

# You cannot proceed until types check
tsc --noEmit || exit 1
```

The AI learns to satisfy these constraints naturally because it **cannot complete work** until they pass.

## How Backpressure Works

### The Feedback Loop

```
AI writes code
      ↓
Stop hook runs backpressure checks
      ↓
┌─────────────────────────────────┐
│ Tests pass?                      │
│ Lint clean?                      │
│ Types check?                     │
└─────────────────────────────────┘
      ↓                    ↓
   PASS                  FAIL
      ↓                    ↓
 Proceed            Fix and retry
```

### Behavioral Learning

Over iterations, the AI learns:
- "If I don't write tests, I'll be blocked"
- "If I introduce type errors, I'll have to fix them"
- "Lint errors mean more work for me"

This creates intrinsic motivation for quality, not extrinsic compliance.

## Types of Backpressure

### 1. Test Backpressure

```yaml
# han-plugin.yml
hooks:
  test:
    command: bun test
    event: Stop
```

**Effect:** AI cannot complete work if tests fail.

**AI learns to:**
- Write tests for new code
- Fix broken tests immediately
- Consider test implications of changes

### 2. Type Backpressure

```yaml
hooks:
  typecheck:
    command: tsc --noEmit
    event: Stop
```

**Effect:** AI cannot complete work with type errors.

**AI learns to:**
- Write type-safe code
- Fix type errors before moving on
- Use proper TypeScript patterns

### 3. Lint Backpressure

```yaml
hooks:
  lint:
    command: biome check
    event: Stop
```

**Effect:** AI cannot complete work with lint violations.

**AI learns to:**
- Follow code style automatically
- Use consistent patterns
- Avoid common anti-patterns

### 4. Build Backpressure

```yaml
hooks:
  build:
    command: bun run build
    event: Stop
```

**Effect:** AI cannot complete work if build fails.

**AI learns to:**
- Write code that compiles
- Handle build dependencies
- Fix import/export issues

### 5. Security Backpressure

```yaml
hooks:
  security:
    command: npm audit --audit-level=high
    event: Stop
```

**Effect:** AI cannot introduce vulnerable dependencies.

**AI learns to:**
- Choose secure dependencies
- Update vulnerable packages
- Consider security implications

### 6. Visual Fidelity Backpressure

Visual fidelity backpressure uses AI vision to compare built output against design references. Unlike the other backpressure types (which run shell commands), this one is orchestrated by the reviewer agent using screenshot capture and vision comparison.

**How it works:**

1. **Gate detection** (`detect-visual-gate.sh`) — A 5-point heuristic determines if the unit produces user-visible output. Any single match activates the gate:
   - Unit discipline is `frontend` or `design`
   - Unit has a `design_ref:` field in frontmatter
   - Unit has a `wireframe:` field in frontmatter
   - Changed files include UI extensions (`.tsx`, `.jsx`, `.vue`, `.svelte`, `.html`, `.css`, `.scss`)
   - Unit spec body mentions UI terms (page, view, screen, component, layout, dashboard, form)

2. **Reference resolution** (`resolve-design-ref.sh`) — Resolves the design reference using a 3-level priority hierarchy:
   - **External design** (`design_ref:` field) — fidelity: **high** (pixel-close match expected)
   - **Previous iteration** (`iterates_on` screenshots) — fidelity: **medium** (structural similarity)
   - **Wireframe** (`wireframe:` field) — fidelity: **low** (layout/structure only)

3. **Screenshot capture** (`capture-screenshots.sh`) — Pluggable capture system with two providers:
   - **Playwright** — Headless Chromium capture from a URL or static HTML at multiple breakpoints (default: 375, 768, 1280)
   - **Manual** — Copies pre-captured images with correct naming and manifest

4. **Vision comparison** — The reviewer agent reads reference and built screenshots side-by-side, applies the fidelity-appropriate prompt (`vision-comparison-prompt.md`), and scores findings by category and severity.

**Effect:** AI cannot ship UI that visually diverges from the design reference.

**AI learns to:**
- Reproduce design references accurately
- Match layouts, colors, and typography to design intent
- Handle responsive breakpoints correctly
- Fix visual regressions before re-submitting

**Hard gate:** If the visual gate is active and comparison produces high-severity findings, the reviewer MUST issue `REQUEST CHANGES`. Infrastructure failures (capture errors, missing references, dev server down) also block approval — the gate is never silently skipped.

## Implementing Backpressure

### In Han Plugins

Create a `han-plugin.yml`:

```yaml
hooks:
  test:
    command: bun test
    event: Stop
    if_changed:
      - "**/*.ts"
      - "**/*.tsx"

  lint:
    command: biome check
    event: Stop
    if_changed:
      - "**/*.ts"
      - "**/*.tsx"
      - "**/*.json"
```

### In Project Configuration

Add to `.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun test && biome check"
          }
        ]
      }
    ]
  }
}
```

### Smart Caching

Han caches hook results to avoid redundant runs:

```yaml
hooks:
  test:
    command: bun test
    if_changed:
      - "src/**/*.ts"
      - "test/**/*.ts"
```

Hook only runs if matching files changed since last successful run.

## Backpressure Strategies

### Graduated Strictness

Start lenient, increase strictness as codebase matures:

**Phase 1:** Only test backpressure
```yaml
hooks:
  test:
    command: bun test
```

**Phase 2:** Add type checking
```yaml
hooks:
  test:
    command: bun test
  typecheck:
    command: tsc --noEmit
```

**Phase 3:** Add linting
```yaml
hooks:
  test:
    command: bun test
  typecheck:
    command: tsc --noEmit
  lint:
    command: biome check
```

### Scope-Based Strictness

Different rules for different areas:

```yaml
hooks:
  # Strict for API
  api-test:
    command: bun test src/api
    dirs_with:
      - src/api

  # Lenient for internal tools
  tools-lint:
    command: biome check --warn-only tools/
    dirs_with:
      - tools
```

### Escape Hatches

For genuine exceptions:

```yaml
hooks:
  lint:
    command: biome check
    # Skip if explicitly marked
    skip_if:
      - ".biome-skip"
```

Use sparingly—escape hatches undermine backpressure.

## AI Adaptation Patterns

### Pattern 1: Preemptive Quality

AI learns to write quality code upfront:

```typescript
// AI now writes this automatically because
// it knows backpressure will catch issues

function parseUser(data: unknown): User {
  // Type guard (avoids type errors)
  if (!isValidUserData(data)) {
    throw new Error("Invalid user data");
  }

  // Proper typing (avoids lint warnings)
  const user: User = {
    id: data.id,
    name: data.name,
  };

  return user;
}

// Test included (avoids test failures)
test("parseUser handles invalid data", () => {
  expect(() => parseUser({})).toThrow();
});
```

### Pattern 2: Incremental Fixes

AI fixes issues as they arise:

```
Iteration 1: Write feature
→ Tests fail
Iteration 2: Fix tests
→ Lint errors
Iteration 3: Fix lint
→ All pass, proceed
```

### Pattern 3: Context Learning

AI remembers project patterns:

```
"This project uses zod for validation"
"This project requires tests for all API endpoints"
"This project uses snake_case for database columns"
```

### Pattern 4: Design Fidelity

AI learns to reproduce design references accurately:

```
Iteration 1: Build UI from spec
→ Visual fidelity review: layout wrong, colors off
Iteration 2: Fix layout structure, match color tokens
→ Visual fidelity review: responsive breakpoint broken
Iteration 3: Fix mobile layout
→ All pass, proceed
```

Over time, the AI preemptively checks design references and matches them during initial implementation.

## Measuring Backpressure Effectiveness

### Hook Pass Rates

Use Claude Code's built-in metrics and session analysis (via `/reflect`) to track these indicators.

Good indicators:
- First-attempt pass rate increasing over time
- Fewer iterations to achieve pass
- AI preemptively addressing common issues

### Quality Metrics

Track over time:
- Test coverage
- Lint error density
- Type coverage
- Build success rate

## Backpressure Anti-Patterns

### Too Strict Too Soon

❌ Adding all checks on day one
✅ Gradually increasing strictness

### Ignoring Failures

❌ Using `|| true` to ignore failures
✅ Fixing root causes

### Slow Checks

❌ 5-minute test suite blocking every iteration
✅ Fast, focused checks; slow checks in CI

### Unclear Failures

❌ Cryptic error messages
✅ Actionable feedback with fix suggestions

### Wireframe Excuse

❌ "It's just a wireframe, visual fidelity doesn't matter"
✅ Low fidelity still checks structure and layout — only colors and typography are skipped

### Skipping the Visual Gate

❌ Silently skipping visual comparison when infrastructure fails
✅ Infrastructure failures block approval — fix capture, don't skip the gate

### Ignoring Fidelity Levels

❌ Holding wireframe references to pixel-perfect standards
✅ Fidelity level adjusts tolerance: high = pixel-close, medium = structural, low = layout only

## Integration with AI-DLC

### During Building (OHOTL)

Backpressure guides autonomous work:
1. AI writes code
2. Stop hook runs checks
3. Failures → AI fixes in next iteration
4. Passes → Work complete

### During Review (HITL)

Backpressure pre-filters issues:
1. AI ensures backpressure passes
2. Human reviews only quality-verified code
3. Reduces human burden
4. Focuses review on design/logic, not style

### Iteration Efficiency

Good backpressure reduces iterations:
- Without: 5 iterations (human catching issues)
- With: 2 iterations (AI self-correcting)

## Summary

Backpressure is:
- **Blocking** - Cannot proceed until satisfied
- **Automated** - No human enforcement needed
- **Educational** - AI learns from failures
- **Efficient** - Catches issues early

Implementation:
- Use Han hooks for Stop events
- Start simple, add strictness gradually
- Cache results for performance
- Provide clear error messages

Result: AI naturally produces higher-quality code because the system won't accept less.
