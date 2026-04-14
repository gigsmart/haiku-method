---
name: reconnaissance
description: Passive and active information gathering about the target
hats: [osint-analyst, network-mapper]
review: auto
elaboration: autonomous
inputs: []
---

# Reconnaissance

## Criteria Guidance

Good criteria examples:
- "Target profile documents at least 5 external-facing services with technology stack identified for each"
- "OSINT findings include DNS records, WHOIS data, and publicly indexed endpoints with timestamps"
- "Network map identifies all in-scope IP ranges, subdomains, and ingress points with confidence ratings"

Bad criteria examples:
- "Recon is complete"
- "Target information gathered"
- "Network has been mapped"

## Completion Signal (RFC 2119)

Target profile **MUST** exist with synthesized findings from both passive and active reconnaissance. All discovered assets are cataloged with technology fingerprints, version information where available, and confidence ratings. Network topology **MUST** be documented. OSINT findings are timestamped and sourced. The attack surface is mapped at a high level with areas of interest flagged for enumeration.
