---
name: new-customer-onboarding
studio: customer-success
description: Onboard a new customer from kickoff through initial value realization
parameters:
  - name: company
    description: Customer company name
    required: true
  - name: deal_context
    description: Link to deal context from sales handoff
    required: false
  - name: tier
    description: "Customer tier: enterprise, growth, starter"
    required: false
    default: growth
units:
  - name: "technical-setup"
    stage: onboarding
    criteria:
      - "{{ company }} environment provisioned and accessible"
      - "SSO/auth configured and tested"
      - "Data migration completed (if applicable)"
  - name: "kickoff"
    stage: onboarding
    criteria:
      - "Kickoff meeting completed with key stakeholders"
      - "Success milestones agreed and documented"
      - "Training schedule established"
  - name: "feature-adoption"
    stage: adoption
    criteria:
      - "Core features activated by at least 3 users"
      - "Usage reaches baseline threshold for {{ tier }} tier"
      - "First business outcome achieved"
  - name: "health-baseline"
    stage: health-check
    criteria:
      - "Health score established with baseline metrics"
      - "Account risk factors assessed"
      - "Quarterly review cadence confirmed"
---

Standard onboarding for new customers. Typically triggered by a sales deal close.
