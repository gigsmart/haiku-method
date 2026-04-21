---
title: >-
  FeedbackCreateRequest.anchor field: unit spec diverges from product data
  contract
status: rejected
origin: adversarial-review
author: completeness (from product)
author_type: agent
created_at: '2026-04-21T20:23:21Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 0
upstream_stage: product
---

## Gap

`knowledge/DATA-CONTRACTS.md` §1.1 (`haiku_feedback`), §3.3 (Frontmatter Fields) and §2.2 (`POST /api/feedback/{intent}/{stage}`) do **not** document the `anchor` block. `grep -n 'anchor\|pageId\|viewportWidth\|viewportHeight' knowledge/DATA-CONTRACTS.md` returns zero matches.

However:
- `stages/development/units/unit-01-extract-haiku-api-package.md:79` and `:108` require `FeedbackCreateRequest` to accept `anchor: { pageId, x, y, viewportWidth, viewportHeight }`.
- `stages/development/units/unit-13-annotation-canvas.md:64` requires the annotation popover to `validate against haiku-api's FeedbackCreateRequest *including the anchor field (pageId, x, y, viewportWidth, viewportHeight — added to schema in unit-01)*`.

So two development units make the `anchor` block a contract requirement for annotation persistence, yet the product-stage data contract (the source of truth per `stages/product/units/unit-03-data-contracts.md`'s completion criteria: "every field has explicit type, required/optional, and validation rules") never specifies it. Nullability, required/optional status, validation rules (x/y bounds, viewport min/max), and storage location inside the feedback file frontmatter are all unspecified.

## Impact

A reviewer tracing the annotation-to-feedback flow from a pin-drop back to the persisted feedback file cannot tell: (1) whether `anchor` is required when origin=`user-visual`, (2) what coordinate system x/y use (pixels? normalized? DPI-adjusted?), (3) whether viewportWidth/Height are the artifact's or the browser window's, (4) what happens if anchor is present on create but the image later changes resolution, (5) whether the file-schema `anchor` is stored in frontmatter or body.

## Required remedy

Extend `knowledge/DATA-CONTRACTS.md` §1.1, §2.2, and §3.3 with the `anchor` sub-schema: field-by-field types, units, validation bounds, nullability, and a worked example for a pin-anchored feedback file. Update `features/feedback-crud.feature` and/or add a new scenario in `features/review-ui-feedback.feature` covering pin-annotation persistence end-to-end.

---

**Rejection reason:** Rejected as upstream — FB-45 captures the same anchor schema gap at development scope (tsc is failing on missing FeedbackAnchorSchema). When development adds the anchor field to haiku-api during the FB-45 fix, DATA-CONTRACTS.md §1.1/§2.2/§3.3 will be updated inline with the field-by-field sub-schema. No need to revisit product.
