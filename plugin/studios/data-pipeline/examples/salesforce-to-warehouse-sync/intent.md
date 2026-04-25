---
title: salesforce-to-warehouse-sync
studio: data-pipeline
stages: [discovery, extraction, transformation, validation, deployment]
status: complete
---

# Salesforce → Snowflake Opportunity Sync

Incremental 15-minute sync of Salesforce opportunity data into Snowflake. Land raw into `RAW.SFDC.OPPORTUNITY` and let the existing dbt graph take it from there. Incremental by `LastModifiedDate` — full snapshots previously exhausted the SFDC API quota.

## Goals

- Incremental extraction keyed on `LastModifiedDate` with high-water-mark checkpoint
- Raw landing in Snowflake `RAW.SFDC.OPPORTUNITY` with audit columns
- 15-minute orchestration cadence under the SFDC API rate limit
- dbt handoff validated against the existing opportunity fact model
- Zero data loss across run boundaries (verified by reconciliation job)
