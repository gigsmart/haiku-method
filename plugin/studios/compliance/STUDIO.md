---
name: compliance
description: Regulatory compliance lifecycle for audits, certifications, and policy management
stages: [scope, assess, remediate, document, certify]
category: governance
persistence:
  type: git
  delivery: pull-request
---

# Compliance Studio

Compliance lifecycle for managing regulatory requirements (SOC2, HIPAA, GDPR, ISO 27001, etc.). Covers scope definition, gap assessment, remediation, documentation, and certification. Uses git persistence because compliance often requires code/config changes and auditable history.
