---
title: Designer Guide
description: Guide for UX/UI designers collaborating on AI-DLC projects
order: 20
---

This guide covers how designers can work effectively within the AI-DLC methodology. Whether you're creating design specs, reviewing implementations, or collaborating with AI-assisted development, AI-DLC provides structure that benefits the entire team.

## Your Role in AI-DLC

Design work intersects with AI-DLC at several key points:

1. **Intent Definition** - Helping define what success looks like visually
2. **Completion Criteria** - Specifying measurable design requirements
3. **Review Phase** - Validating implementations match design intent
4. **Iteration** - Providing feedback that guides refinements

When an intent uses multipass, designers are the primary participants in the **design pass** -- running the full elaborate, execute, and review loop focused on design artifacts like mockups, prototypes, and component specs. The output of the design pass becomes input to subsequent product and dev passes. See [Passes](/docs/concepts/#pass) for details.

## Writing Design Completion Criteria

The most impactful thing you can do is write clear, verifiable design criteria. Vague specs lead to back-and-forth; precise specs let AI build correctly the first time.

### From Vague to Verifiable

| Vague | Verifiable |
|-------|------------|
| "Looks good on mobile" | "At 375px width: navigation collapses to hamburger, cards stack vertically, text remains readable (16px minimum)" |
| "Clean design" | "Component follows 8px grid, uses only colors from design tokens, maintains 4.5:1 contrast ratio" |
| "Consistent with brand" | "Uses Inter font family, primary buttons use --color-brand-500, icons from Lucide set" |
| "Accessible" | "All interactive elements keyboard accessible, focus states visible, ARIA labels on icons" |

### Structure Your Criteria

Organize design criteria by category:

```markdown
## Design Completion Criteria

### Layout
- [ ] Container max-width 1200px, centered with 24px padding
- [ ] 3-column grid on desktop (>1024px), 2-column on tablet (768-1023px), 1-column on mobile (<768px)
- [ ] Cards maintain 16px gap between items

### Typography
- [ ] Headings: Inter Bold, sizes per type scale (h1: 48px, h2: 36px, h3: 24px)
- [ ] Body: Inter Regular 16px/1.5 line-height
- [ ] Captions: Inter Regular 14px, --color-gray-600

### Colors & Contrast
- [ ] All text meets WCAG AA contrast (4.5:1 for normal, 3:1 for large)
- [ ] Interactive states: hover, active, focus, disabled defined
- [ ] Dark mode variants specified

### Components
- [ ] Buttons follow design system (primary, secondary, ghost variants)
- [ ] Form inputs 44px min height, visible focus rings
- [ ] Loading states for async operations
```

### Include Visual References

Reference your design files directly:

```markdown
## Visual Reference

**Figma:** https://figma.com/file/...

### Key Screens
- Home: Frame "Home - Desktop" (design token: page-home)
- Mobile nav: Frame "Nav - Mobile Open" (design token: nav-mobile)
- Empty state: Component "Empty State/No Results"
```

## The Designer's Hat Workflow

### During Research Phase

When the team is in Research, you can contribute:

- **Competitive analysis** - How do others solve this UX challenge?
- **Pattern research** - What standard patterns apply?
- **Accessibility research** - What WCAG requirements apply?
- **Design system audit** - What existing components can we reuse?

### During Planning Phase

When the team is Planning, help define:

- **Component breakdown** - Which design system components needed?
- **Responsive strategy** - How does layout adapt?
- **Animation spec** - What motion/transitions required?
- **Edge cases** - Empty states, error states, loading states

### During Building Phase

While Builders work, prepare:

- **Design QA checklist** - What you'll verify in review
- **Responsive screenshots** - Expected appearance at breakpoints
- **Interaction flows** - Expected hover/click/focus behaviors
- **Asset exports** - Icons, images, any custom graphics needed

### During Review Phase

This is where you shine. Review against:

1. **Visual fidelity** - Does it match the design?
2. **Responsiveness** - Does it work at all breakpoints?
3. **Interactions** - Do states and animations feel right?
4. **Accessibility** - Can you navigate with keyboard? Is contrast sufficient?
5. **Edge cases** - How do empty states, errors, and loading look?

## Writing Design Feedback

When review finds issues, write actionable feedback:

### Bad Feedback

> "The spacing looks off"

### Good Feedback

> "The gap between the hero section and the feature cards is 48px, should be 64px per the design system section-spacing token"

### Structured Feedback Template

```markdown
### Issue: [Brief description]

**Expected:** [What the design specifies]
**Actual:** [What was implemented]
**Reference:** [Link to Figma frame or design system doc]
**Fix:** [Specific change needed]
```

## Design System Integration

AI-DLC works best with a design system. If your team doesn't have one, consider creating:

### Design Tokens File

Create a tokens file Claude can reference:

```markdown
## Design Tokens

### Colors
- --color-brand-500: #2563eb (Primary CTA)
- --color-gray-900: #111827 (Headings)
- --color-gray-600: #4b5563 (Body text)
- --color-gray-100: #f3f4f6 (Backgrounds)

### Spacing
- --space-xs: 4px
- --space-sm: 8px
- --space-md: 16px
- --space-lg: 24px
- --space-xl: 32px
- --space-2xl: 48px
- --space-section: 64px

### Typography
- --font-heading: Inter, sans-serif
- --font-body: Inter, sans-serif
- --font-mono: JetBrains Mono, monospace
```

### Component Specifications

Document your components:

```markdown
## Button Component

### Variants
- **Primary:** bg-brand-500, text-white, hover:bg-brand-600
- **Secondary:** bg-transparent, border-gray-300, text-gray-700
- **Ghost:** bg-transparent, text-brand-500, hover:bg-brand-50

### Sizes
- **sm:** h-32px, px-12px, text-14px
- **md:** h-40px, px-16px, text-16px
- **lg:** h-48px, px-24px, text-18px

### States
- **Hover:** darken 10%
- **Active:** darken 15%
- **Focus:** 2px ring, ring-offset-2, ring-brand-500
- **Disabled:** opacity-50, cursor-not-allowed
```

## Working with AI-Generated UI

Claude can generate UI code, but it needs clear guidance. Help by:

### Providing Context

Include in your design specs:

- Tailwind class mappings for your tokens
- Component library being used (Radix, shadcn, etc.)
- Animation library (Framer Motion, CSS transitions)
- Icon set (Lucide, Heroicons, etc.)

### Setting Constraints

Be explicit about what NOT to do:

```markdown
## Design Constraints

### Do Not
- Use colors outside the design system palette
- Add animations not in the motion spec
- Create new component variants without approval
- Use font sizes outside the type scale
- Use spacing values not in the spacing scale
```

## Review Checklists

### Visual Review Checklist

```markdown
## Visual QA

### Layout
- [ ] Matches Figma at desktop breakpoint
- [ ] Matches Figma at tablet breakpoint
- [ ] Matches Figma at mobile breakpoint
- [ ] No horizontal overflow at any breakpoint

### Typography
- [ ] Correct fonts loaded
- [ ] Headings match type scale
- [ ] Line heights comfortable
- [ ] No orphaned words on important headlines

### Colors
- [ ] All colors from design system
- [ ] Contrast passes WCAG AA
- [ ] Dark mode properly implemented

### Components
- [ ] Match design system specs
- [ ] All states styled (hover, focus, active, disabled)
- [ ] Loading states present
```

### Interaction Review Checklist

```markdown
## Interaction QA

### Keyboard Navigation
- [ ] All interactive elements focusable
- [ ] Focus order logical
- [ ] Focus rings visible
- [ ] Escape closes modals

### Touch Targets
- [ ] Minimum 44x44px
- [ ] Adequate spacing between targets

### Animations
- [ ] Smooth, no jank
- [ ] Respects prefers-reduced-motion
- [ ] Duration appropriate (150-300ms for micro, 300-500ms for larger)

### Feedback
- [ ] Buttons show click feedback
- [ ] Form errors clearly indicated
- [ ] Loading states for async actions
- [ ] Success/error confirmations
```

## Collaboration Tips

### Async Collaboration

Since Claude works in sessions, document decisions:

- Keep a `design-decisions.md` file in `.ai-dlc/`
- Screenshot Figma comments into the repository
- Use PR reviews for design feedback

### Synchronous Collaboration

When working live with a developer using Claude:

- Watch the implementation happen
- Call out misalignments early
- Provide immediate feedback on judgment calls

### Handoff Best Practices

For smooth handoffs:

1. **Organized Figma** - Name frames clearly, use components
2. **Written specs** - Don't rely on Figma alone
3. **Responsive notes** - Document breakpoint behavior
4. **Asset exports** - Provide optimized images/icons
5. **Motion specs** - Document animations in writing

## Next Steps

- **[Core Concepts](/docs/concepts/)** - Understand the full methodology
- **[Workflows](/docs/workflows/)** - Learn about different workflow types
- **[Tech Lead Guide](/docs/guide-tech-lead/)** - For broader team perspective
