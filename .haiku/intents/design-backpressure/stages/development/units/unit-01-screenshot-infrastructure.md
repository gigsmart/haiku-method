---
name: unit-01-screenshot-infrastructure
type: backend
status: completed
depends_on: []
bolt: 0
hat: ""
started_at: null
completed_at: null
---


# unit-01-screenshot-infrastructure

## Description
Set up pluggable screenshot capture infrastructure as a foundation for the visual fidelity backpressure gate. This unit defines a capture interface that is platform-agnostic (web, mobile, desktop), implements Playwright as the default capture provider for web projects, establishes screenshot storage conventions, and provides reference screenshot capture for wireframes and design files.

## Discipline
backend - This unit will be executed by backend-focused agents.

## Domain Entities
- **Screenshot** — This unit defines the capture mechanism and storage format. Establishes file naming convention (`{breakpoint}-{view}.png`), directory structure (`.ai-dlc/{intent-slug}/screenshots/{unit-slug}/`), and default viewport configurations (mobile 375px, tablet 768px, desktop 1280px).
- **CaptureProvider** — New entity introduced by this unit. A pluggable interface for platform-specific screenshot capture. Each provider knows how to capture screenshots for its platform (web via Playwright, mobile via simulator, etc.).

## Data Sources
- **Dev server / app runtime** — The capture provider connects to whatever serves the UI (web dev server, simulator, static files, etc.). The interface is URL-based by default but providers can extend with platform-specific connection methods.
- **Unit frontmatter** (filesystem) — Reads `wireframe:` field to locate wireframe HTML files for reference capture.
- **Project config** — `.ai-dlc/settings.yml` or intent-level config to specify which capture provider to use and its configuration.

## Technical Specification

### 1. Capture Interface
Define a standard capture interface at `plugin/lib/capture-interface.md` documenting the contract that all capture providers must implement:

**Input contract (arguments):**
- `--provider <name>` — Which capture provider to use (default: `playwright`)
- `--targets <spec>` — What to capture. Format varies by provider:
  - Web: `--url <base-url> --routes <comma-separated-paths>`
  - Static: `--static <html-file-or-dir>`
  - Mobile: `--simulator <device-id> --screens <screen-names>`
  - Manual: `--input-dir <path>` (pre-captured screenshots)
- `--output-dir <path>` — Where to save screenshots
- `--breakpoints <widths>` — Viewport widths (default: `375,768,1280`)
- `--prefix <string>` — Filename prefix (default: empty, use `ref-` for reference screenshots)

**Output contract:**
- Screenshots saved as PNG at `{output-dir}/{prefix}{breakpoint}-{view}.png`
- JSON manifest written to `{output-dir}/manifest.json`:
  ```json
  {
    "provider": "playwright",
    "captured_at": "2026-03-27T22:00:00Z",
    "breakpoints": [375, 768, 1280],
    "screenshots": [
      {"breakpoint": 375, "view": "home", "path": "mobile-home.png"},
      {"breakpoint": 768, "view": "home", "path": "tablet-home.png"},
      {"breakpoint": 1280, "view": "home", "path": "desktop-home.png"}
    ]
  }
  ```
- Exit code 0 on success, non-zero on any capture failure

### 2. Playwright Capture Provider (Default)
Create `plugin/lib/capture-playwright.sh` implementing the capture interface for web projects:
- Requires Playwright with Chromium installed
- Accepts `--url <base-url>` (default: `http://localhost:3000`) and `--routes <comma-separated-paths>`
- Accepts `--static <html-file>` to open local HTML files directly (for wireframes)
- For each route/file, captures full-page screenshots at each breakpoint
- Waits for network idle before capturing (handles async-loaded content)
- Supports `--wait-for <selector>` for pages with lazy-loaded content

### 3. Manual Capture Provider (Fallback)
Create `plugin/lib/capture-manual.sh` for platforms without automated capture:
- Accepts `--input-dir <path>` pointing to a directory of pre-captured screenshots
- Validates that screenshots exist and match expected naming convention
- Copies/links them to the output directory with correct names
- Writes the manifest.json
- This provider enables mobile, desktop, or any platform where screenshots are captured externally (e.g., via Xcode Simulator screenshots, Android emulator, manual device capture)

### 4. Dispatcher Script
Create `plugin/lib/capture-screenshots.sh` as the main entry point:
- Reads `--provider` argument (default: `playwright`)
- Delegates to the appropriate provider script (`capture-{provider}.sh`)
- Validates provider exists, passes through all arguments
- If provider script not found, exits with clear error message listing available providers

### 5. Playwright Installation
Add Playwright as a dev dependency to the plugin:
- Install Chromium only (not Firefox/WebKit — keeps install size small)
- Include a setup script or Makefile target: `make install-playwright`
- The setup is opt-in per project — projects that don't use the Playwright provider don't need to install it

### 6. Storage Convention
Define the screenshot storage directory structure:
```
.ai-dlc/{intent-slug}/screenshots/{unit-slug}/
  ├── manifest.json             # Capture metadata and file listing
  ├── mobile-{view}.png         # Built output at 375px
  ├── tablet-{view}.png         # Built output at 768px
  ├── desktop-{view}.png        # Built output at 1280px
  ├── ref-mobile-{view}.png     # Design reference at 375px
  ├── ref-tablet-{view}.png     # Design reference at 768px
  └── ref-desktop-{view}.png    # Design reference at 1280px
```

### 7. Reference Screenshot Capture
The capture utility supports reference screenshots (design intent images):
- For wireframe HTML files: use Playwright provider in `--static` mode with `--prefix ref-`
- For external design files (PNGs, JPGs): use manual provider with `--prefix ref-`
- For Figma exports: download via design provider MCP, then use manual provider
- Reference screenshots use the same breakpoint naming convention for 1:1 comparison

## Success Criteria
- [x] Capture interface documented at `plugin/lib/capture-interface.md` with input/output contracts
- [x] `plugin/lib/capture-screenshots.sh` dispatcher routes to correct provider based on `--provider` flag
- [x] Playwright provider (`capture-playwright.sh`) captures screenshots at 3 breakpoints (375px, 768px, 1280px)
- [x] Playwright provider works with both URL mode (`--url`) and static HTML mode (`--static`)
- [x] Manual provider (`capture-manual.sh`) validates and copies pre-captured screenshots
- [x] All providers write `manifest.json` with consistent schema
- [x] Screenshots saved to correct directory structure with correct naming convention
- [x] All providers return non-zero exit code on capture failure
- [x] Wireframe HTML files from `.ai-dlc/{intent}/mockups/` can be captured as reference screenshots via Playwright provider

## Risks
- **Playwright install size**: Chromium download is ~150MB. Mitigation: install Chromium only, not all browsers. Make installation opt-in per project.
- **Headless environment compatibility**: CI/CD or remote environments may not support Playwright. Mitigation: use headless mode (default), document system requirements, fall back to manual provider.
- **Dev server startup**: Playwright provider requires a running dev server. Mitigation: the provider does not manage the dev server — callers are responsible. Document this requirement.
- **Provider proliferation**: Too many providers adds maintenance burden. Mitigation: ship only `playwright` and `manual`. Additional providers are community contributions or follow-up intents.

## Boundaries
This unit does NOT handle:
- Design reference resolution logic — which reference to use for a given unit (unit-02 owns that)
- AI vision comparison (unit-03 owns that)
- Reviewer hat integration (unit-03 owns that)
- Documentation updates (unit-04 owns that)
- Platform-specific providers beyond Playwright and manual (follow-up intents)

This unit ONLY provides the capture interface, two default providers (Playwright + manual), and storage conventions.

## Notes
- The website uses Next.js 15 with `output: "export"` — static builds can be served with `npx serve out/` or similar
- Playwright's `page.screenshot({ fullPage: true })` captures the entire scrollable content
- The manual provider is the escape hatch for any platform — users capture screenshots however they want and provide them as input
- The manifest.json enables downstream tools (unit-03's vision comparison) to discover screenshots without glob patterns
- Consider `.ai-dlc/settings.yml` field: `capture_provider: playwright` as project-level default
