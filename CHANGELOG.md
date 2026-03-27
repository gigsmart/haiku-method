# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.73.0] - 2026-03-27

### Added

- add /autopilot skill for full autonomous feature lifecycle ([77b1e24](../../commit/77b1e24))

### Fixed

- use /construct instead of /execute for build phase ([33d4df2](../../commit/33d4df2))

### Changed

- make /execute primary, /construct a deprecated alias ([d75c7e4](../../commit/d75c7e4))

### Other

- Merge pull request #70 from TheBushidoCollective/eco/lfg-autopilot ([603321a](../../commit/603321a))
- resolve conflicts with main ([0d32b85](../../commit/0d32b85))
- resolve conflicts with main ([e1ce64a](../../commit/e1ce64a))
- sync with origin/main (v1.59.1) to resolve branch divergence ([9378784](../../commit/9378784))

## [1.72.0] - 2026-03-27

### Added

- add structured completion markers for deterministic review outcomes ([88c26c0](../../commit/88c26c0))

### Other

- Merge pull request #46 from TheBushidoCollective/eco/reviewer-markers ([66a9158](../../commit/66a9158))
- resolve conflicts with main ([5e97be7](../../commit/5e97be7))
- Merge branch 'eco/reviewer-markers' of github.com:TheBushidoCollective/ai-dlc into eco/reviewer-markers ([08ebdbe](../../commit/08ebdbe))
- resolve conflicts with main ([7e6de00](../../commit/7e6de00))
- integrate main's CoVe and pre-delivery review sections with structured completion markers ([e4d2143](../../commit/e4d2143))

## [1.71.0] - 2026-03-27

### Added

- add node repair operator and structured completion marker ([9344756](../../commit/9344756))

### Other

- resolve conflicts with main ([4afb83f](../../commit/4afb83f))
- resolve conflicts with main ([44b14f8](../../commit/44b14f8))

## [1.70.1] - 2026-03-27

### Fixed

- use direct_prompt with matrix strategy for conflict resolution ([8c90fc7](../../commit/8c90fc7))

## [1.70.0] - 2026-03-27

### Added

- add git history analysis to inform planning decisions ([238d504](../../commit/238d504))
- add git history analysis to inform planning decisions ([246c657](../../commit/246c657))
- add git history analysis to inform planning decisions ([b3f5b6c](../../commit/b3f5b6c))

### Other

- Merge pull request #76 from TheBushidoCollective/eco/git-history ([8c4692d](../../commit/8c4692d))
- resolve conflicts with main ([cfc47f3](../../commit/cfc47f3))

## [1.68.1] - 2026-03-27

### Added

- add workflow mode and granularity tuning ([aff733c](../../commit/aff733c))

### Fixed

- restore executable permissions on shell scripts ([b751920](../../commit/b751920))

### Other

- Merge pull request #62 from TheBushidoCollective/eco/config-system ([80196fd](../../commit/80196fd))
- Merge pull request #49 from TheBushidoCollective/eco/compound-reflect-docs ([5174bda](../../commit/5174bda))
- resolve conflicts with main ([d6366a7](../../commit/d6366a7))
- resolve conflicts with main ([b6c4d3b](../../commit/b6c4d3b))
- Merge remote-tracking branch 'origin/main' into eco/compound-reflect-docs ([e40be8b](../../commit/e40be8b))
- remove temp files ([0c1663b](../../commit/0c1663b))
- checking commit permissions ([be3cc91](../../commit/be3cc91))
- resolve conflicts with main (add review_agents, config precedence, phase 4c) ([3acfe0c](../../commit/3acfe0c))
- add reflect integration lifecycle documentation ([b5a664d](../../commit/b5a664d))

## [1.68.0] - 2026-03-27

### Added

- add DOT flowchart process authority guideline ([041e102](../../commit/041e102))

### Other

- Merge pull request #47 from TheBushidoCollective/eco/dot-flowcharts ([2c3429c](../../commit/2c3429c))
- resolve conflicts with main ([fcf8bd5](../../commit/fcf8bd5))
- sync branch with main (unrelated histories) ([46557d4](../../commit/46557d4))
- resolve conflicts with main, keep DOT flowcharts and hard gates ([0f3981c](../../commit/0f3981c))

## [1.67.0] - 2026-03-27

### Added

- add model profiles for cost-optimized hat routing ([801229b](../../commit/801229b))

### Fixed

- add missing sections from main and align version ([c33b7d1](../../commit/c33b7d1))
- use load_repo_settings + jq for model_profiles resolution ([25275ee](../../commit/25275ee))
- restore sections accidentally dropped from main ([7d38fde](../../commit/7d38fde))

### Other

- Merge pull request #45 from TheBushidoCollective/eco/model-profiles ([22b0986](../../commit/22b0986))
- resolve conflicts with main ([fe2d383](../../commit/fe2d383))
- resolve conflicts with main ([38a8bcd](../../commit/38a8bcd))

## [1.66.0] - 2026-03-27

### Added

- add learning retrieval before planning ([0cf3fa1](../../commit/0cf3fa1))

### Fixed

- restore accidentally dropped Structured Completion Marker section ([a37b4f2](../../commit/a37b4f2))

### Other

- Merge pull request #31 from TheBushidoCollective/eco/planner-learning ([1e33278](../../commit/1e33278))
- Merge branch 'eco/planner-learning' of github.com:TheBushidoCollective/ai-dlc into eco/planner-learning ([40a5ad6](../../commit/40a5ad6))
- resolve conflicts with main ([e4e0105](../../commit/e4e0105))
- incorporate main's learning search enhancements into planner ([0389bde](../../commit/0389bde))

## [1.64.0] - 2026-03-27

### Added

- add parallel review perspectives for multi-file units ([1bb3fa4](../../commit/1bb3fa4))

### Fixed

- restore Two-Stage Review section missing from main ([f2a013a](../../commit/f2a013a))
- resolve conflicts with main — restore missing steps and section order ([59ded75](../../commit/59ded75))
- restore CoVe and Specialized Pre-Delivery Reviews sections ([7a38399](../../commit/7a38399))

### Other

- Merge pull request #29 from TheBushidoCollective/eco/reviewer-parallel ([270aeb7](../../commit/270aeb7))
- Merge branch 'eco/reviewer-parallel' of github.com:TheBushidoCollective/ai-dlc into eco/reviewer-parallel ([61b7a5b](../../commit/61b7a5b))
- resolve conflicts with main ([4f4e456](../../commit/4f4e456))

## [1.63.0] - 2026-03-27

### Added

- add anti-rationalization tables and red flags to all 13 hats ([968b27b](../../commit/968b27b))
- add goal-backward verification and three-level artifact checks ([2c2e0ad](../../commit/2c2e0ad))

### Other

- Merge pull request #28 from TheBushidoCollective/eco/anti-rationalization ([731b01c](../../commit/731b01c))
- resolve conflicts with main ([61019da](../../commit/61019da))
- resolve conflicts with main ([42bb0c6](../../commit/42bb0c6))
- resolve conflicts with main ([657ad42](../../commit/657ad42))
- resolve conflicts with main ([feb99da](../../commit/feb99da))
- sync branch with main (v1.61.1) and integrate goal-backward steps ([fae06a8](../../commit/fae06a8))
- resolve conflicts with main, integrating goal-backward steps with anti-patterns, confidence scoring, CoVe, and specialized reviews ([db3379b](../../commit/db3379b))

## [1.62.3] - 2026-03-27

### Fixed

- use @claude mention bot for conflict resolution instead of direct action ([beb1ab4](../../commit/beb1ab4))

## [1.62.2] - 2026-03-27

### Other

- update old plugin terminology (Jutsu/Hashi/Do → current names) ([bab4ff6](../../commit/bab4ff6))

## [1.62.1] - 2026-03-27

### Other

- opt into Node 24 for all workflows, fix conflict resolver polling ([dcd41fb](../../commit/dcd41fb))

## [1.62.0] - 2026-03-27

### Added

- restore phase customization files with elaboration support ([21309d1](../../commit/21309d1))
- add phase customization files (.ai-dlc/ELABORATION.md pattern) ([fa3a1a0](../../commit/fa3a1a0))
- add data-driven configuration pattern for external rule files ([b2b7d8b](../../commit/b2b7d8b))

### Changed

- remove hat-based phase customization files ([d0510e3](../../commit/d0510e3))
- remove phase customization files in favor of hat overrides ([82da60c](../../commit/82da60c))

### Other

- Merge pull request #99 from TheBushidoCollective/eco/data-driven-config ([77b976e](../../commit/77b976e))

## [1.61.1] - 2026-03-27

### Other

- add Claude conflict resolver workflow ([c28bac4](../../commit/c28bac4))

## [1.61.0] - 2026-03-27

### Added

- add two-stage review (spec compliance then code quality) ([e023c4a](../../commit/e023c4a))

### Fixed

- move test coverage into Stage 1 spec compliance ([85e7764](../../commit/85e7764))

### Other

- Merge pull request #51 from TheBushidoCollective/eco/two-stage-review ([1ac1e4e](../../commit/1ac1e4e))

## [1.60.0] - 2026-03-27

### Added

- add visual brainstorming companion guidance ([0f6b4ff](../../commit/0f6b4ff))

### Fixed

- change brainstorm persist path to avoid mockups/ collision ([6219c1b](../../commit/6219c1b))

### Other

- Merge pull request #53 from TheBushidoCollective/eco/visual-brainstorm ([8fe1b98](../../commit/8fe1b98))

## [1.59.1] - 2026-03-27

### Fixed

- add allowed_bots to claude-code-review workflow ([b285569](../../commit/b285569))

## [1.59.0] - 2026-03-27

### Added

- add context budget monitor (warns at 35%/25% remaining) ([6738855](../../commit/6738855))

### Fixed

- redirect context-monitor warnings to stderr and exit 2 ([7b48897](../../commit/7b48897))

### Other

- Merge pull request #33 from TheBushidoCollective/eco/context-monitor ([346fb47](../../commit/346fb47))

## [1.58.2] - 2026-03-27

### Other

- Merge pull request #25 from TheBushidoCollective/eco/builder-reference ([a505941](../../commit/a505941))
- extract reference material to companion file (~35% token reduction) ([707a4e8](../../commit/707a4e8))

## [1.58.1] - 2026-03-27

### Other

- Merge pull request #30 from TheBushidoCollective/eco/reviewer-reference ([cf00b39](../../commit/cf00b39))
- resolve conflicts with main (incorporate CoVe, specialized reviews, and reference agents) ([436e2fd](../../commit/436e2fd))
- extract reference material to companion file (~27% token reduction) ([f06d0c0](../../commit/f06d0c0))

## [1.58.0] - 2026-03-27

### Added

- add structured completion markers for deterministic hat transitions ([858c13e](../../commit/858c13e))

### Other

- Merge pull request #32 from TheBushidoCollective/eco/planner-markers ([2c4c4d0](../../commit/2c4c4d0))

## [1.57.0] - 2026-03-27

### Added

- add confidence-scored findings and anti-pattern scan ([13d548b](../../commit/13d548b))

### Other

- Merge pull request #27 from TheBushidoCollective/eco/reviewer-confidence ([148a69a](../../commit/148a69a))

## [1.56.1] - 2026-03-27

### Other

- Merge pull request #34 from TheBushidoCollective/eco/lazy-learnings ([1aaef44](../../commit/1aaef44))
- lazy learnings injection saves ~200-1000 tokens per session ([f586e9d](../../commit/f586e9d))

## [1.56.0] - 2026-03-27

### Added

- add /compound skill for capturing structured learnings ([b39fe58](../../commit/b39fe58))

### Other

- Merge pull request #35 from TheBushidoCollective/eco/compound-skill ([ef30e99](../../commit/ef30e99))

## [1.55.0] - 2026-03-27

### Added

- add anti-patterns guidance for constraining agent output ([884deb8](../../commit/884deb8))

### Other

- Merge pull request #36 from TheBushidoCollective/eco/criteria-anti-patterns ([bf50145](../../commit/bf50145))

## [1.54.0] - 2026-03-27

### Added

- add /pressure-testing skill for hat TDD ([df9d69c](../../commit/df9d69c))

### Other

- Merge pull request #37 from TheBushidoCollective/eco/pressure-testing ([2456203](../../commit/2456203))

## [1.53.1] - 2026-03-27

### Other

- Merge pull request #38 from TheBushidoCollective/eco/disable-model-invocation ([d341d0d](../../commit/d341d0d))
- add disable-model-invocation to reflect/resume/operate ([70a5e8d](../../commit/70a5e8d))

## [1.53.0] - 2026-03-27

### Added

- add wave-based parallel execution for multi-unit intents ([22a54e5](../../commit/22a54e5))

### Other

- Merge pull request #55 from TheBushidoCollective/eco/wave-parallel ([78001ca](../../commit/78001ca))

## [1.52.0] - 2026-03-27

### Added

- add structured session handoff for bolt continuity ([c592d72](../../commit/c592d72))

### Other

- Merge pull request #56 from TheBushidoCollective/eco/session-handoff ([ab811d2](../../commit/ab811d2))

## [1.51.2] - 2026-03-27

### Fixed

- allow bot actors in Claude Code mention workflow ([744b746](../../commit/744b746))

## [1.51.1] - 2026-03-27

### Other

- Merge pull request #39 from TheBushidoCollective/eco/role-scoped-context ([0193711](../../commit/0193711))
- role-scoped subagent context saves ~400 tokens per review agent ([669ad6c](../../commit/669ad6c))

## [1.51.0] - 2026-03-27

### Added

- add brownfield codebase mapping to discovery phase ([b11e66d](../../commit/b11e66d))

### Other

- Merge pull request #40 from TheBushidoCollective/eco/brownfield-mapping ([b9c7b8d](../../commit/b9c7b8d))

## [1.50.0] - 2026-03-27

### Added

- aggregate compound learnings into reflection ([acc4c1e](../../commit/acc4c1e))

### Other

- Merge pull request #41 from TheBushidoCollective/eco/reflect-compound ([553d584](../../commit/553d584))

## [1.49.0] - 2026-03-27

### Added

- add hard-gate synchronization points ([cb7c0b0](../../commit/cb7c0b0))

### Other

- Merge pull request #43 from TheBushidoCollective/eco/hard-gates ([e1485a7](../../commit/e1485a7))

## [1.48.0] - 2026-03-27

### Added

- add automated spec review before construction ([a9ac7b0](../../commit/a9ac7b0))

### Other

- Merge pull request #44 from TheBushidoCollective/eco/spec-review ([112bcee](../../commit/112bcee))

## [1.47.0] - 2026-03-27

### Added

- add verification-before-completion requirement ([944a458](../../commit/944a458))

### Other

- Merge pull request #52 from TheBushidoCollective/eco/verify-before-complete ([3ca26a6](../../commit/3ca26a6))

## [1.46.0] - 2026-03-27

### Added

- add /seed skill for forward-looking ideas with trigger conditions ([ecbb857](../../commit/ecbb857))

### Other

- Merge pull request #58 from TheBushidoCollective/eco/seed-system ([74b1521](../../commit/74b1521))

## [1.45.0] - 2026-03-27

### Added

- add comprehensive pre-delivery checklist ([54dd6b1](../../commit/54dd6b1))

### Changed

- replace static checklist with specialized review agents ([034b969](../../commit/034b969))

### Other

- Merge pull request #98 from TheBushidoCollective/eco/pre-delivery-checklist ([ddfc75a](../../commit/ddfc75a))

## [1.44.3] - 2026-03-27

### Added

- interpolate default branch name into git strategy questions ([944ee1f](../../commit/944ee1f))
- support configurable remote in default branch detection ([c0f0554](../../commit/c0f0554))

### Other

- Merge pull request #101 from joshampton/task/default-branch-names ([6c063a2](../../commit/6c063a2))

## [1.44.2] - 2026-03-27

### Other

- "Claude Code Review workflow" ([3462dbf](../../commit/3462dbf))
- "Update Claude PR Assistant workflow" ([8a93ed1](../../commit/8a93ed1))

## [1.44.1] - 2026-03-27

### Other

- add Claude Code mention bot workflow ([74e1a7e](../../commit/74e1a7e))

## [1.44.0] - 2026-03-27

### Added

- add file-based state persistence with lockfile protection ([227f170](../../commit/227f170))

### Other

- Merge pull request #60 from TheBushidoCollective/eco/file-state ([1deaa46](../../commit/1deaa46))

## [1.43.0] - 2026-03-27

### Added

- add prompt injection guard and workflow enforcement hooks ([32c8d47](../../commit/32c8d47))

### Other

- Merge pull request #61 from TheBushidoCollective/eco/security-hooks ([461f70d](../../commit/461f70d))

## [1.42.0] - 2026-03-27

### Added

- add /quick mode for trivial tasks that skip full elaboration ([823e0e2](../../commit/823e0e2))

### Other

- Merge pull request #63 from TheBushidoCollective/eco/quick-mode ([2816f4d](../../commit/2816f4d))

## [1.41.0] - 2026-03-27

### Added

- add no-verify parallel commit strategy for agent teams ([97cca40](../../commit/97cca40))

### Other

- Merge pull request #64 from TheBushidoCollective/eco/no-verify-parallel ([ff18336](../../commit/ff18336))

## [1.40.0] - 2026-03-27

### Added

- add catalog of specialized review agents by domain ([011bb08](../../commit/011bb08))

### Other

- Merge pull request #67 from TheBushidoCollective/eco/specialized-reviewers ([604b0b2](../../commit/604b0b2))

## [1.39.0] - 2026-03-27

### Added

- add /backlog skill for parking lot ideas ([4809022](../../commit/4809022))

### Other

- Merge pull request #68 from TheBushidoCollective/eco/backlog-system ([9f99c2e](../../commit/9f99c2e))

## [1.38.0] - 2026-03-27

### Added

- add /ideate skill for adversarially-filtered improvement ideas ([522eefb](../../commit/522eefb))

### Other

- Merge pull request #69 from TheBushidoCollective/eco/ideation ([ff56030](../../commit/ff56030))

## [1.37.0] - 2026-03-27

### Added

- add plan deepening with parallel research agents ([7b9f4b0](../../commit/7b9f4b0))

### Other

- Merge pull request #71 from TheBushidoCollective/eco/deepen-plan ([3404949](../../commit/3404949))

## [1.36.0] - 2026-03-27

### Added

- add spec flow analysis to identify specification gaps ([b9792bc](../../commit/b9792bc))

### Other

- Merge pull request #77 from TheBushidoCollective/eco/spec-flow ([7303820](../../commit/7303820))

## [1.35.0] - 2026-03-27

### Added

- add per-project review agent configuration ([bb47bcd](../../commit/bb47bcd))

### Other

- Merge pull request #78 from TheBushidoCollective/eco/setup-config ([b001d09](../../commit/b001d09))

## [1.34.0] - 2026-03-27

### Added

- add chain-of-verification (CoVe) for evidence-based reviews ([c123153](../../commit/c123153))

### Other

- Merge pull request #83 from TheBushidoCollective/eco/chain-verification ([c64a84e](../../commit/c64a84e))

## [1.33.0] - 2026-03-27

### Added

- add relevance-ranked learning search with multi-signal ranking ([630de09](../../commit/630de09))

### Other

- Merge pull request #94 from TheBushidoCollective/eco/bm25-search ([37a3cc7](../../commit/37a3cc7))

## [1.32.0] - 2026-03-27

### Added

- add version-aware building with rollback guidance ([d64f599](../../commit/d64f599))

### Other

- Merge pull request #95 from TheBushidoCollective/eco/version-rollback ([8daaa27](../../commit/8daaa27))

## [1.31.0] - 2026-03-27

### Added

- add rule-based decision filtering for approach selection ([5203a64](../../commit/5203a64))

### Other

- Merge pull request #96 from TheBushidoCollective/eco/reasoning-engine ([d460b60](../../commit/d460b60))

## [1.30.0] - 2026-03-27

### Added

- document master + overrides configuration precedence pattern ([f01c3fa](../../commit/f01c3fa))

## [1.29.0] - 2026-03-26

### Added

- add last_updated timestamp to unit frontmatter ([d25cf8a](../../commit/d25cf8a))

### Other

- Merge pull request #12 from TheBushidoCollective/hampton/last-updated-metadata ([d0a170a](../../commit/d0a170a))
- resolve conflicts with main (keep both last_updated and telemetry) ([bd44b4b](../../commit/bd44b4b))

## [1.28.2] - 2026-03-26

### Fixed

- commit unit/intent status changes to git ([1303fb3](../../commit/1303fb3))

### Other

- Merge pull request #17 from TheBushidoCollective/hampton/fix-status-persistence ([92e0f2f](../../commit/92e0f2f))

## [1.28.1] - 2026-03-26

### Other

- Merge pull request #15 from TheBushidoCollective/hampton/workflow-mode-naming ([c4d9aa8](../../commit/c4d9aa8))
- reframe strategy options from user perspective ([0bcd312](../../commit/0bcd312))

## [1.28.0] - 2026-03-26

### Added

- auto-cleanup worktrees at completion milestones ([d17a34b](../../commit/d17a34b))

### Other

- Merge pull request #23 from TheBushidoCollective/hampton/auto-cleanup-lifecycle ([8d9118f](../../commit/8d9118f))

## [1.27.0] - 2026-03-26

### Added

- add design-specific unit template sections ([ef67955](../../commit/ef67955))

### Other

- Merge pull request #19 from TheBushidoCollective/hampton/design-unit-template ([8b1e653](../../commit/8b1e653))

## [1.26.0] - 2026-03-26

### Added

- rework /followup to create linked iteration intents ([0723438](../../commit/0723438))

### Other

- Merge pull request #14 from TheBushidoCollective/hampton/followup-workflow ([3e44f9c](../../commit/3e44f9c))

## [1.25.0] - 2026-03-26

### Added

- include design units in wireframe generation ([2f4c611](../../commit/2f4c611))

### Other

- Merge pull request #18 from TheBushidoCollective/hampton/design-unit-wireframes ([fc7cb8d](../../commit/fc7cb8d))

## [1.24.0] - 2026-03-26

### Added

- add design-focused success criteria guidance ([d760163](../../commit/d760163))

### Other

- Merge pull request #20 from TheBushidoCollective/hampton/design-criteria-guidance ([c760c34](../../commit/c760c34))

## [1.23.0] - 2026-03-26

### Added

- auto-route discipline: design to design workflow ([eae1c68](../../commit/eae1c68))

### Other

- Merge pull request #21 from TheBushidoCollective/hampton/auto-design-workflow ([dba8202](../../commit/dba8202))

## [1.22.0] - 2026-03-26

### Added

- detect and remove merged worktrees ([bb1b27a](../../commit/bb1b27a))

### Other

- Merge pull request #11 from TheBushidoCollective/hampton/smart-worktree-cleanup ([90eeb1f](../../commit/90eeb1f))

## [1.21.0] - 2026-03-26

### Added

- add OTEL reporting for AI-DLC workflow events ([b0cfb0c](../../commit/b0cfb0c))

## [1.20.17] - 2026-03-23

### Other

- fix hook exit behavior and update parse replacement strategy ([ad4c8db](../../commit/ad4c8db))
- add jq/yq dependency management and parse library design ([7a7eeab](../../commit/7a7eeab))
- remove han keep dependency & improve intent state management ([42171dd](../../commit/42171dd))

## [1.20.16] - 2026-03-11

## [1.20.15] - 2026-03-11

### Changed

- convert integrator to agent, add TDD workflow, load learnings ([9f3c86f](../../commit/9f3c86f))

## [1.20.14] - 2026-03-10

### Changed

- remove operator and reflector hats and workflows ([464af8e](../../commit/464af8e))

## [1.20.13] - 2026-03-10

### Other

- update README, skill definitions, and website layout ([48e1ac9](../../commit/48e1ac9))
- Merge pull request #8 from mjquinlan2000/main ([25e747b](../../commit/25e747b))
- Fixing the marketplace path to be ./plugin ([8ac6e70](../../commit/8ac6e70))
- Fixing relative path issue. Needs a forward slash ([329c015](../../commit/329c015))
- Fixing the source in marketplace.json to relect what claude expects ([355e4f7](../../commit/355e4f7))

## [1.20.12] - 2026-03-10

### Fixed

- skip auto-merge question for unit strategy ([7b9fea1](../../commit/7b9fea1))

### Other

- Simplify ai-dlc plugin source configuration ([2015042](../../commit/2015042))

## [1.20.11] - 2026-03-09

### Changed

- move plugin content back into plugin/ subdirectory ([663eb93](../../commit/663eb93))
- flatten plugin directory into repo root ([29732a9](../../commit/29732a9))

### Other

- Update source configuration in marketplace.json ([4597cf2](../../commit/4597cf2))

## [1.20.10] - 2026-03-09

### Added

- add H•AI•K•U workspace integration and enhanced reflection ([ed90396](../../commit/ed90396))
- add H•AI•K•U references, rename Construction to Execution, add Operation/Reflection docs ([6fc0097](../../commit/6fc0097))
- integrate AI-DLC as H•AI•K•U software development profile ([f5fe76d](../../commit/f5fe76d))
- implement reflection phase with /reflect skill and enriched reflector hat ([f2d7cc0](../../commit/f2d7cc0))
- build H•AI•K•U website for haikumethod.ai ([c2e7a6a](../../commit/c2e7a6a))
- implement operation phase with /operate skill and enriched hats ([acee292](../../commit/acee292))
- implement H•AI•K•U core plugin with 4-phase lifecycle ([aae495f](../../commit/aae495f))
- write H•AI•K•U methodology paper ([e4c2792](../../commit/e4c2792))
- establish H•AI•K•U foundation - manifesto, brand identity, repo structure ([84d393e](../../commit/84d393e))

### Other

- Merge methodology-evolution: H•AI•K•U integration, /execute, /operate, /reflect ([f12fdcd](../../commit/f12fdcd))
- Move H•AI•K•U content to dedicated repo (TheBushidoCollective/haiku-method) ([71b32a6](../../commit/71b32a6))
- Merge unit-04-reflection-phase into intent branch ([123a048](../../commit/123a048))
- Merge unit-07-haiku-website into intent branch ([2ecf732](../../commit/2ecf732))
- Merge unit-02-haiku-core-plugin into intent branch ([eb1e5fa](../../commit/eb1e5fa))
- define intent and units for methodology-evolution ([acc5ee9](../../commit/acc5ee9))

## [1.20.9] - 2026-03-09

### Other

- Revert marketplace to path source, add plugin zip download ([253943f](../../commit/253943f))

## [1.20.8] - 2026-03-06

### Other

- Update marketplace.json with H·AI·K·U description and publish on website ([6422f48](../../commit/6422f48))

## [1.20.7] - 2026-03-06

### Other

- update gitignore ([2f1811d](../../commit/2f1811d))

## [1.20.6] - 2026-03-05

### Fixed

- resolve worktree paths from main repo root, add cleanup ([4e9ea5e](../../commit/4e9ea5e))

## [1.20.5] - 2026-03-04

### Fixed

- prevent elaboration review PR from closing linked issues ([6674c7b](../../commit/6674c7b))

## [1.20.4] - 2026-03-04

### Fixed

- skip delivery prompt for unit-based change strategy ([b521fb7](../../commit/b521fb7))

## [1.20.3] - 2026-03-04

### Fixed

- enforce full unit display during elaboration review ([519f8fc](../../commit/519f8fc))

## [1.20.2] - 2026-03-04

### Fixed

- add continuation signals after fork subagent invocations ([d20420c](../../commit/d20420c))

## [1.20.1] - 2026-03-04

### Fixed

- add strict ASCII wireframe alignment rules to discovery skill ([28d4130](../../commit/28d4130))

## [1.20.0] - 2026-03-04

### Added

- extract elaborate phases into fork subagent skills ([ca33432](../../commit/ca33432))

## [1.19.2] - 2026-03-04

### Fixed

- enforce gitignore for .ai-dlc/worktrees before worktree creation ([07b8841](../../commit/07b8841))

## [1.19.1] - 2026-03-03

### Other

- remove elaborator agent and elaboration-start skill split ([8a4e92f](../../commit/8a4e92f))

## [1.19.0] - 2026-03-03

### Added

- split elaborate into orchestrator + elaborator agent, add changelog page, update docs ([6d1dd6f](../../commit/6d1dd6f))

## [1.18.0] - 2026-03-03

### Added

- add greenfield project detection and UI mockup generation ([33fda87](../../commit/33fda87))

## [1.17.2] - 2026-03-02

### Fixed

- scope changelog generation to only include commits since previous version ([42bc180](../../commit/42bc180))

## [1.17.1] - 2026-03-02

### Fixed

- create intent worktree before discovery to avoid artifacts on main ([bc8e719](../../commit/bc8e719))

## [1.17.0] - 2026-03-02

### Added

- allow agent invocation of elaborate, resume, and refine skills ([5cd0587](../../commit/5cd0587))

## [1.16.0] - 2026-03-02

### Added

- discovery scratchpad, design subagents, hybrid change strategy ([eb9f69b](../../commit/eb9f69b))

## [1.15.0] - 2026-02-25

### Added

- per-unit workflows with design discipline support ([44ea67f](../../commit/44ea67f))

## [1.14.0] - 2026-02-25

### Added

- add design asset handling, color matching, and annotation awareness ([6682758](../../commit/6682758))

## [1.13.0] - 2026-02-25

### Added

- cowork-aware handoff with local folder and zip options ([18f44e4](../../commit/18f44e4))

## [1.12.0] - 2026-02-25

### Added

- block /reset, /refine, /setup, /resume in cowork mode ([988f066](../../commit/988f066))

## [1.11.0] - 2026-02-25

### Added

- block /construct in cowork mode ([93d6075](../../commit/93d6075))

## [1.10.0] - 2026-02-25

### Added

- improve cowork mode with CLAUDE_CODE_IS_COWORK detection and Explore subagents ([a9fed25](../../commit/a9fed25))

## [1.9.0] - 2026-02-25

### Added

- add wireframe generation phase and move worktrees into project ([156b2cb](../../commit/156b2cb))

## [1.8.3] - 2026-02-24

### Fixed

- improve ticket description formatting and structure ([9f927c7](../../commit/9f927c7))

## [1.8.2] - 2026-02-24

### Changed

- rename reference skills, make non-user-invocable ([64332a2](../../commit/64332a2))

## [1.8.1] - 2026-02-24

### Other

- Merge branch 'main' of github.com:TheBushidoCollective/ai-dlc ([5d6e008](../../commit/5d6e008))
- more provider settings ([c415c37](../../commit/c415c37))

## [1.8.0] - 2026-02-24

### Added

- unit targeting, enriched change strategies, remove bolt strategy ([9d32003](../../commit/9d32003))

## [1.7.0] - 2026-02-20

### Added

- add completion announcements, risk descriptions, iteration cap, and bolt terminology ([a6b4790](../../commit/a6b4790))

## [1.6.3] - 2026-02-20

### Changed

- remove all mode references from hooks, skills, and specs ([2ac4321](../../commit/2ac4321))

## [1.6.2] - 2026-02-20

### Changed

- remove mode selection from elaboration and construction ([5238358](../../commit/5238358))

## [1.6.1] - 2026-02-20

### Fixed

- move iteration.json initialization from elaboration to construction ([53db2b7](../../commit/53db2b7))

## [1.6.0] - 2026-02-20

### Added

- add NFR prompts, cross-cutting concerns, integrator hat, delivery prompts, and /refine skill ([4e448dd](../../commit/4e448dd))

## [1.5.0] - 2026-02-20

### Added

- add /setup skill and enforce ticket creation during elaboration ([7bdcbbe](../../commit/7bdcbbe))

## [1.4.5] - 2026-02-20

### Fixed

- make testing non-negotiable, remove per-intent testing config ([a118872](../../commit/a118872))

## [1.4.4] - 2026-02-20

### Fixed

- make subagent context hook load state from correct branch ([055de0a](../../commit/055de0a))

## [1.4.3] - 2026-02-15

### Fixed

- namespace intent branches as ai-dlc/{slug}/main ([3f5765d](../../commit/3f5765d))

## [1.4.2] - 2026-02-15

### Fixed

- remove elaborator from construction workflows and improve intent discovery ([68340c4](../../commit/68340c4))

## [1.4.1] - 2026-02-13

### Fixed

- update plugin install commands to use Claude Code native /plugin CLI ([6b7ba91](../../commit/6b7ba91))

## [1.4.0] - 2026-02-13

### Added

- add provider integration, cowork support, and three-tier instruction merge ([4fd4f48](../../commit/4fd4f48))

## [1.3.2] - 2026-02-13

### Other

- Merge branch 'main' of github.com:TheBushidoCollective/ai-dlc ([92ad94e](../../commit/92ad94e))
- remove intent ([0040b8c](../../commit/0040b8c))

## [1.3.1] - 2026-02-13

## [1.3.0] - 2026-02-13

### Added

- providers, cowork support, and plugin reorganization ([50aa5a1](../../commit/50aa5a1))

## [1.2.2] - 2026-02-12

### Changed

- consolidate intent.yaml into intent.md frontmatter ([3617cac](../../commit/3617cac))

## [1.2.1] - 2026-02-12

### Fixed

- session retrospective — branch ordering, team mode hats, workflow transitions, merge strategy ([e4c7707](../../commit/e4c7707))

## [1.2.0] - 2026-02-11

### Added

- add domain discovery, spec validation, and deep research to elaboration ([edf7a4b](../../commit/edf7a4b))

## [1.1.2] - 2026-02-11

### Other

- update settings ([24a54a1](../../commit/24a54a1))

## [1.1.1] - 2026-02-11

### Added

- add automatic version bump and changelog pipeline ([86ad4eb](../../commit/86ad4eb))
- make Agent Teams the primary execution model for /construct ([6d9b811](../../commit/6d9b811))
- add Agent Teams support with intent-level modes and dynamic hat discovery ([0f25cd4](../../commit/0f25cd4))
- use han wrap-subagent-context for PreToolUse injection ([c1e7e9b](../../commit/c1e7e9b))
- fix scroll spy, theme toggle, and remove trailing slashes ([343b5e2](../../commit/343b5e2))
- add interactive workflow visualizer ([d3c2f5a](../../commit/d3c2f5a))
- add responsive layout, dark mode, and core pages ([733b74e](../../commit/733b74e))
- migrate AI-DLC plugin to repository root ([65613ee](../../commit/65613ee))
- initial repository setup ([828e515](../../commit/828e515))

### Fixed

- revert to direct push for version bump (no branch protection) ([5016a6d](../../commit/5016a6d))
- use PR-based merge for version bump to work with branch protection ([f18225f](../../commit/f18225f))

### Changed

- consolidate commands into skills and clean up stale references ([e7fd50b](../../commit/e7fd50b))

### Other

- update settings ([c6a0326](../../commit/c6a0326))
- optimize session start hook performance ([3c89a32](../../commit/3c89a32))
