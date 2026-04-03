---
name: data-contracts
location: .haiku/intents/{intent-slug}/knowledge/DATA-CONTRACTS.md
scope: intent
format: text
required: true
---

# Data Contracts

API, database, and event contracts that define the data shapes flowing through the system. This output is the agreement between frontend and backend, between services, and between the system and its persistence layer.

## Content Guide

### API Endpoints

For each endpoint:
- **Method and path** (e.g., `POST /api/v1/users`)
- **Request schema** — field names, types, required vs. optional, validation rules
- **Response schema** — field names, types, shape for success and each error case
- **Error responses** — status codes, error body shape, when each error occurs
- **Authentication** — what auth is required, what scopes/roles

### Database Models

For each entity:
- **Entity name** and table/collection name
- **Fields** — name, type, nullable, default, constraints
- **Relationships** — foreign keys, join tables, cardinality
- **Indexes** — which fields are indexed and why
- **Constraints** — unique, check, not-null

### Event Schemas (if applicable)

For each event:
- **Event name** and topic/channel
- **Payload schema** — field names and types
- **Producer** — what emits this event
- **Consumers** — what listens for this event

## Quality Signals

- Every field has an explicit type and required/optional designation
- Error responses are specified alongside success responses
- Example values are provided for non-obvious fields
- Naming is consistent across all contracts (same entity name everywhere)
