# Capture Interface

Pluggable screenshot capture system for AI-DLC design backpressure.

## CLI Arguments

The dispatcher (`capture-screenshots.sh`) accepts:

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `--provider <name>` | No | `playwright` | Capture provider to use |
| `--output-dir <path>` | Yes | — | Directory to write screenshots and manifest |
| `--breakpoints <widths>` | No | `375,768,1280` | Comma-separated viewport widths |
| `--prefix <string>` | No | `""` | Filename prefix for screenshots |

Provider-specific arguments are passed through to the selected provider.

### Playwright Provider Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `--url <base-url>` | One of `--url` or `--static` | — | Base URL to capture |
| `--static <path>` | One of `--url` or `--static` | — | Local HTML file to capture via `file://` |
| `--routes <spec>` | No | `/` | Comma-separated routes to capture |
| `--wait-for <selector>` | No | — | CSS selector to wait for before capture |

### Manual Provider Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `--input-dir <path>` | Yes | — | Directory containing pre-captured images |

## Output Directory Structure

```
.ai-dlc/{intent}/screenshots/{unit}/
├── manifest.json
├── mobile-home.png
├── tablet-home.png
├── desktop-home.png
├── mobile-about.png
├── tablet-about.png
└── desktop-about.png
```

## Manifest Schema

All providers write a `manifest.json` in the output directory:

```json
{
  "provider": "playwright",
  "captured_at": "2026-03-27T12:00:00.000Z",
  "breakpoints": [375, 768, 1280],
  "screenshots": [
    {
      "breakpoint": 375,
      "view": "home",
      "path": "mobile-home.png"
    },
    {
      "breakpoint": 768,
      "view": "home",
      "path": "tablet-home.png"
    },
    {
      "breakpoint": 1280,
      "view": "home",
      "path": "desktop-home.png"
    }
  ]
}
```

### Breakpoint Name Mapping

| Width | Name |
|-------|------|
| 375 | mobile |
| 768 | tablet |
| 1280 | desktop |

Custom breakpoints use the width as the name (e.g., `1920` → `1920`).

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success — all screenshots captured, manifest written |
| 1 | General failure — capture failed, missing args, etc. |
| 2 | Provider not found |
| 3 | Dependency missing (e.g., Playwright not installed) |

## Adding a Provider

1. Create `plugin/lib/capture-{name}.sh`
2. Accept all standard arguments plus provider-specific ones
3. Write screenshots to `--output-dir`
4. Write `manifest.json` with the schema above
5. Exit 0 on success, non-zero on failure
