---
name: migration
description: System and data migration lifecycle for platform transitions, version upgrades, and data moves
stages: [assessment, mapping, migrate, validation, cutover]
category: operations
persistence:
  type: git
  delivery: pull-request
---

# Migration Studio

Lifecycle for platform transitions, version upgrades, data moves, and system replacements.
Use this studio when work involves moving data or functionality from one system, schema,
or platform version to another — where integrity verification and rollback planning are
essential. Covers the full arc from inventory through production cutover.
