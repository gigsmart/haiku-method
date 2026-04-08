# Sync Check Rule

Before completing any work that modifies the plugin, paper, or website, verify cross-component consistency:

## After modifying plugin/studios/ or plugin/studios/*/stages/:
- [ ] Is the concept documented in the paper?
- [ ] Does the website docs section reference it (if user-facing)?
- [ ] Do requires/produces chains form a valid pipeline?

## After modifying the paper:
- [ ] Does the plugin implement what the paper describes?
- [ ] If aspirational (not yet implemented), is it clearly marked as such?

## After modifying website/content/:
- [ ] Are claims about the methodology accurate to the paper?
- [ ] Are claims about the plugin accurate to the implementation?

## After adding or renaming terminology:
- [ ] Updated in paper glossary
- [ ] Updated in CLAUDE.md terminology table
- [ ] Updated in all stage files that reference it
- [ ] Updated in website docs

## Terminology reminders:
- Studio = named lifecycle template (profile implementation), contains stages
- Stage = lifecycle phase within a studio, contains file-based hats and review gates
- Hat = behavioral role scoped to a stage (defined as files in `stages/{stage}/hats/`, not standalone)
- Bolt = iteration cycle (tracked as `iteration` in state), NOT the same as Unit
- Studio > Stage > Unit > Bolt is the four-layer hierarchy, all distinct concepts
