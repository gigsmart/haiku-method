---
name: production-incident
studio: incident-response
description: Respond to a production incident from triage through postmortem
parameters:
  - name: service
    description: Affected service or system
    required: true
  - name: severity
    description: "Severity: sev1, sev2, sev3"
    required: true
  - name: alert_url
    description: Link to the alert or monitoring dashboard
    required: false
units:
  - name: "triage"
    stage: triage
    criteria:
      - "Severity confirmed as {{ severity }}"
      - "Blast radius assessed (users, services, data)"
      - "Incident commander assigned"
  - name: "root-cause"
    stage: investigate
    criteria:
      - "Timeline reconstructed with evidence"
      - "Root cause identified (not just proximate trigger)"
      - "Contributing factors documented"
  - name: "stop-bleeding"
    stage: mitigate
    criteria:
      - "{{ service }} restored to functional state"
      - "Mitigation verified in production"
      - "No data loss or corruption from mitigation"
  - name: "permanent-fix"
    stage: resolve
    criteria:
      - "Fix addresses root cause, not just symptom"
      - "Regression test covers the failure scenario"
      - "Fix deployed and verified"
  - name: "postmortem"
    stage: postmortem
    criteria:
      - "Timeline accurate and complete"
      - "Action items assigned with owners and deadlines"
      - "Prevention measures identified"
---

Full incident response for production issues. Uses all 5 stages.
