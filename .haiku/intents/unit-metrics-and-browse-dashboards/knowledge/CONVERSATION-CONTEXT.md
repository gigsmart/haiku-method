# Conversation Context

User wants observability into H·AI·K·U workstreams. Decisions from prelaboration: (1) Metrics scope = tokens (in/out/cache), wall-clock duration, USD cost estimates. (2) Granularity = per bolt, rolled up to unit. (3) Data source = Claude Code transcript files at ~/.claude/projects/**/*.jsonl — parse assistant turns for usage data. (4) Dashboards in browse app = intent-level overview, studio/stage throughput, hat efficiency, time-series trends. Metrics must persist on disk in unit state so they're queryable without re-parsing transcripts each time.
