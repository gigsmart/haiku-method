# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.82.12] - 2026-04-01

### Fixed
- Agent teams created during a unit are now properly cleaned up when the unit completes.

## [1.82.11] - 2026-04-01

Looking at the commits since 1.82.10, there is only one feature:

**Commits analyzed:**
- feat: AI-synthesized changelog and full version backfill (scripts, workflow automation, changelog regeneration)

This is purely an internal tooling improvement — it doesn't change plugin functionality or user behavior. Following the rule to "skip noise" unless it changes user behavior, there are **no user-facing changes to document** for 1.82.11.

If you'd like to document the internal improvement, one minimal option would be:

```
### Changed
- Changelog generation is now AI-synthesized for consistency across release notes.
```

But strictly speaking, this is a tooling-only patch with no user-facing changes.

## [1.83.1] - 2026-03-30

### Fixed
- Reverted Visual Review full integration pending further development.

## [1.82.8] - 2026-04-01

### Added
- /ai-dlc:review skill for pre-delivery code review with automated fix loop, integrated into quick mode

### Changed
- Automatic setup now runs if settings.yml is missing
- Quality gates handling improved with clearer formatting and support for 5+ gates
- Elaboration now less verbose with simplified setup concerns
- PR terminology standardized across skills and documentation

## [1.82.7] - 2026-04-01

### Fixed
- Plugin installation is now more reliable and no longer requires npm
- CPU architecture is automatically detected for cross-platform binary dependency support

## [1.82.6] - 2026-04-01

### Added
- Knowledge synthesis and design direction system with archetype library and visual picker for elaboration bootstrapping
- Three new elaboration phases: 2.3 (Knowledge Bootstrap), 2.75 (Design Direction), 7.5 (Adversarial Review), plus autonomous elaboration mode for /autopilot
- /adopt skill to reverse-engineer existing code into AI-DLC intent artifacts
- Dynamic pass definitions allowing custom passes in construction pipeline
- Quality gates with visual review interface, intent dashboard, and mermaid-enabled MCP server
- BDD workflow with acceptance-test-writer hat for behavior-driven elaboration

### Removed
- workflow_mode setting — /autopilot is now autonomous by definition

## [1.82.5] - 2026-03-30

Looking at the single commit provided (chore: update plugin source path variable), this is internal infrastructure maintenance that doesn't affect user-facing functionality. Per the rules to skip noise and focus on what users can DO differently, there are no sections with content for this version.

**No changelog entry** (no user-facing changes in this version)

## [1.82.4] - 2026-03-30

### Added
- Visual-review intent to structure collaborative design and UX review workflows
- Sync rules documenting consistency requirements between paper, plugin, and website components

## [1.82.3] - 2026-03-30

### Fixed

- Intent status is now validated before delivery to catch configuration issues early.

## [1.82.2] - 2026-03-30

### Fixed
- Intent status now correctly updates when Teams path completes

### Removed
- Standalone HTML guides (content now available on website)

## [1.82.1] - 2026-03-30

### Fixed
- Planner hat no longer incorrectly enters plan mode, strategy options are properly ordered, and intent strategy no longer prompts for auto-merge confirmation.

## [1.82.0] - 2026-03-30

### Added
- Story-driven home page and plugin lifecycle guides provide intuitive introduction to the AI-DLC methodology and workflow.

## [1.81.1] - 2026-03-30

### Fixed

- Intent strategy is now the default workflow, eliminating the auto-merge confirmation prompt.

## [1.81.0] - 2026-03-30

### Added
- Passes are now configurable, letting you customize which disciplinary lenses (design, product, dev) iterate in your workflows.

### Changed
- Construction Phase is now called Execution Phase.

## [1.80.1] - 2026-03-30

### Fixed
- Plugin hooks no longer depend on external han library, reducing potential failure points and improving reliability.

## [1.80.0] - 2026-03-29

### Added
- Harness framework documentation in the methodology paper and website, explaining how the plugin execution model works.

## [1.79.2] - 2026-03-29

### Fixed

- Removed outdated han-plugin references from skill documentation.

## [1.79.1] - 2026-03-29

```markdown
### Fixed
- Advance skill now properly evaluates completion gates against the actual plan file
- Resume skill correctly parses YAML frontmatter in unit specifications
- Haiku utility can now be called standalone with automatic state dependency resolution
```

## [1.79.0] - 2026-03-29

### Added
- Infrastructure and operations as a workflow discipline: Elaborate now guides you through infrastructure questions and auto-creates operations units alongside feature work
- Operations construction phase that builds and validates deployment and infrastructure configurations during the execution flow
- Operational readiness reviews that validate infrastructure and deployment completeness before shipping
- Stack configuration schema with quality gates for defining infrastructure patterns and architectural standards

## [1.78.1] - 2026-03-29

### Fixed
- Fixed visual-fidelity issues identified in code review

## [1.78.0] - 2026-03-28

### Added

- Completion criteria checkboxes automatically check off when a unit or intent is completed, keeping your workflow state synchronized with task progress.

## [1.77.2] - 2026-03-28

### Fixed
- Interactive workflow mode now has write permissions enabled.

## [1.77.1] - 2026-03-28

### Fixed
- Code review workflow now has the necessary permissions to write and apply changes when reviewing code.

## [1.77.0] - 2026-03-28

### Added
- Visual fidelity review agent with gate detection and comparison orchestration for automated design quality assessment, including backpressure documentation for integration workflows
- Design reference resolver that intelligently locates design system components using a 3-level priority hierarchy
- Pluggable screenshot capture infrastructure enabling flexible image acquisition across different design tools

### Fixed
- Prevent stderr/JSON mixing in design reference resolution calls

## [1.76.2] - 2026-03-28

### Fixed

- Intent and unit completion statuses are now reliably set when work finishes.

## [1.76.1] - 2026-03-28

### Changed
- Plugin no longer depends on han CLI; core state management and hook utilities are now built into the plugin via foundation libraries
- Simplified iteration.json state schema with improved phase validation

## [1.76.0] - 2026-03-28

### Added
- Enforce quality checks with hard gates that must pass before unit completion.
- Automatically delegate work to specialized subagents using configurable hooks.
- Generate DOT flowcharts to visualize intent and unit workflows.
- Validate execution context with preflight checks before running workflows.

## [1.75.1] - 2026-03-28

I need more details to write a meaningful changelog entry. The commit message "comprehensive review fixes after PR merge barrage" is too generic—it doesn't specify what was actually fixed.

Can you provide either:
1. **The actual file changes** from that commit (what was modified/fixed), or
2. **Specific issues addressed** (e.g., "fixed edge case in advance skill", "improved error handling in execute", etc.)

Without knowing the concrete improvements, I can't write user-facing bullets that explain what they can now do differently.

## [1.75.0] - 2026-03-27

```markdown
### Added
- Code reviews now support multi-judge critique debate for high-stakes decisions.
```

## [1.74.2] - 2026-03-27

### Fixed
- Fixed CI pipeline conflict resolution to properly handle push events.

## [1.74.1] - 2026-03-27

### Fixed
- Context:fork skill invocations during elaboration now use the Agent tool for improved execution reliability

## [1.74.0] - 2026-03-27

### Added
- Schema drift detection for database changes during code review

## [1.73.0] - 2026-03-27

### Added
- Use /autopilot skill to run complete autonomous feature lifecycles from elaboration through delivery.

### Changed
- /execute is now the primary execution skill; /construct is deprecated.

## [1.72.0] - 2026-03-27

### Added

- Reviewers can now use structured completion markers to mark deterministic review outcomes with confidence-based feedback.

## [1.71.0] - 2026-03-27

### Added
- Builder includes a node repair operator and structured completion markers for improved construction reliability and state tracking.

## [1.70.1] - 2026-03-27

### Fixed
- Improved conflict resolution in continuous integration builds using matrix strategy.

## [1.70.0] - 2026-03-27

### Added
- The planner now analyzes git history to provide more informed planning recommendations.

## [1.68.1] - 2026-03-27

### Fixed
- Shell scripts are now executable after installation, eliminating permission errors.

### Added
- Workflow mode selection and granularity tuning options to customize AI-DLC iteration behavior.
- Documentation for integrating Reflect into the Compound skill workflow.

## [1.68.0] - 2026-03-27

```markdown
### Added

- DOT flowchart guidelines for visualizing process authority during the construction phase.
```

## [1.67.0] - 2026-03-27

### Added
- Model profiles for cost-optimized hat routing with improved configuration resolution

## [1.66.0] - 2026-03-27

### Added
- Planning process now retrieves relevant learnings before generating plans, with improved search capabilities

### Fixed
- Restored Structured Completion Marker section that was accidentally removed

## [1.64.0] - 2026-03-27

### Fixed
- Restored missing Two-Stage Review, conflict resolution, CoVe, and Specialized Pre-Delivery Reviews sections in reviewer hat

### Added
- Parallel review perspectives for multi-file units enable concurrent reviews from multiple disciplinary angles

## [1.63.0] - 2026-03-27

### Added
- Three-level artifact checking in reviews validates content, reasoning, and structural integrity
- Goal-backward verification ensures work aligns with original intent throughout development
- Anti-rationalization tables and red flags across all hats identify biased reasoning patterns
- Confidence scoring system enables granular quality assessment during review cycles
- Enhanced anti-pattern detection and specialized review modes for deeper code analysis

## [1.62.3] - 2026-03-27

### Fixed
- Conflict resolution in automated workflows now requests manual review instead of taking automatic action, improving reliability when handling merge conflicts.

## [1.62.2] - 2026-03-27

### Changed
- Documentation terminology updated throughout to reflect current plugin naming, removing references to legacy terms.

## [1.62.1] - 2026-03-27

### Fixed

- Conflict resolver polling now operates correctly during workflow execution.

## [1.62.0] - 2026-03-27

### Added
- Customize elaboration phases for your project using .ai-dlc/ELABORATION.md configuration files
- Configure external rule files using a data-driven pattern

## [1.61.1] - 2026-03-27

This commit is CI infrastructure work without user-facing implications, so there are no changelog entries for it. Per your rules, this qualifies as "noise" that should be skipped.

If this workflow enables a user-visible feature or changes how conflict resolution works in the plugin itself, please clarify and I can write an entry.

## [1.61.0] - 2026-03-27

### Changed
- Reviewer hat now validates spec compliance first (including test coverage requirements), then assesses code quality in a separate stage.

## [1.60.0] - 2026-03-27

### Added
- Visual brainstorming companion guidance during the elaboration phase

### Fixed
- Brainstorm storage path to prevent collisions with mockups directory

## [1.59.1] - 2026-03-27

This version contains only CI infrastructure updates with no user-facing changes to report.

## [1.59.0] - 2026-03-27

### Added
- Context budget monitoring warns when context usage approaches limits at 35% and 25% remaining, helping you manage token usage during long sessions.

## [1.58.2] - 2026-03-27

### Changed
- Builder now reduces token consumption by approximately 35% by extracting reference materials to a companion file.

## [1.58.1] - 2026-03-27

### Changed
- Reduced token consumption during code reviews by extracting reference material to a companion file.

## [1.58.0] - 2026-03-27

### Added
- Structured completion markers explicitly control when the workflow transitions between hats, replacing implicit transition logic with deterministic gating.

## [1.57.0] - 2026-03-27

### Added

- Code reviews now include confidence-scored findings and automated anti-pattern detection.

## [1.56.1] - 2026-03-27

### Changed
- Session token consumption is reduced through optimized hook lazy loading

## [1.56.0] - 2026-03-27

### Added

- Capture learnings from the current session as structured solution files with the new `/compound` skill.

## [1.55.0] - 2026-03-27

### Added
- Use anti-patterns guidance when writing completion criteria to avoid common mistakes that over-constrain or inappropriately restrict agent output.

## [1.54.0] - 2026-03-27

### Added
- Added `/pressure-testing` skill for test-driven development with quality gate validation.

## [1.53.1] - 2026-03-27

### Added

- You can now disable model invocation in the reflect, resume, and operate skills to prevent unintended model calls during execution.

## [1.53.0] - 2026-03-27

### Added
- Execute multiple units within an intent in parallel waves, automatically coordinating dependencies and sequencing units for optimal throughput.

## [1.52.0] - 2026-03-27

### Added
- Sessions now resume with structured handoff to maintain context and progress across bolts.

## [1.51.2] - 2026-03-27

No user-facing changes to document. The only commit (CI workflow fix) doesn't affect plugin functionality or user experience.

## [1.51.1] - 2026-03-27

### Changed
- Review operations now consume fewer tokens due to optimized subagent context scoping

## [1.51.0] - 2026-03-27

### Added
- Discovery phase now supports brownfield codebase mapping to help you understand existing code architecture when elaborating new intents.

## [1.50.0] - 2026-03-27

### Added
- Aggregate learnings from compound work into structured reflection outputs for project documentation and review.

## [1.49.0] - 2026-03-27

### Added
- Workflows now enforce quality gates at hard-gate synchronization points during critical phase transitions.

## [1.48.0] - 2026-03-27

### Added
- Elaboration now includes automated specification review before advancing to construction.

## [1.47.0] - 2026-03-27

### Added

- Builder now requires verification of completion criteria before marking units complete.

## [1.46.0] - 2026-03-27

### Added
- Use the `/seed` skill to capture forward-looking ideas and define conditions for when they should be revisited.

## [1.45.0] - 2026-03-27

### Changed

- Reviewer now uses specialized review agents to provide comprehensive pre-delivery checks instead of a static checklist

## [1.44.3] - 2026-03-27

### Added
- Git strategy questions now show your actual default branch name, and you can configure which remote to use for detection.

## [1.44.2] - 2026-03-27

### Added
- Claude Code Review workflow for conducting code reviews directly within Claude Code.

### Changed
- Improved Claude PR Assistant workflow with enhanced pull request management capabilities.

## [1.44.1] - 2026-03-27

This commit appears to be a CI infrastructure change (adding a bot workflow) with no user-facing impact. Based on your guidelines to focus on "what a plugin user can now DO differently" and to skip infrastructure noise, there are no sections to include in this changelog entry.

If you'd like me to document this in the changelog anyway, or if I'm misunderstanding what this bot workflow does for end users, please clarify.

## [1.44.0] - 2026-03-27

### Added

- Plugin state now persists to disk with lockfile protection, enabling safe multi-session workflows.

## [1.43.0] - 2026-03-27

### Added
- Safely execute untrusted or generated prompts with built-in prompt injection guards
- Configure workflow enforcement hooks to control tool execution and maintain process discipline

## [1.42.0] - 2026-03-27

### Added
- Use `/quick` mode to skip full elaboration for trivial tasks.

## [1.41.0] - 2026-03-27

### Added
- Agent teams can now use a parallel commit strategy with no-verify enabled to speed up concurrent builds.

## [1.40.0] - 2026-03-27

### Added
- Specialized review agents organized by domain, enabling more targeted feedback based on codebase expertise.

## [1.39.0] - 2026-03-27

### Added
- You can now use `/backlog` to capture and organize parking lot ideas during development.

## [1.38.0] - 2026-03-27

### Added

- Generate improvement suggestions with adversarial review using the new `/ideate` skill.

## [1.37.0] - 2026-03-27

### Added
- Run parallel research agents to deepen plans and explore multiple angles simultaneously

## [1.36.0] - 2026-03-27

### Added
- Spec flow analysis during elaboration helps identify specification gaps before implementation.

## [1.35.0] - 2026-03-27

### Added
- Customize review agent configuration on a per-project basis to align code review behavior with your team's standards.

## [1.34.0] - 2026-03-27

### Added

- Reviewer now uses chain-of-verification (CoVe) methodology to provide evidence-based code reviews grounded in systematic analysis.

## [1.33.0] - 2026-03-27

### Added
- Search for learning materials in the planner and get results ranked by relevance using multiple signals to quickly find applicable guidance.

## [1.32.0] - 2026-03-27

### Added

- Builder automatically detects version incompatibilities and provides rollback guidance during builds.

## [1.31.0] - 2026-03-27

### Added
- The planner now uses rule-based filtering to automatically select the best approach for your task.

## [1.30.0] - 2026-03-27

### Added
- Configuration documentation now explains the precedence pattern for master and override settings, allowing you to correctly configure layered settings.

## [1.29.0] - 2026-03-26

### Added

- Units now include a last_updated timestamp in their frontmatter, allowing you to track when each unit was last modified.

## [1.28.2] - 2026-03-26

### Fixed
- Unit and intent status changes are now committed to git automatically, ensuring all workflow state transitions are tracked in version control.

## [1.28.1] - 2026-03-26

### Changed
- Strategy options documentation now explains each choice from the user's perspective, making it clearer when to use each strategy.

## [1.28.0] - 2026-03-26

### Added
- Automatic cleanup of temporary git worktrees at completion milestones, eliminating manual cleanup steps after intent completion.

## [1.27.0] - 2026-03-26

### Added

- Design-specific unit template sections to guide structured documentation of design requirements during intent elaboration.

## [1.26.0] - 2026-03-26

### Changed
- `/followup` now creates linked iteration intents to maintain continuity across intent iterations.

## [1.25.0] - 2026-03-26

### Added
- Wireframes now include design units during the elaboration phase for more complete design specifications.

## [1.24.0] - 2026-03-26

### Added
- Receive design-focused guidance when defining success criteria during the elaborate phase.

## [1.23.0] - 2026-03-26

### Added

- Design discipline now automatically routes to a design-focused workflow.

## [1.22.0] - 2026-03-26

### Added

- Plugin now automatically detects and removes worktrees once their changes are merged.

## [1.21.0] - 2026-03-26

### Added
- Workflow execution events are now reported to OpenTelemetry, enabling integration with observability platforms and monitoring tools.

## [1.20.16] - 2026-03-11

### Changed
- Documentation rebrand with no user-facing changes

## [1.20.15] - 2026-03-11

### Added
- Test-driven development workflow for building features from tests first
- Learnings from completed intents are automatically loaded into new workflows

### Changed
- Integration workflows now run autonomously without manual intervention

## [1.20.14] - 2026-03-10

### Removed
- Operator and Reflector hats and their associated workflows have been removed from the available workflow options.

## [1.20.13] - 2026-03-10

### Fixed
- Plugin can now be properly discovered and installed via the Claude Code marketplace

## [1.20.12] - 2026-03-10

### Fixed
- Unit strategy automations no longer ask for auto-merge confirmation during setup.

### Changed
- Simplified plugin source configuration.

## [1.20.11] - 2026-03-09

### Changed
- Restructured plugin directory and marketplace configuration

## [1.20.10] - 2026-03-09

### Added
- `/reflect` skill for reflection phase—review and learn from completed work
- `/operate` skill for operation phase—maintain and iterate on deployed systems
- AI-DLC integrates with HAIKU software development methodology

### Changed
- Construction phase renamed to Execution throughout plugin and documentation

## [1.20.9] - 2026-03-09

### Added
- Plugin can be downloaded as a zip archive

### Changed
- Marketplace now uses path-based source configuration

## [1.20.8] - 2026-03-06

### Changed
- H·AI·K·U is now discoverable in the plugin marketplace with full description

## [1.20.7] - 2026-03-06

This commit updates `.gitignore`, which is infrastructure maintenance with no user-facing changes. There are no changelog entries to report for version 1.20.7.

## [1.20.6] - 2026-03-05

### Fixed

- Plugin now correctly resolves worktree paths relative to the main repository root instead of the worktree directory, preventing path resolution errors when using git worktrees.

## [1.20.5] - 2026-03-04

```markdown
### Fixed

- Review pull requests created during elaboration no longer close linked issues when merged.
```

## [1.20.4] - 2026-03-04

### Fixed
- Unit-based change strategy no longer prompts for delivery confirmation, streamlining the workflow.

## [1.20.3] - 2026-03-04

### Fixed
- Elaboration review now displays complete unit content without truncation.

## [1.20.1] - 2026-03-04

### Fixed

- Discovery skill now enforces strict alignment rules for ASCII wireframes, improving consistency and accuracy during domain exploration.

## [1.20.0] - 2026-03-04

### Added

- Elaborate phases can now be run independently as fork subagent skills, giving you granular control over which phases to execute.

## [1.19.2] - 2026-03-04

### Fixed
- Worktree directories are now automatically added to gitignore, preventing temporary work from being accidentally committed.

## [1.19.1] - 2026-03-03

### Fixed
- Elaboration workflow is now unified, removing the complexity of managing separate elaborator agent and elaboration-start skill components.

## [1.19.0] - 2026-03-03

### Added
- Changelog page on the website for viewing release history

### Changed
- Elaborate workflow now orchestrates multiple agents for better intent specification

## [1.18.0] - 2026-03-03

### Added

- Detect greenfield projects and automatically generate UI mockups for rapid design exploration.

## [1.17.2] - 2026-03-02

### Fixed
- Changelog generation now includes only commits since the previous version for more accurate release notes

## [1.17.1] - 2026-03-02

### Fixed

- Intent discovery now creates a worktree before running, preventing temporary artifacts from appearing on the main branch.

## [1.17.0] - 2026-03-02

### Added
- Agents can now invoke elaborate, resume, and refine skills, enabling automated AI-DLC workflows.

## [1.16.0] - 2026-03-02

Based on the commit details, here's the changelog entry for version 1.16.0:

### Added
- Discovery scratchpad automatically captures elaboration findings to `discovery.md` during domain discovery, reducing context window pressure while keeping detailed findings accessible to subagents and the intent worktree
- Parallel design analysis via dedicated subagents during elaboration for faster, context-efficient Figma and design file processing
- Hybrid per-unit change strategy support, allowing mixed strategies within a single intent—foundational units can use direct-to-main while remaining units merge to the intent branch

## [1.15.0] - 2026-02-25

### Added
- Per-unit workflows enable different workflow configurations for each unit, with built-in support for design discipline phases.

## [1.14.0] - 2026-02-25

### Added
- Handle design assets directly in your workflows for easier design integration
- Automatically match and apply colors from design specifications
- Leverage design annotations to guide code generation and specifications

## [1.13.0] - 2026-02-25

### Added
- Handoff now supports cowork-aware modes with options to share work as a local folder or zip file for easier collaboration.

## [1.12.0] - 2026-02-25

### Changed
- Slash commands `/reset`, `/refine`, `/setup`, and `/resume` are now blocked in cowork mode to prevent conflicting simultaneous operations.

## [1.11.0] - 2026-02-25

### Changed
- The `/construct` command is now unavailable in cowork mode to prevent mode conflicts during collaborative work.

## [1.10.0] - 2026-02-25

```markdown
### Added

- Cowork mode now automatically detects multi-agent collaboration environments, improving coordination when multiple Claude Code instances work together.
- Exploration tasks now delegate to specialized Explore subagents for faster codebase discovery and analysis.
```

## [1.9.0] - 2026-02-25

### Added
- Wireframe generation phase for visual design exploration and iteration in development workflows

### Changed
- Worktrees are now automatically created within project directories for better isolation and organization

## [1.8.3] - 2026-02-24

### Fixed
- Ticket descriptions now display with improved formatting and structure for better readability.

## [1.8.2] - 2026-02-24

### Changed
- Reference skills are now internal-only and cannot be invoked directly

## [1.8.1] - 2026-02-24

I don't see a "more provider settings" commit in the recent history. Can you provide the commit hash or clarify which changes you're referring to for version 1.8.1? That way I can see the actual code changes and write an accurate changelog entry.

## [1.8.0] - 2026-02-24

### Added
- Execute specific units without running the entire intent

### Changed
- Change strategies now provide more options for managing workflow iterations

### Removed
- Bolt change strategy has been removed; use the intent strategy instead

## [1.7.0] - 2026-02-20

### Added
- Completion announcements signal when tasks meet their completion criteria.
- Risk descriptions let you document potential issues identified during elaboration.
- Iteration caps set a maximum limit on how many times a bolt can cycle.
- Explicit bolt terminology clarifies the iteration cycle concept throughout the plugin.

## [1.6.3] - 2026-02-20

### Changed
- Simplified skill definitions and hook configurations by removing mode references

## [1.6.2] - 2026-02-20

### Removed
- Mode selection from elaboration and construction phases.

## [1.6.1] - 2026-02-20

### Fixed
- Iteration state is now correctly initialized during construction instead of elaboration, ensuring proper workflow sequencing from project inception through delivery.

## [1.6.0] - 2026-02-20

### Added

- **Integrator hat**: Validate cross-cutting concerns after merging all units within an intent.
- **/refine skill**: Refine intent or unit specifications mid-execution without losing progress.
- **Non-functional requirement guidance**: Enhanced prompts to help you specify and validate non-functional requirements and cross-cutting concerns.
- **Delivery phase guidance**: Improved prompts for planning and executing the delivery phase.

## [1.5.0] - 2026-02-20

### Added
- New `/setup` skill automates initial project configuration.
- Elaboration now enforces ticket creation for all work before execution can begin.

## [1.4.5] - 2026-02-20

### Fixed

- Testing requirements are now mandatory for all intents and cannot be configured per-intent.

## [1.4.4] - 2026-02-20

### Fixed

- Subagents now load context state from the correct branch when executing work.

## [1.4.3] - 2026-02-15

### Fixed

- Intent branches are now prefixed with `ai-dlc/` to prevent naming conflicts and improve branch organization.

## [1.4.2] - 2026-02-15

### Fixed
- Construction workflows now skip the elaborator phase and intent discovery has been improved.

## [1.4.1] - 2026-02-13

### Fixed
- Plugin installation now uses Claude Code's native `/plugin` CLI for streamlined setup.

## [1.4.0] - 2026-02-13

### Added
- Integrate external providers to customize how agents access memory, data, and external services
- Enable coworking mode for team-based and collaborative AI-DLC workflows
- Instructions now merge hierarchically across global, project, and local levels so local customizations take precedence

## [1.3.0] - 2026-02-13

### Added
- Configure memory providers to customize where and how AI-DLC state is stored.
- Collaborate with team members through cowork support for multi-user development workflows.

### Changed
- Plugin structure reorganized for improved modularity and maintainability.

## [1.2.2] - 2026-02-12

### Changed
- Intent configuration is now consolidated into intent.md frontmatter, eliminating the need for a separate intent.yaml file.

## [1.2.1] - 2026-02-12

### Fixed

- Session retrospectives now correctly handle branch ordering and workflow transitions
- Team mode hats now function properly in multi-agent workflows
- Merge strategy now executes as configured

## [1.2.0] - 2026-02-11

### Added
- Domain discovery during elaboration helps you systematically explore your problem space before constructing solutions
- Specification validation during elaboration catches design issues early in the inception phase
- Deep research capabilities help you gather comprehensive context about relevant technologies and approaches

## [1.1.2] - 2026-02-11

I need more detail about what changed in the settings. The commit message "update settings" doesn't reveal what a plugin user can now do differently.

Can you clarify:
- What settings were added, changed, or removed?
- What's the user-facing impact? (e.g., new configuration option, default behavior change, etc.)

Once I understand that, I'll write the changelog entry.

## [1.1.1] - 2026-02-11

### Added
- Agent Teams with intent-level modes and dynamic hat discovery
- Interactive workflow visualizer on documentation website
- Website responsive layout and dark mode

### Changed
- Construction workflows now use Agent Teams by default

### Fixed
- Session startup performance optimized
