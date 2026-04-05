---
name: api-documentation
studio: documentation
description: Document a new or updated API
parameters:
  - name: api
    description: API name or module being documented
    required: true
  - name: openapi_url
    description: Link to OpenAPI spec if available
    required: false
units:
  - name: "coverage-audit"
    stage: audit
    criteria:
      - "All {{ api }} endpoints inventoried"
      - "Existing documentation gaps identified"
      - "Priority ranked by endpoint usage"
  - name: "structure"
    stage: outline
    criteria:
      - "Information architecture follows task-based organization"
      - "Each endpoint has: description, parameters, examples, errors"
  - name: "write"
    stage: draft
    criteria:
      - "All endpoints documented with working code examples"
      - "Authentication and error handling sections complete"
      - "Examples tested against current API version"
  - name: "review"
    stage: review
    criteria:
      - "Technical accuracy verified against implementation"
      - "Code examples compile and produce expected output"
      - "No jargon without definition"
---

API documentation from audit through publish.
