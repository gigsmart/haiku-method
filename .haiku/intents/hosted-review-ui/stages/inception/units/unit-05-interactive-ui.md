---
status: pending
type: frontend
depends_on: [session-bridge]
---

# Interactive UI (Question + Design Direction)

## Scope
Port the question page and design direction picker from the review app to the website. Question page: radio/checkbox options, image display, "Other" field, multi-question support. Design direction picker: archetype cards with preview HTML, tunable parameter sliders. Both submit answers back to the local API.

## Completion Criteria
- `website/app/question/[encoded]/page.tsx` renders question form with all option types
- Question answers submit to local API and MCP tool receives them
- `website/app/direction/[encoded]/page.tsx` renders archetype cards with parameter sliders
- Design direction selection submits to local API and MCP tool receives it
- Image display works for question pages (images served from local API)
