---
name: new-prospect
studio: sales
description: Work a new prospect from research through close
parameters:
  - name: company
    description: Prospect company name
    required: true
  - name: contact
    description: Primary contact name and title
    required: false
  - name: source
    description: Lead source (inbound, referral, outbound, event)
    required: false
units:
  - name: "prospect-research"
    stage: research
    criteria:
      - "{{ company }} business model and pain points documented"
      - "Decision makers and buying process mapped"
      - "Competitive landscape for this deal identified"
  - name: "qualify"
    stage: qualification
    criteria:
      - "ICP fit scored against standard criteria"
      - "Budget, authority, need, and timeline assessed"
      - "Go/no-go decision documented with rationale"
  - name: "proposal"
    stage: proposal
    criteria:
      - "Proposal tailored to {{ company }} pain points"
      - "Pricing within approved discount structure"
      - "Demo or proof of concept prepared if applicable"
  - name: "negotiate"
    stage: negotiation
    criteria:
      - "Terms reviewed by legal"
      - "Objections documented with responses"
      - "Final terms agreed by both parties"
  - name: "close-deal"
    stage: close
    criteria:
      - "Contract signed"
      - "CS handoff context prepared (goals, timeline, contacts)"
      - "Win/loss context documented"
---

Full sales cycle for a new prospect. CRM provider syncs deal state automatically.
