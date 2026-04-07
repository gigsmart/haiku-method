---
name: extraction
description: Design and implement data extraction from sources
hats: [extractor, connector-reviewer]
review: ask
unit_types: [extraction]
inputs:
  - stage: discovery
    discovery: source-catalog
---

# Extraction

## Criteria Guidance

Good criteria examples:
- "Extraction logic handles incremental loads using watermark columns identified in discovery"
- "Connector includes retry logic with exponential backoff and dead-letter handling for failed records"
- "Schema drift detection raises alerts rather than silently dropping or truncating columns"

Bad criteria examples:
- "Extraction works"
- "Data is pulled from sources"
- "Connectors are configured"

## Completion Signal (RFC 2119)

Extraction jobs exist for all sources identified in discovery. Each job handles full and incremental loads, includes error handling and retry logic, respects source system rate limits, and lands raw data in the staging area with extraction metadata (timestamp, source, batch ID). Connector reviewer **MUST** have **MUST** be verified idempotency and schema drift handling.
