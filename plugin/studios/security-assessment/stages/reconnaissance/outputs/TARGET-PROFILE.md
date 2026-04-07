---
name: target-profile
location: .haiku/intents/{intent-slug}/knowledge/
scope: intent
format: text
required: true
---

# Target Profile

Synthesized reconnaissance findings with asset catalog and attack surface map.

## Expected Artifacts

- **Asset catalog** -- discovered assets with technology fingerprints, version info, and confidence ratings
- **Network topology** -- documented infrastructure layout and ingress points
- **OSINT findings** -- DNS records, WHOIS data, and publicly indexed endpoints with timestamps
- **Attack surface overview** -- high-level map with areas of interest flagged for enumeration

## Quality Signals

- All discovered assets are cataloged with technology fingerprints
- Network topology is documented with ingress points identified
- OSINT findings are timestamped and sourced
- At least 5 external-facing services are identified with technology stack
