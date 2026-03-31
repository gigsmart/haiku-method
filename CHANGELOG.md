# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add Phase 7.5 Adversarial Spec Review to elaboration (#118)
- Visual review integration (#117)
- Adopt skill (#116)
- Add /adopt skill for reverse-engineering existing features into AI-DLC (#108)
- Harness-Enforced Quality Gates (#107)
- Visual review & intent dashboard (#112)

### Changed

- Update version bump workflow for branch protection (#113)

## [1.83.0] - 2026-03-30

### Added

- Add pre-delivery code review gate and OTel instrumentation

## [1.82.7] - 2026-03-30

### Fixed

- Remove all Han references from documentation

## [1.82.6] - 2026-03-30

### Fixed

- Add git worktree prune and error logging to all worktree cleanup sites

## [1.82.3] - 2026-03-30

### Added

- Add Operations stage to Act 5 on home page

### Fixed

- Add pre-delivery safety net for intent.md status

## [1.82.2] - 2026-03-30

### Fixed

- Update intent.md status on Teams path completion
- Reframe passes as transitional, not recommended
- Hatted agents as proper card with expandable detail
- Reframe spec comparison as vibe coding vs spec-driven vs elaboration
- Collapse hat section into expandable deep dive

## [1.82.1] - 2026-03-30

### Fixed

- Only Docs nav item triggers mega menu dropdown
- Prevent planner hat from entering plan mode, reorder strategy options, remove auto-merge question

## [1.82.0] - 2026-03-30

### Added

- Story-driven home page and plugin lifecycle guides

## [1.81.1] - 2026-03-30

### Fixed

- Make intent strategy the default option, remove auto-merge question

## [1.81.0] - 2026-03-30

### Added

- Rename Construction Phase to Execution Phase, add configurable default passes

## [1.80.1] - 2026-03-30

### Fixed

- Remove han dependency from plugin hooks

## [1.80.0] - 2026-03-29

### Added

- Add harness framing to website/paper and update CI review workflow

## [1.79.2] - 2026-03-29

### Fixed

- Remove remaining han-plugin references from skills

## [1.79.1] - 2026-03-29

### Fixed

- Resolve 3 functional bugs and clean up 27+ stale legacy references

## [1.79.0] - 2026-03-29

### Added

- Full AI-DLC Operations Phase (steps 5-9) (#104)

## [1.78.1] - 2026-03-29

### Fixed

- Address post-merge review bugs from PR #105 (#106)

## [1.78.0] - 2026-03-28

### Added

- Check off completion criteria checkboxes on unit/intent completion

## [1.77.2] - 2026-03-28

### Fixed

- Grant write permissions to Claude interactive workflow

## [1.77.1] - 2026-03-28

### Fixed

- Grant write permissions to Claude code review workflow

## [1.77.0] - 2026-03-28

### Added

- Visual fidelity backpressure — design as a hard gate (#105)

## [1.76.2] - 2026-03-28

### Fixed

- Ensure intent and unit statuses are reliably set to completed

## [1.76.1] - 2026-03-28

### Added

- Remove han CLI dependency & improve state management (#103)

## [1.76.0] - 2026-03-28

### Added

- Add subagent-hook, context preflight, hard gates, DOT flowcharts

## [1.75.1] - 2026-03-28

### Fixed

- Comprehensive review fixes after PR merge barrage

## [1.75.0] - 2026-03-27

### Added

- Add multi-judge critique debate for high-stakes reviews (#81)

## [1.74.2] - 2026-03-27

### Fixed

- Use plain git for conflict resolution (claude-code-action doesn't support push events)

## [1.74.1] - 2026-03-27

### Fixed

- Use Agent tool for context:fork skill invocations

## [1.74.0] - 2026-03-27

### Added

- Add schema drift detection (#73)

## [1.73.0] - 2026-03-27

### Added

- Add /autopilot skill for full autonomous feature lifecycle (#70)

## [1.72.0] - 2026-03-27

### Added

- Add structured completion markers for deterministic review outcomes (#46)

## [1.71.0] - 2026-03-27

### Added

- Add node repair operator and structured completion marker (#24)

## [1.70.1] - 2026-03-27

### Fixed

- Use direct_prompt with matrix strategy for conflict resolution

## [1.70.0] - 2026-03-27

### Added

- Add git history analysis to inform planning decisions (#76)

## [1.68.1] - 2026-03-27

### Added

- Add workflow mode and granularity tuning (#62)
- Add reflect integration lifecycle (#49)

## [1.68.0] - 2026-03-27

### Added

- Add DOT flowchart process authority guideline (#47)

## [1.67.0] - 2026-03-27

### Added

- Add model profiles for cost-optimized hat routing (#45)

## [1.66.0] - 2026-03-27

### Added

- Add learning retrieval before planning (#31)

## [1.64.0] - 2026-03-27

### Added

- Add parallel review perspectives for multi-file units (#29)

## [1.63.0] - 2026-03-27

### Added

- Add anti-rationalization tables and red flags to all 13 hats (#28)
- Add goal-backward verification and three-level artifact checks (#26)

## [1.62.3] - 2026-03-27

### Fixed

- Use @claude mention bot for conflict resolution instead of direct action

## [1.62.0] - 2026-03-27

### Added

- Add data-driven configuration pattern (#99)

## [1.61.0] - 2026-03-27

### Added

- Add two-stage review (spec compliance then code quality) (#51)

## [1.60.0] - 2026-03-27

### Added

- Add visual brainstorming companion guidance (#53)

## [1.59.1] - 2026-03-27

### Fixed

- Add allowed_bots to claude-code-review workflow

## [1.59.0] - 2026-03-27

### Added

- Add context budget monitor hook (#33)

## [1.58.2] - 2026-03-27

### Added

- Extract reference material to companion file (#25)

## [1.58.1] - 2026-03-27

### Added

- Extract reference material to companion file (#30)

## [1.58.0] - 2026-03-27

### Added

- Add structured completion markers (#32)

## [1.57.0] - 2026-03-27

### Added

- Add confidence-scored findings and anti-pattern scan (#27)

## [1.56.1] - 2026-03-27

### Added

- Lazy learnings pointer replaces eager injection (#34)

## [1.56.0] - 2026-03-27

### Added

- Add /compound skill for capturing structured learnings (#35)

## [1.55.0] - 2026-03-27

### Added

- Add anti-patterns guidance for completion criteria (#36)

## [1.54.0] - 2026-03-27

### Added

- Add /pressure-testing skill for hat evaluation (#37)

## [1.53.1] - 2026-03-27

### Added

- Disable-model-invocation on infrequently-used skills (#38)

## [1.53.0] - 2026-03-27

### Added

- Add wave-based parallel execution (#55)

## [1.52.0] - 2026-03-27

### Added

- Add structured session handoff for bolt continuity (#56)

## [1.51.2] - 2026-03-27

### Fixed

- Allow bot actors in Claude Code mention workflow

## [1.51.1] - 2026-03-27

### Added

- Role-scoped subagent context (#39)

## [1.51.0] - 2026-03-27

### Added

- Add brownfield codebase mapping to discovery (#40)

## [1.50.0] - 2026-03-27

### Added

- Aggregate compound learnings into reflection (#41)

## [1.49.0] - 2026-03-27

### Added

- Add hard-gate synchronization points (#43)

## [1.48.0] - 2026-03-27

### Added

- Add automated spec review before construction (#44)

## [1.47.0] - 2026-03-27

### Added

- Add verification-before-completion requirement (#52)

## [1.46.0] - 2026-03-27

### Added

- Add /seed skill for forward-looking ideas (#58)

## [1.45.0] - 2026-03-27

### Added

- Add comprehensive pre-delivery checklist (#98)

## [1.44.3] - 2026-03-27

### Added

- Interpolate default branch name into elaboration git strategy questions (#101)

## [1.44.2] - 2026-03-27

### Added

- Add Claude Code GitHub Workflow (#102)

## [1.44.0] - 2026-03-27

### Added

- Add file-based state persistence (#60)

## [1.43.0] - 2026-03-27

### Added

- Add prompt injection guard and workflow enforcement hooks (#61)

## [1.42.0] - 2026-03-27

### Added

- Add /quick mode for trivial tasks (#63)

## [1.41.0] - 2026-03-27

### Added

- Add no-verify parallel commit strategy for agent teams (#64)

## [1.40.0] - 2026-03-27

### Added

- Add catalog of specialized review agents (#67)

## [1.39.0] - 2026-03-27

### Added

- Add /backlog skill for parking lot ideas (#68)

## [1.38.0] - 2026-03-27

### Added

- Add /ideate skill for adversarial improvement ideas (#69)

## [1.37.0] - 2026-03-27

### Added

- Add plan deepening with parallel research agents (#71)

## [1.36.0] - 2026-03-27

### Added

- Add spec flow analysis (#77)

## [1.35.0] - 2026-03-27

### Added

- Add per-project review agent configuration (#78)

## [1.34.0] - 2026-03-27

### Added

- Add chain-of-verification (CoVe) for evidence-based reviews (#83)

## [1.33.0] - 2026-03-27

### Added

- Add relevance-ranked learning search (#94)

## [1.32.0] - 2026-03-27

### Added

- Add version-aware building with rollback guidance (#95)

## [1.31.0] - 2026-03-27

### Added

- Add rule-based decision filtering (#96)

## [1.30.0] - 2026-03-27

### Added

- Document master + overrides configuration precedence pattern (#97)

## [1.29.0] - 2026-03-26

### Added

- Add last_updated timestamp to unit frontmatter (#12)

## [1.28.2] - 2026-03-26

### Fixed

- Commit unit/intent status changes to git (#17)

## [1.28.1] - 2026-03-26

### Added

- Add clear workflow mode labels and guidance (#15)

## [1.28.0] - 2026-03-26

### Added

- Auto-cleanup worktrees at completion milestones (#23)

## [1.27.0] - 2026-03-26

### Added

- Add design-specific unit template sections (#19)

## [1.26.0] - 2026-03-26

### Added

- Add /followup skill for post-completion changes (#14)

## [1.25.0] - 2026-03-26

### Added

- Include design units in wireframe generation (#18)

## [1.24.0] - 2026-03-26

### Added

- Add design-focused success criteria guidance (#20)

## [1.23.0] - 2026-03-26

### Added

- Auto-route discipline: design to design workflow (#21)

## [1.22.0] - 2026-03-26

### Added

- Detect and remove merged worktrees (#11)

## [1.21.0] - 2026-03-26

### Added

- Add OTEL reporting for AI-DLC workflow events (#16)

## [1.20.17] - 2026-03-23

### Added

- Add intent: Remove han dependency & improve state management (#9)

## [1.20.13] - 2026-03-10

### Added

- Fix source error for claude marketplace (#8)

## [1.20.12] - 2026-03-10

### Fixed

- Skip auto-merge question for unit strategy

## [1.20.7] - 2026-03-06

### Fixed

- Resolve worktree paths from main repo root, add cleanup

## [1.20.5] - 2026-03-04

### Fixed

- Prevent elaboration review PR from closing linked issues

## [1.20.4] - 2026-03-04

### Fixed

- Skip delivery prompt for unit-based change strategy

## [1.20.3] - 2026-03-04

### Fixed

- Enforce full unit display during elaboration review

## [1.20.2] - 2026-03-04

### Fixed

- Add continuation signals after fork subagent invocations

## [1.20.1] - 2026-03-04

### Fixed

- Add strict ASCII wireframe alignment rules to discovery skill

## [1.20.0] - 2026-03-04

### Added

- Extract elaborate phases into fork subagent skills

## [1.19.2] - 2026-03-04

### Fixed

- Enforce gitignore for .ai-dlc/worktrees before worktree creation

## [1.19.0] - 2026-03-03

### Added

- Split elaborate into orchestrator + elaborator agent, add changelog page, update docs

## [1.18.0] - 2026-03-03

### Added

- Add greenfield project detection and UI mockup generation

## [1.17.2] - 2026-03-02

### Fixed

- Scope changelog generation to only include commits since previous version

## [1.17.1] - 2026-03-02

### Fixed

- Create intent worktree before discovery to avoid artifacts on main

## [1.17.0] - 2026-03-02

### Added

- Allow agent invocation of elaborate, resume, and refine skills

## [1.16.0] - 2026-03-02

### Added

- Discovery scratchpad, design subagents, hybrid change strategy

## [1.15.0] - 2026-02-25

### Added

- Per-unit workflows with design discipline support

## [1.14.0] - 2026-02-25

### Added

- Add design asset handling, color matching, and annotation awareness

## [1.13.0] - 2026-02-25

### Added

- Cowork-aware handoff with local folder and zip options

## [1.12.0] - 2026-02-25

### Added

- Block /reset, /refine, /setup, /resume in cowork mode

## [1.11.0] - 2026-02-25

### Added

- Block /construct in cowork mode

## [1.10.0] - 2026-02-25

### Added

- Improve cowork mode with CLAUDE_CODE_IS_COWORK detection and Explore subagents

## [1.9.0] - 2026-02-25

### Added

- Add wireframe generation phase and move worktrees into project

## [1.8.3] - 2026-02-24

### Fixed

- Improve ticket description formatting and structure

## [1.8.1] - 2026-02-24

### Added

- Unit targeting, enriched change strategies, remove bolt strategy

## [1.7.0] - 2026-02-20

### Added

- Add completion announcements, risk descriptions, iteration cap, and bolt terminology

## [1.6.1] - 2026-02-20

### Fixed

- Move iteration.json initialization from elaboration to construction

## [1.6.0] - 2026-02-20

### Added

- Add NFR prompts, cross-cutting concerns, integrator hat, delivery prompts, and /refine skill

## [1.5.0] - 2026-02-20

### Added

- Add /setup skill and enforce ticket creation during elaboration

## [1.4.5] - 2026-02-20

### Fixed

- Make testing non-negotiable, remove per-intent testing config

## [1.4.4] - 2026-02-20

### Fixed

- Make subagent context hook load state from correct branch

## [1.4.3] - 2026-02-15

### Fixed

- Namespace intent branches as ai-dlc/{slug}

## [1.4.2] - 2026-02-15

### Fixed

- Remove elaborator from construction workflows and improve intent discovery

## [1.4.1] - 2026-02-13

### Fixed

- Update plugin install commands to use Claude Code native /plugin CLI

## [1.4.0] - 2026-02-13

### Added

- Add provider integration, cowork support, and three-tier instruction merge

## [1.3.0] - 2026-02-13

### Added

- Providers, cowork support, and plugin reorganization

## [1.2.1] - 2026-02-12

### Fixed

- Session retrospective — branch ordering, team mode hats, workflow transitions, merge strategy

## [1.2.0] - 2026-02-11

### Added

- Add domain discovery, spec validation, and deep research to elaboration

## [1.1.1] - 2026-02-11

### Added

- Add automatic version bump and changelog pipeline (#3)
- Optimize session start hook performance (#1)
- Fix scroll spy, theme toggle, and remove trailing slashes
- Improve paper typography and add designer guide
- Transform AI-DLC into comprehensive methodology site
- Add interactive workflow visualizer
- Add interactive Big Picture methodology diagram
- Add SEO feeds, sitemap, and structured data
- Add responsive layout, dark mode, and core pages
- Migrate AI-DLC plugin to repository root
- Initial repository setup

### Fixed

- Simplify version bump to direct push (#6)
- Use PR-based merge for version bump workflow (#4)
- Remove duplicate H1 headers from docs pages
- Remove 2026 from landing page hero
