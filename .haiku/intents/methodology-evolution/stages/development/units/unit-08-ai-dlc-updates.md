---
name: unit-08-ai-dlc-updates
type: documentation
status: completed
depends_on: [unit-06-ai-dlc-integration, unit-07-haiku-website]
bolt: 0
hat: ""
started_at: null
completed_at: null
---


# unit-08: AI-DLC Website & Changelog Updates

## Description
Update the AI-DLC website (ai-dlc.dev) and changelog to reflect AI-DLC's new identity as the software development profile of H•AI•K•U. Add references to H•AI•K•U as the parent methodology. Update the changelog with all changes from this intent.

## Discipline
documentation

## Domain Entities
- Profile (AI-DLC as H•AI•K•U implementation), H•AI•K•U (referenced)

## Data Sources
- AI-DLC website (`website/` in AI-DLC repo)
- H•AI•K•U website (unit-07 output) — for consistent messaging
- AI-DLC plugin changes (unit-06 output) — for changelog content
- Changelog (`CHANGELOG.md` in AI-DLC repo root)

## Technical Specification

### Website Updates
- Add "Part of the H•AI•K•U Method" badge/reference on the AI-DLC homepage
- Link to haikumethod.ai for the universal methodology
- Update terminology: "Construction" -> "Execution" in all website content
- Add pages/sections for Operation and Reflection phases (as available in AI-DLC)
- Update the "Getting Started" flow to mention H•AI•K•U as the parent framework

### Changelog Entry
Add a changelog entry in Keep a Changelog format covering:
- H•AI•K•U integration: AI-DLC is now the software development profile of H•AI•K•U
- Phase rename: Construction -> Execution (`/execute` replaces `/construct`)
- New phases: Operation and Reflection available (opt-in)
- Backward compatibility: `/construct` still works as deprecated alias
- Quality gates now configurable via settings

### Paper Reference
If the AI-DLC paper needs updating:
- Add a note referencing the H•AI•K•U methodology paper
- Or replace the AI-DLC paper with a redirect to H•AI•K•U + an AI-DLC-specific addendum

## Success Criteria
- [ ] AI-DLC website references H•AI•K•U as the parent methodology
- [ ] "Construction" -> "Execution" in all AI-DLC website content
- [ ] Link to haikumethod.ai from AI-DLC website
- [ ] Changelog entry covers all changes from this intent
- [ ] Getting Started flow updated for H•AI•K•U context

## Risks
- **Messaging confusion**: Users might be confused about the relationship between AI-DLC and H•AI•K•U. Mitigation: clear, simple messaging — "AI-DLC is H•AI•K•U for software development."

## Boundaries
This unit updates AI-DLC's public-facing content. It does NOT modify the AI-DLC plugin (unit-06) or the H•AI•K•U website (unit-07).

## Notes
- Keep the messaging simple: "AI-DLC is how software teams use the H•AI•K•U method"
- Don't over-emphasize the rebrand — existing users should feel continuity, not disruption
- The changelog should follow Keep a Changelog format as established in the repo
