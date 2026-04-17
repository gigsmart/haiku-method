# Validation Stage — Elaboration

## Criteria Guidance

Good criteria examples:
- "Data quality checks cover uniqueness, not-null constraints, referential integrity, and accepted value ranges for every target table"
- "Row count reconciliation between source and target is within the agreed tolerance (e.g., < 0.1% variance)"
- "Business rule tests verify at least 3 known edge cases per critical transformation (e.g., timezone handling, currency conversion, null propagation)"

Bad criteria examples:
- "Data quality is validated"
- "Tests pass"
- "Business rules are checked"
