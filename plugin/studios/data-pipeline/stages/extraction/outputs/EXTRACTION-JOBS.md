---
name: extraction-jobs
location: (project source tree)
scope: repo
format: code
required: true
---

# Extraction Jobs

Implemented extraction logic for all identified data sources.

## Expected Artifacts

- **Extraction scripts** -- jobs for each source handling full and incremental loads
- **Error handling** -- retry logic with exponential backoff and dead-letter handling
- **Schema drift detection** -- alerting for unexpected schema changes
- **Staging output** -- raw data landed in staging area with extraction metadata (timestamp, source, batch ID)

## Quality Signals

- Extraction jobs exist for all sources identified in discovery
- Each job handles both full and incremental loads
- Jobs are idempotent and respect source system rate limits
- Schema drift raises alerts rather than silently dropping columns
