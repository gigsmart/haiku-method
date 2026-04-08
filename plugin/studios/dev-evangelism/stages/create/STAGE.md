---
name: create
description: Produce the content — posts, slides, demos, videos
hats: [content-creator, demo-builder]
review: ask
elaboration: autonomous
unit_types: [blog-post, talk, demo, video]
inputs:
  - stage: narrative
    discovery: story-arc
---

# Create

## Criteria Guidance

Good criteria examples:
- "Blog post includes working code examples that the reader can copy-paste and run"
- "Talk slides follow a narrative arc with no slide exceeding 3 bullet points"
- "Demo runs end-to-end without manual setup steps beyond what the README documents"

Bad criteria examples:
- "Content is created"
- "Demo works"
- "Slides look good"

## Completion Signal (RFC 2119)

Content package **MUST** exist with all planned assets produced and technically verified. Code examples **MUST** compile and run. Demo builder **MUST** have validated that all demos are reproducible from a clean environment. Content creator **MUST** have verified that each asset follows the narrative arc and delivers the key takeaways defined in the narrative brief.
