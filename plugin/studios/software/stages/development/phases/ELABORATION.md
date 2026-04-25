# Development Stage — Elaboration

## Criteria Guidance

Every acceptance criterion **MUST** be paired with a command or condition that proves it. The FSM rejects prose-only criteria at advance time. If a criterion can't be expressed as an executable check, it's a spec gap — surface it via `ask_user_visual_question`, do not paper over with prose.

In the unit's structural form: the criterion goes in `## Completion criteria` (the goal), the executable check goes in `quality_gates:` frontmatter (the enforcer). Drafted as a pair; written as two coupled fields.

The verify-command examples below illustrate the **pattern**. Map them to the project's actual stack — read `package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod` etc. during elaboration to know which test runner, coverage tool, and linter the project uses, then write the gate against that.

### Good — criterion paired with verifying command

- "All API endpoints return correct status codes for success (200/201), validation errors (400), auth failures (401/403), and not-found (404)"
  - JS/TS: `pnpm test --run api/contracts.test.ts` exits 0
  - Python: `pytest tests/api/test_contracts.py` exits 0
  - Go: `go test ./api/contracts_test.go` exits 0

- "Test coverage is at least 80% for new code"
  - JS/TS: `pnpm coverage --check 80` exits 0
  - Python: `pytest --cov --cov-fail-under=80` exits 0
  - Rust: `cargo tarpaulin --fail-under 80` exits 0

- "No type-evasion in new code (typed-language equivalents of unsafe escape hatches)"
  - TS: `! grep -rnE ': any\b' --include='*.ts' src/ | grep -v '// eslint-disable.*no-explicit-any'`
  - Go: `! grep -rnE 'interface\{\s*\}' --include='*.go' .`
  - Python: `mypy --strict src/` exits 0

### Bad — vague (no clear check)

- "API works correctly" — what does correctly mean?
- "Tests are written" — how many? Which scenarios? What coverage?
- "Types are correct" — passes the type-checker? No escape hatches? No casts?

### Bad — specific but unverifiable

These look concrete but have no executable check. Catching them at elaboration prevents specs that *look* complete but produce nothing the FSM can enforce.

- "Code is well-organized" — no command proves "well-organized"
- "Performance is acceptable" — needs a numeric threshold AND a measurement command (e.g. `p95 < 200ms`)
- "Error messages are user-friendly" — needs a UX-review pass or a literal allow-list of acceptable phrasings
