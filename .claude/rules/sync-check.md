# Sync Check Rule

Before completing any work that modifies the plugin, paper, or website, verify cross-component consistency:

## After modifying plugin/skills/ or plugin/hats/:
- [ ] Is the concept documented in the paper?
- [ ] Does the website docs section reference it (if user-facing)?

## After modifying the paper:
- [ ] Does the plugin implement what the paper describes?
- [ ] If aspirational (not yet implemented), is it clearly marked as such?

## After modifying website/content/:
- [ ] Are claims about the methodology accurate to the paper?
- [ ] Are claims about the plugin accurate to the implementation?

## After adding or renaming terminology:
- [ ] Updated in paper glossary
- [ ] Updated in plugin fundamentals skill
- [ ] Updated in all hat/skill files that reference it
- [ ] Updated in website docs

## Terminology reminders:
- Bolt = iteration cycle (tracked as `iteration` in state), NOT the same as Unit
- Pass = typed disciplinary iteration (design/product/dev), optional and configurable
- Intent/Unit/Bolt are the three-layer hierarchy, all distinct concepts
