---
status: success
error_message: ""
findings_count: 19
auto_fixable_count: 5
categories_found: [contradiction, hidden-complexity, assumption, dependency, scope, completeness, boundary]
---

# Adversarial Review Results

## Summary

- **Total findings:** 19
- **Blocking:** 5
- **Warning:** 10
- **Suggestion:** 4
- **Auto-fixable:** 5 (high-confidence with automatable fix_type)

## Categories

- **contradiction:** 4 findings
- **hidden-complexity:** 3 findings
- **assumption:** 3 findings
- **dependency:** 2 findings
- **scope:** 2 findings
- **completeness:** 4 findings
- **boundary:** 1 findings

## Findings

```yaml
- id: F001
  category: contradiction
  confidence: high
  severity: blocking
  affected_units: [unit-03-elaboration-integration, unit-04-designer-hat-integration]
  title: "Contradictory design artifact storage locations between unit-03 and unit-04"
  description: >
    Unit-03 specifies that provider-native artifacts are saved to the mockups/
    directory (Section 2, line 49: "Write native artifact to mockups/" and
    success criterion: "Provider-native artifacts (.op, .pen, Canva design IDs)
    are saved to mockups/ directory"). Unit-04 explicitly contradicts this
    (Section 6, lines 130-134: "Provider-native design files should be stored in
    .ai-dlc/{intent}/designs/ (not mockups/) to distinguish them from wireframe
    previews"). A builder implementing unit-03 would put .op files in mockups/;
    a builder implementing unit-04 would put .op files in designs/. Unit-02 and
    unit-05 both reference design_ref paths resolved from these directories, so
    the inconsistency would propagate to visual review failures.
  evidence: >
    unit-03-elaboration-integration.md line 49: "Write native artifact to mockups/"
    unit-03-elaboration-integration.md line 129: "Provider-native artifacts (.op, .pen, Canva design IDs) are saved to mockups/ directory"
    unit-04-designer-hat-integration.md lines 130-134: "Provider-native design files should be stored in .ai-dlc/{intent}/designs/ (not mockups/)"
  suggested_fix: >
    Choose one canonical location. Recommendation: use .ai-dlc/{intent}/designs/
    for provider-native format files and mockups/ for PNG exports only. Update
    unit-03 to match unit-04's convention, and update unit-03's success criteria
    and Section 2 flow accordingly.
  fix_type: spec_edit
  fix_target: unit-03-elaboration-integration.md

- id: F002
  category: contradiction
  confidence: high
  severity: blocking
  affected_units: [unit-01-schema-config-capabilities, intent.md]
  title: "OpenPencil conflates two distinct open-source projects into one provider type"
  description: >
    Discovery.md documents two separate projects both called OpenPencil:
    (1) ZSeven-W/openpencil (MIT, .op JSON format, op CLI, 8-framework code
    export) and (2) open-pencil/open-pencil (90+ MCP tools, .fig format,
    Tauri desktop app, Figma file compatibility). These have different file
    formats, different MCP tool surfaces, and different architectures. All unit
    specs treat "openpencil" as a single provider type with a single schema
    (openpencil.schema.json). Unit-01's MCP hint uses
    mcp__*openpencil*|mcp__*open_pencil* which would match both projects
    indiscriminately. A user with the open-pencil/open-pencil tools would get
    instructions for ZSeven's op CLI, which wouldn't work.
  evidence: >
    discovery.md lines 141-159: ZSeven-W/openpencil (.op format, CLI: op design)
    discovery.md lines 161-174: open-pencil/open-pencil (.fig format, 90+ MCP tools, Tauri app)
    unit-01-schema-config-capabilities.md line 67: "op for OpenPencil" (assumes ZSeven variant)
    unit-06-provider-instructions-schemas.md lines 69-74: openpencil schema with cli_path for op binary
  suggested_fix: >
    Either (a) split into two provider types: openpencil-zs and openpencil-op with
    separate schemas, MCP hints, and instructions, or (b) explicitly scope the
    openpencil provider to one variant (recommend ZSeven for its .op JSON format
    and CLI), documenting the exclusion. Update discovery.md to note the decision.
  fix_type: spec_edit
  fix_target: unit-01-schema-config-capabilities.md

- id: F003
  category: contradiction
  confidence: medium
  severity: warning
  affected_units: [unit-01-schema-config-capabilities]
  title: "Figma write_design capability listed as true but depends on which MCP server is connected"
  description: >
    Unit-01's get_provider_capabilities() hardcodes Figma as having
    write_design:true, but discovery.md documents multiple Figma MCP
    implementations with different capabilities. Framelink MCP (14K stars,
    most popular) is read-only. Figma Write Server requires Desktop app.
    Official MCP has write but some features are Claude-Code-exclusive. The
    static capability model claims Figma universally supports write, but this
    is instance-dependent. A builder using Framelink would be told the provider
    can write, attempt it, and fail.
  evidence: >
    unit-01-schema-config-capabilities.md line 86: figma capabilities include write_design:true
    discovery.md line 218: "Framelink MCP (14K stars) — Read-only"
    discovery.md line 219: "Figma Write Server — Full write access...requires Figma Desktop app"
    discovery.md line 242: "Figma (Framelink) | ...| No (Write column)"
  suggested_fix: >
    Change Figma default capabilities to write_design:false, or make capabilities
    runtime-detectable by checking which Figma MCP tools are actually available
    (presence of write tools vs only get/download tools). Alternatively, document
    that Figma capabilities assume the Write Server is connected.
  fix_type: spec_edit
  fix_target: unit-01-schema-config-capabilities.md

- id: F004
  category: contradiction
  confidence: high
  severity: warning
  affected_units: [unit-03-elaboration-integration, unit-04-designer-hat-integration]
  title: "Inconsistent design_ref path format for local provider files between unit-03 and unit-04"
  description: >
    Unit-03 sets design_ref to mockups/ paths for local formats
    (e.g., "design_ref: mockups/unit-{NN}-{slug}-wireframe.op"). Unit-04 would
    set design_ref to designs/ paths (e.g., implied by .ai-dlc/{intent}/designs/
    storage). Unit-02's resolve-design-ref.sh needs to resolve these paths, but
    the same provider's artifacts would have different path prefixes depending on
    whether they were created during elaboration (unit-03) or execution (unit-04).
  evidence: >
    unit-03-elaboration-integration.md line 73: "Set design_ref: mockups/unit-{NN}-{slug}-wireframe.op"
    unit-04-designer-hat-integration.md lines 131-133: ".ai-dlc/{intent}/designs/unit-{NN}-{slug}.op"
  suggested_fix: >
    Align with the resolution from F001. If designs/ is the canonical location
    for native formats, update unit-03 to write native formats there and
    PNGs to mockups/. Ensure design_ref always points to the native format
    regardless of which phase created it.
  fix_type: spec_edit
  fix_target: unit-03-elaboration-integration.md

- id: F005
  category: hidden-complexity
  confidence: high
  severity: blocking
  affected_units: [unit-02-design-ref-resolution]
  title: "Instruction file pattern introduces unspecified agent-shell contract"
  description: >
    Unit-02 introduces a novel pattern where shell scripts write .instructions.md
    files that agents later execute. This pattern doesn't exist elsewhere in the
    codebase and introduces significant hidden complexity: (1) No format
    specification for instruction files, (2) No mechanism for agents to discover
    pending instruction files, (3) No error reporting from agent execution back
    to the pipeline, (4) No timeout or retry semantics, (5) No way to know if
    the export PNG was actually produced. The calling code in
    run-visual-comparison.sh would need to handle the asynchronous nature of
    this pattern, fundamentally changing its synchronous pipeline model.
  evidence: >
    unit-02-design-ref-resolution.md lines 72-73: "write an instruction file...
    containing the MCP tool call the agent should execute"
    unit-02-design-ref-resolution.md line 98: "needs_agent_export flag tells the
    calling context whether the PNG is ready or requires an additional agent step"
    unit-05-visual-review-integration.md lines 80-82: "read the export_instructions
    file and include it in the comparison context as a TODO for agent"
  suggested_fix: >
    Define the instruction file format explicitly (YAML frontmatter with tool
    name, parameters, expected output path, timeout). Document the handoff
    protocol: who reads the file, when, and how success/failure is reported.
    Consider whether the instruction file should be a structured JSON rather
    than markdown to enable programmatic consumption. Add a success criterion
    to unit-02 requiring the format to be documented.
  fix_type: add_criterion
  fix_target: unit-02-design-ref-resolution.md

- id: F006
  category: hidden-complexity
  confidence: medium
  severity: warning
  affected_units: [unit-03-elaboration-integration]
  title: "Forked subagent MCP tool availability is fundamentally uncertain"
  description: >
    The elaborate-wireframes skill runs as a forked subagent. Unit-03 acknowledges
    this risk but the mitigation (including MCP hint patterns in the brief) doesn't
    solve the core problem: forked subagents may not have MCP connections at all.
    The skill definition header says context: fork, which means it gets its own
    tool context. Whether MCP tools from platform connectors (like Canva) are
    available in forked contexts is platform-dependent and not documented.
  evidence: >
    plugin/skills/elaborate-wireframes/SKILL.md header: likely "context: fork"
    unit-03-elaboration-integration.md line 138: "The wireframes subagent may not
    have access to the same MCP tools as the parent agent"
    discovery.md line 83: "Runs as a forked subagent during Phase 6.25"
  suggested_fix: >
    Add a success criterion requiring that the skill verify MCP tool availability
    at runtime (via ToolSearch) before attempting provider delegation, with
    explicit fallback to HTML. Document the known behavior of MCP tool inheritance
    in forked contexts.
  fix_type: add_criterion
  fix_target: unit-03-elaboration-integration.md

- id: F007
  category: hidden-complexity
  confidence: medium
  severity: warning
  affected_units: [unit-01-schema-config-capabilities, unit-04-designer-hat-integration]
  title: "Penpot write operations require active browser session, limiting autonomous use"
  description: >
    Discovery.md documents that Penpot's MCP server communicates via WebSocket
    to a Penpot Plugin running inside the browser. Write operations (create,
    modify) require an active browser session. Unit-01 lists Penpot as having
    write_design:true and generate_wireframe:true. Unit-04 instructs agents to
    "Use Penpot MCP to create design elements in the open canvas." In autonomous
    (OHOTL/AHOTL) modes, no browser session may be available, making Penpot
    write capabilities unreliable.
  evidence: >
    discovery.md lines 199-200: "Requires browser session for canvas operations
    (Penpot Plugin runs in browser context)"
    unit-01-schema-config-capabilities.md line 84: penpot write_design:true,
    generate_wireframe:true
    unit-04-designer-hat-integration.md line 97: "Use Penpot MCP to create design
    elements in the open canvas"
  suggested_fix: >
    Add a note to Penpot's capabilities that write_design and generate_wireframe
    require an active browser session. Consider adding a capability qualifier
    (e.g., requires_browser:true) or changing Penpot's generate_wireframe to false
    with a note that it's available when a browser session is active.
  fix_type: spec_edit
  fix_target: unit-01-schema-config-capabilities.md

- id: F008
  category: assumption
  confidence: high
  severity: blocking
  affected_units: [unit-02-design-ref-resolution]
  title: "Canva export-design MCP tool assumed to produce local PNG file"
  description: >
    Unit-02 assumes that calling mcp__claude_ai_Canva__export-design produces
    a local PNG file that can be saved to the screenshots directory. Canva is a
    cloud service -- its export-design tool most likely returns a download URL
    or binary data, not a local file path. The unit specifies "save PNG to
    screenshots dir" as a single step, but this likely requires downloading
    from a URL, which introduces network dependency, error handling for failed
    downloads, and temporary file management. This assumption about the tool's
    return type could cause the entire export flow to fail.
  evidence: >
    unit-02-design-ref-resolution.md line 52: "Agent instruction: call
    mcp__claude_ai_Canva__export-design with design ID, save PNG to screenshots dir"
    discovery.md line 133: "export-design — Export to PNG/JPG/PDF/PPTX/MP4"
    (no mention of return format)
  suggested_fix: >
    Update unit-02's Canva resolution strategy to account for the actual
    export-design return format. Add a step to download the exported file from
    the returned URL. Include error handling for download failures. Verify the
    actual return type of export-design by checking the Canva MCP tool schema.
  fix_type: spec_edit
  fix_target: unit-02-design-ref-resolution.md

- id: F009
  category: assumption
  confidence: medium
  severity: warning
  affected_units: [unit-01-schema-config-capabilities, unit-02-design-ref-resolution]
  title: "CLI binary names assumed without verification against actual package names"
  description: >
    Unit-01 and unit-02 assume specific CLI binary names: op for OpenPencil and
    pencil for Pencil.dev. Discovery.md (line 188) says Pencil.dev's CLI is
    @pencil.dev/cli (an npm package name), which when installed globally via npm
    might produce a different binary name. The op command is a common namespace
    (1Password CLI is also called op). These unverified assumptions could cause
    auto-detection false positives (detecting 1Password as OpenPencil) or
    failures (looking for pencil binary when it's named pencil-dev).
  evidence: >
    unit-01-schema-config-capabilities.md line 67: "op for OpenPencil"
    unit-02-design-ref-resolution.md line 54: "CLI: op export --format png"
    discovery.md line 188: "@pencil.dev/cli" (npm package, not binary name)
    Common conflict: 1Password CLI is also named op
  suggested_fix: >
    Verify actual binary names from each provider's documentation. For OpenPencil,
    check if the CLI is op or openpencil. For Pencil.dev, check the npm package
    bin field. Add version checks (e.g., op --version should contain openpencil)
    to disambiguate from other tools sharing the same binary name.
  fix_type: spec_edit
  fix_target: unit-01-schema-config-capabilities.md

- id: F010
  category: assumption
  confidence: medium
  severity: warning
  affected_units: [unit-01-schema-config-capabilities]
  title: "All providers assumed to reliably export PNG in headless context"
  description: >
    Unit-01 lists export_png:true for all 6 providers. Discovery.md notes that
    Penpot is "Partial" on headless operation and Figma varies by MCP server.
    Excalidraw MCP community toolkit may require a browser context for rendering.
    The blanket export_png:true claim could lead integration code to attempt
    exports that silently fail or produce degraded output.
  evidence: >
    unit-01-schema-config-capabilities.md lines 81-88: All providers have export_png:true
    discovery.md line 240: "Penpot | Partial*"
    discovery.md line 241-242: Figma varies by implementation
  suggested_fix: >
    Consider marking export_png as conditional for Penpot (requires browser) and
    Figma (depends on MCP server). Alternatively, add a reliability qualifier
    so consuming code knows to have fallback behavior for unreliable exports.
  fix_type: spec_edit
  fix_target: unit-01-schema-config-capabilities.md

- id: F011
  category: dependency
  confidence: high
  severity: blocking
  affected_units: [unit-07-website-docs]
  title: "Unit-07 depends_on uses abbreviated slugs instead of full unit slugs"
  description: >
    Unit-07's frontmatter lists depends_on as [unit-02, unit-03, unit-04, unit-05,
    unit-06]. All other units use full slugs (e.g., unit-01-schema-config-capabilities,
    unit-02-design-ref-resolution). The DAG resolver likely matches against full
    filenames minus the .md extension. Abbreviated slugs would fail to match,
    potentially causing unit-07 to be scheduled before its dependencies are complete.
  evidence: >
    unit-07-website-docs.md lines 5-9: "depends_on: [unit-02, unit-03, unit-04,
    unit-05, unit-06]"
    unit-02-design-ref-resolution.md line 5: "depends_on: [unit-01-schema-config-capabilities]"
    (all other units use full slugs)
  suggested_fix: >
    Replace abbreviated slugs with full slugs: [unit-02-design-ref-resolution,
    unit-03-elaboration-integration, unit-04-designer-hat-integration,
    unit-05-visual-review-integration, unit-06-provider-instructions-schemas].
  fix_type: spec_edit
  fix_target: unit-07-website-docs.md

- id: F012
  category: dependency
  confidence: medium
  severity: warning
  affected_units: [unit-03-elaboration-integration, unit-06-provider-instructions-schemas]
  title: "Unit-03 duplicates provider instructions without depending on unit-06"
  description: >
    Unit-03 contains detailed per-provider generation instructions (Section 3,
    lines 59-98) covering Canva, OpenPencil, Pencil.dev, Penpot, Excalidraw,
    and Figma. Unit-06 creates the canonical provider-specific instructions in
    design.md (Section 2, lines 163-215). Unit-03 does not list unit-06 as a
    dependency. If unit-03 is built first, its hardcoded instructions could
    diverge from the canonical instructions unit-06 establishes. This creates
    a maintenance burden where provider instructions exist in two places.
  suggested_fix: >
    Either add unit-06 as a dependency of unit-03 so the canonical instructions
    exist first, or refactor unit-03 to reference design.md instructions rather
    than hardcoding them. The latter approach is cleaner -- the skill should
    load provider instructions from the three-tier merge system rather than
    embedding them.
  evidence: >
    unit-03-elaboration-integration.md lines 59-98: Per-provider instruction blocks
    unit-06-provider-instructions-schemas.md lines 163-215: Canonical provider instructions
    unit-03-elaboration-integration.md line 7: depends_on does not include unit-06
  fix_type: add_dependency
  fix_target: unit-03-elaboration-integration.md

- id: F013
  category: scope
  confidence: medium
  severity: suggestion
  affected_units: [unit-01-schema-config-capabilities]
  title: "code_export and collaboration capabilities are beyond intent scope"
  description: >
    The intent's problem statement focuses on design providers for wireframe
    generation and visual review. The capability model in unit-01 includes
    code_export and collaboration capabilities that are not mentioned in any
    intent success criterion and are not consumed by any integration unit
    (03, 04, 05). These appear to be speculative capabilities for future use
    rather than serving the current intent's stated goals.
  evidence: >
    intent.md problem statement: focuses on wireframes, visual review, higher-fidelity design
    unit-01 lines 24, 82-88: code_export and collaboration in capability model
    No success criterion in intent.md references code_export or collaboration
  suggested_fix: >
    Consider removing code_export and collaboration from the initial capability
    model to reduce scope. They can be added in a follow-up intent. If kept,
    add a note that they are included for completeness but not exercised by
    current integration units.
  fix_type: spec_edit
  fix_target: unit-01-schema-config-capabilities.md

- id: F014
  category: scope
  confidence: medium
  severity: suggestion
  affected_units: [unit-05-visual-review-integration]
  title: "MCP server TypeScript changes expand scope beyond visual review pipeline"
  description: >
    Unit-05 Section 5 proposes enhancing the MCP server (plugin/mcp-server/src/server.ts)
    to support side-by-side image comparison and provider-native design URL links
    in ask_user_visual_question. The unit's boundary statement says it only modifies
    the visual review and comparison pipeline, but the MCP server is a distinct
    TypeScript service. Modifying it introduces cross-language concerns (the rest
    of the unit is shell scripts and markdown).
  evidence: >
    unit-05-visual-review-integration.md lines 86-93: "Support embedding two
    images side-by-side...Support linking to provider-native design URLs"
    unit-05-visual-review-integration.md line 120: "It only modifies the visual
    review and comparison pipeline"
  suggested_fix: >
    Either expand unit-05's boundary statement to explicitly include MCP server
    modifications, or move the MCP server changes into a separate unit that
    unit-05 depends on. If the existing tool already handles arbitrary HTML
    context (as the unit notes: "these enhancements may be minimal"), explicitly
    verify this and remove the section if no changes are needed.
  fix_type: spec_edit
  fix_target: unit-05-visual-review-integration.md

- id: F015
  category: completeness
  confidence: high
  severity: warning
  affected_units: [unit-02-design-ref-resolution]
  title: "No specification for instruction file format"
  description: >
    Unit-02 introduces .instructions.md files that shell scripts write for agents
    to execute, but doesn't define the file format. Without a specification,
    builders of unit-02, unit-03, and unit-05 (which all interact with these
    files) would each invent their own format. Key unspecified elements: file
    structure (YAML frontmatter? plain markdown?), required fields (tool name,
    parameters, expected output path, timeout), success/failure reporting
    mechanism, and versioning.
  evidence: >
    unit-02-design-ref-resolution.md line 72: "write an instruction file at
    {screenshots_dir}/ref-{unit_slug}.instructions.md containing the MCP tool
    call the agent should execute"
    No format specification anywhere in the unit
  suggested_fix: >
    Add a subsection to unit-02's Technical Specification defining the instruction
    file format. Include required fields, example content, and how consuming
    agents should process and report results. Add a success criterion verifying
    the format is documented and consistent.
  fix_type: add_criterion
  fix_target: unit-02-design-ref-resolution.md

- id: F016
  category: completeness
  confidence: high
  severity: warning
  affected_units: [unit-01-schema-config-capabilities]
  title: "No success criterion for auto-detection priority ordering"
  description: >
    Unit-01 specifies a priority order for auto-detection (configured > canva >
    figma > openpencil > pencil > penpot > excalidraw) in the technical spec
    but no success criterion verifies this ordering. A builder could implement
    alphabetical order or random selection and still pass all 8 listed criteria.
    The ordering matters because users with multiple providers expect deterministic
    behavior.
  evidence: >
    unit-01-schema-config-capabilities.md line 71: "Priority order for auto-detection:
    configured > canva (already connected) > figma > openpencil > pencil > penpot > excalidraw"
    unit-01-schema-config-capabilities.md lines 115-122: 8 success criteria, none
    verifying priority order
  suggested_fix: >
    Add a success criterion: "detect_design_provider() returns providers in the
    documented priority order: canva > figma > openpencil > pencil > penpot > excalidraw
    when multiple providers are available simultaneously."
  fix_type: add_criterion
  fix_target: unit-01-schema-config-capabilities.md

- id: F017
  category: completeness
  confidence: medium
  severity: warning
  affected_units: [unit-05-visual-review-integration]
  title: "'Update design ref' response handler mechanism is unspecified"
  description: >
    Unit-05 Mode B includes an "Update design ref" user response option that
    should "Update design_ref to match the new built output (the design evolved)."
    This doesn't specify the mechanism: does it screenshot the built output and
    set that as the new design_ref? Does it create a new provider artifact? Does
    it simply update the frontmatter to point to the built screenshot? The lack
    of specification would force the builder to guess.
  evidence: >
    unit-05-visual-review-integration.md lines 66-67: '"Update design ref": Update
    design_ref to match the new built output (the design evolved)'
  suggested_fix: >
    Specify the mechanism: e.g., "Take a screenshot of the current built output,
    save it as the new reference PNG at {screenshots_dir}/ref-{unit_slug}.png,
    and update the unit frontmatter design_ref to point to this screenshot.
    If the unit previously had a provider URI, replace it with the local
    screenshot path."
  fix_type: spec_edit
  fix_target: unit-05-visual-review-integration.md

- id: F018
  category: completeness
  confidence: high
  severity: warning
  affected_units: [unit-02-design-ref-resolution]
  title: "Cache invalidation for exported PNGs lacks specification"
  description: >
    Unit-02 mentions caching exported PNGs with hash-based naming
    (ref-{unit_slug}-{hash}.png) but doesn't specify the hash function,
    whether it hashes the URI string or content, cache TTL, or invalidation
    triggers. Without specification, builders would implement incompatible
    caching strategies that could serve stale screenshots during visual review.
  evidence: >
    unit-02-design-ref-resolution.md line 119: "Cached exports should use a naming
    convention like ref-{unit_slug}-{hash}.png where hash is derived from the URI"
    No specification of hash function, TTL, or invalidation strategy
  suggested_fix: >
    Specify: use SHA-256 of the URI string, truncated to 8 hex characters.
    Cache is valid for the current bolt (iteration). On new iteration, re-export
    unconditionally. Add a success criterion requiring cache invalidation behavior.
  fix_type: add_criterion
  fix_target: unit-02-design-ref-resolution.md

- id: F019
  category: boundary
  confidence: medium
  severity: suggestion
  affected_units: [unit-03-elaboration-integration, unit-06-provider-instructions-schemas]
  title: "Per-provider instructions duplicated in unit-03 and unit-06"
  description: >
    Unit-03 Section 3 hardcodes detailed per-provider generation instructions
    (6 providers, ~40 lines of instructions). Unit-06 Section 2 creates the
    canonical provider instructions in design.md with per-provider sections
    (~50 lines). These are overlapping responsibilities. Unit-03 embeds
    instructions that should be loaded from the three-tier merge system
    that unit-06 establishes.
  evidence: >
    unit-03-elaboration-integration.md lines 59-98: Canva, OpenPencil (CLI/MCP),
    Pencil.dev, Penpot, Excalidraw, Figma instruction blocks
    unit-06-provider-instructions-schemas.md lines 163-215: Provider-specific
    instruction sections for all 6 providers
  suggested_fix: >
    Refactor unit-03 to reference design.md provider instructions via the
    three-tier merge system instead of hardcoding them. The elaborate-wireframes
    skill should load provider instructions from the brief (which includes
    merged instructions from config.sh) rather than containing its own copy.
    This also resolves the missing dependency identified in F012.
  fix_type: spec_edit
  fix_target: unit-03-elaboration-integration.md
```
