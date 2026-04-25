# Development Stage — Elaboration

## Criteria Guidance

The verify-command examples below illustrate the **pattern**. Map them to the project's actual stack — read `package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod` during elaboration to know which test runner, coverage tool, and linter the project uses, then write the gate against that.

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
