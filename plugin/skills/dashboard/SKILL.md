---
description: Generate a static HTML dashboard from .ai-dlc/ data for offline viewing and sharing
disable-model-invocation: true
user-invocable: true
argument-hint: "[--output <dir>]"
---

## Name

`ai-dlc:dashboard` - Generate a static HTML dashboard from AI-DLC intent and unit data.

## Synopsis

```
/dashboard
/dashboard --output ./reports/dashboard
```

## Description

**User-facing command** - Generate a self-contained static HTML dashboard from the `.ai-dlc/` directory in the current project.

The dashboard renders all intents, units, DAG visualizations, completion criteria, and status information as static HTML pages suitable for offline viewing, sharing, or archiving.

### What it generates

- **Index page** listing all intents with status summaries
- **Intent detail pages** with unit breakdowns, DAG diagrams, and completion criteria
- **Unit detail pages** with full specification content

### Usage

Run `/dashboard` to generate the dashboard with default settings:

```
/dashboard
```

This generates the site into `.ai-dlc/dashboard/` and reports the output path.

To specify a custom output directory:

```
/dashboard --output ./my-reports/
```

Then open the generated `index.html` in any browser.

### Prerequisites

- **Bun** must be installed (`curl -fsSL https://bun.sh/install | bash`)
- Run `bun install` from the project root to resolve workspace dependencies

### Visual Review Channel

For interactive, real-time visual reviews (where the agent opens a browser review page and waits for your decision), enable the review channel:

```bash
claude --dangerously-load-development-channels server:ai-dlc-review
```

This starts the `ai-dlc-review` MCP server which provides:
- `open_review` — opens an interactive review page in your browser
- `get_review_status` — polls for your approval/rejection decision

The review flow:
1. Agent calls `open_review` with the intent/unit to review
2. Browser opens with a rendered review page showing specs, DAG, and criteria
3. You review and click **Approve** or **Request Changes** (with optional feedback)
4. Agent polls `get_review_status` and continues based on your decision

### Static Dashboard vs. Review Channel

| Feature | `/dashboard` | Review Channel |
|---------|-------------|----------------|
| Purpose | Offline viewing & sharing | Interactive review during execution |
| Output | Static HTML files | Live browser page |
| Interaction | Read-only | Approve / Request Changes |
| Requires MCP | No | Yes |

## Tool Call

```bash
bun run ${CLAUDE_PLUGIN_ROOT}/cli/src/dashboard.ts --input .ai-dlc/ --output ${OUTPUT_DIR}
```

Where `${OUTPUT_DIR}` defaults to `.ai-dlc/dashboard/` if not specified by the user.

After generation, report:
- The output path
- Number of intents and pages generated
- Suggest: `Open ${OUTPUT_DIR}/index.html in your browser to view`
