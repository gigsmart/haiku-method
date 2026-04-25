---
title: mongo-to-postgres-migration
studio: migration
stages: [assessment, mapping, migrate, validation, cutover]
status: complete
---

# User Service: MongoDB → Postgres

Migrate the user service from MongoDB to Postgres with a 2-week dual-write overlap. Collapse the accidentally-nested document shape into a proper relational model with foreign keys. Read traffic flips after the dual-write window; Mongo is decommissioned 7 days after read cutover.

## Goals

- Design the relational schema — users, profiles, sessions, auth_methods
- Dual-write path in the service (writes hit both stores atomically)
- Backfill job reconciling historical Mongo data into Postgres with checksum validation
- Read cutover with feature flag + instant rollback capability
- Zero data loss, zero duplicate identity rows post-cutover
