---
name: product-launch
studio: marketing
description: Launch campaign for a new product or feature
parameters:
  - name: product
    description: Product or feature being launched
    required: true
  - name: launch_date
    description: Target launch date
    required: false
  - name: target_audience
    description: Primary audience segment
    required: false
units:
  - name: "audience-research"
    stage: research
    criteria:
      - "Target audience for {{ product }} defined with observable characteristics"
      - "Competitive messaging landscape mapped"
      - "Key differentiators identified"
  - name: "messaging-framework"
    stage: strategy
    criteria:
      - "Core messaging defined (headline, value props, proof points)"
      - "Channel strategy aligned with audience behavior"
      - "KPIs defined with targets"
  - name: "launch-assets"
    stage: content
    criteria:
      - "Landing page copy finalized"
      - "Email sequences drafted"
      - "Social content calendar populated"
  - name: "go-live"
    stage: launch
    criteria:
      - "All assets live and tracking verified"
      - "Distribution channels activated"
      - "Day-1 metrics baseline captured"
---

Product launch campaign through the full marketing lifecycle.
