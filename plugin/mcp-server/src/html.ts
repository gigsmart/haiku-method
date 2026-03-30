import type { ParsedIntent, ParsedUnit, CriterionItem } from "@ai-dlc/shared";

export interface MockupInfo {
  /** Label shown in the UI */
  label: string;
  /** URL path to serve the mockup (relative to HTTP root) */
  url: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function findSection(
  sections: { heading: string; content: string; subsections: { heading: string; content: string }[] }[],
  name: string
): string {
  const section = sections.find(
    (s) => s.heading.toLowerCase() === name.toLowerCase()
  );
  return section?.content ?? "";
}

function renderCriteria(criteria: CriterionItem[]): string {
  if (criteria.length === 0) return "<p>No criteria defined.</p>";
  return `<ul class="criteria">${criteria
    .map(
      (c) =>
        `<li class="${c.checked ? "checked" : "unchecked"}">${c.checked ? "&#9745;" : "&#9744;"} ${escapeHtml(c.text)}</li>`
    )
    .join("")}</ul>`;
}

function renderMockups(mockups: MockupInfo[]): string {
  if (mockups.length === 0) return "";
  return mockups
    .map(
      (m) => `<div class="mockup-embed">
        <h3>${escapeHtml(m.label)}</h3>
        <iframe src="${escapeHtml(m.url)}" sandbox="allow-scripts allow-same-origin"></iframe>
      </div>`
    )
    .join("");
}

export function generateReviewHtml(
  intent: ParsedIntent,
  units: ParsedUnit[],
  criteria: CriterionItem[],
  reviewType: "intent" | "unit",
  target: string,
  sessionId: string,
  mermaid: string,
  intentMockups: MockupInfo[],
  unitMockups: Map<string, MockupInfo[]>
): string {
  const problem = findSection(intent.sections, "Problem");
  const solution = findSection(intent.sections, "Solution");

  let targetUnit: ParsedUnit | undefined;
  if (reviewType === "unit" && target) {
    targetUnit = units.find((u) => u.slug === target || u.title === target);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Review: ${escapeHtml(intent.title)}</title>
  <style>
    :root {
      --bg: #f5f5f5;
      --bg-card: #fff;
      --text: #333;
      --text-muted: #555;
      --text-dim: #6b7280;
      --border: #e5e7eb;
      --border-accent: #6366f1;
      --badge-intent-bg: #e0e7ff;
      --badge-intent-text: #3730a3;
      --badge-unit-bg: #fef3c7;
      --badge-unit-text: #92400e;
      --success: #16a34a;
      --success-hover: #15803d;
      --success-bg: #dcfce7;
      --success-text: #166534;
      --danger: #dc2626;
      --danger-hover: #b91c1c;
      --danger-bg: #fee2e2;
      --danger-text: #991b1b;
      --input-border: #d1d5db;
      --mermaid-bg: #fafafa;
      --shadow: rgba(0,0,0,0.1);
    }

    @media (prefers-color-scheme: dark) {
      :root:not([data-theme="light"]) {
        --bg: #1a1a2e;
        --bg-card: #16213e;
        --text: #e0e0e0;
        --text-muted: #a0a0b0;
        --text-dim: #8888a0;
        --border: #2a2a4a;
        --border-accent: #818cf8;
        --badge-intent-bg: #312e81;
        --badge-intent-text: #c7d2fe;
        --badge-unit-bg: #78350f;
        --badge-unit-text: #fef3c7;
        --success: #22c55e;
        --success-hover: #16a34a;
        --success-bg: #14532d;
        --success-text: #bbf7d0;
        --danger: #ef4444;
        --danger-hover: #dc2626;
        --danger-bg: #7f1d1d;
        --danger-text: #fecaca;
        --input-border: #374151;
        --mermaid-bg: #1e1e3a;
        --shadow: rgba(0,0,0,0.3);
      }
    }

    :root[data-theme="dark"] {
      --bg: #1a1a2e;
      --bg-card: #16213e;
      --text: #e0e0e0;
      --text-muted: #a0a0b0;
      --text-dim: #8888a0;
      --border: #2a2a4a;
      --border-accent: #818cf8;
      --badge-intent-bg: #312e81;
      --badge-intent-text: #c7d2fe;
      --badge-unit-bg: #78350f;
      --badge-unit-text: #fef3c7;
      --success: #22c55e;
      --success-hover: #16a34a;
      --success-bg: #14532d;
      --success-text: #bbf7d0;
      --danger: #ef4444;
      --danger-hover: #dc2626;
      --danger-bg: #7f1d1d;
      --danger-text: #fecaca;
      --input-border: #374151;
      --mermaid-bg: #1e1e3a;
      --shadow: rgba(0,0,0,0.3);
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); padding: 2rem; transition: background 0.2s, color 0.2s; }
    .container { max-width: 800px; margin: 0 auto; }
    .top-bar { display: flex; justify-content: flex-end; margin-bottom: 1rem; }
    .theme-toggle { background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px; padding: 0.4rem 0.8rem; cursor: pointer; font-size: 0.85rem; color: var(--text-muted); transition: background 0.2s; }
    .theme-toggle:hover { background: var(--border); }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    h2 { font-size: 1.2rem; margin: 1.5rem 0 0.5rem; color: var(--text-muted); }
    h3 { font-size: 1rem; margin: 1rem 0 0.5rem; }
    p { line-height: 1.6; }
    .card { background: var(--bg-card); border-radius: 8px; padding: 1.5rem; margin-bottom: 1rem; box-shadow: 0 1px 3px var(--shadow); }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
    .badge.intent { background: var(--badge-intent-bg); color: var(--badge-intent-text); }
    .badge.unit { background: var(--badge-unit-bg); color: var(--badge-unit-text); }
    .criteria { list-style: none; padding: 0; }
    .criteria li { padding: 0.25rem 0; }
    .criteria .checked { color: var(--success); }
    .criteria .unchecked { color: var(--text-dim); }
    .unit-card { border-left: 3px solid var(--border-accent); padding-left: 1rem; margin: 0.75rem 0; }
    .unit-card .status { font-size: 0.8rem; color: var(--text-dim); }
    .mermaid-section { background: var(--mermaid-bg); border: 1px solid var(--border); border-radius: 4px; padding: 1rem; overflow-x: auto; }
    .mockup-embed { margin: 1rem 0; }
    .mockup-embed iframe { width: 100%; height: 500px; border: 1px solid var(--border); border-radius: 4px; background: #fff; }
    .actions { margin-top: 2rem; }
    .actions textarea { width: 100%; min-height: 100px; padding: 0.75rem; border: 1px solid var(--input-border); border-radius: 6px; font-family: inherit; font-size: 0.9rem; resize: vertical; margin-bottom: 1rem; background: var(--bg); color: var(--text); }
    .btn-group { display: flex; gap: 0.75rem; }
    .btn { padding: 0.6rem 1.5rem; border: none; border-radius: 6px; font-size: 0.95rem; font-weight: 600; cursor: pointer; transition: background 0.15s; }
    .btn-approve { background: var(--success); color: #fff; }
    .btn-approve:hover { background: var(--success-hover); }
    .btn-reject { background: var(--danger); color: #fff; }
    .btn-reject:hover { background: var(--danger-hover); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .result { margin-top: 1rem; padding: 1rem; border-radius: 6px; display: none; }
    .result.success { display: block; background: var(--success-bg); color: var(--success-text); }
    .result.error { display: block; background: var(--danger-bg); color: var(--danger-text); }
  </style>
</head>
<body>
  <div class="container">
    <div class="top-bar">
      <button class="theme-toggle" onclick="toggleTheme()" id="themeBtn">Toggle theme</button>
    </div>

    <div class="card">
      <span class="badge ${reviewType}">${reviewType} review</span>
      <h1>${escapeHtml(intent.title)}</h1>
      ${problem ? `<h2>Problem</h2><p>${escapeHtml(problem)}</p>` : ""}
      ${solution ? `<h2>Solution</h2><p>${escapeHtml(solution)}</p>` : ""}
    </div>

    ${intentMockups.length > 0 ? `<div class="card">
      <h2>Mockups</h2>
      ${renderMockups(intentMockups)}
    </div>` : ""}

    ${
      targetUnit
        ? `<div class="card">
      <h2>Unit: ${escapeHtml(targetUnit.title)}</h2>
      <p class="status">Status: ${escapeHtml(targetUnit.frontmatter.status)}</p>
      ${(() => {
        const cc = findSection(targetUnit.sections, "Completion Criteria");
        return cc ? `<h3>Completion Criteria</h3><pre>${escapeHtml(cc)}</pre>` : "";
      })()}
      ${(() => {
        const um = unitMockups.get(targetUnit!.slug) ?? [];
        return um.length > 0 ? `<h3>Wireframes</h3>${renderMockups(um)}` : "";
      })()}
    </div>`
        : ""
    }

    <div class="card">
      <h2>Units</h2>
      ${units
        .map(
          (u) => {
            const um = unitMockups.get(u.slug) ?? [];
            return `<div class="unit-card">
        <strong>${escapeHtml(u.title)}</strong>
        <div class="status">${escapeHtml(u.frontmatter.status)}${u.frontmatter.depends_on?.length ? ` · depends on: ${u.frontmatter.depends_on.join(", ")}` : ""}</div>
        ${um.length > 0 ? renderMockups(um) : ""}
      </div>`;
          }
        )
        .join("")}
    </div>

    <div class="card">
      <h2>Completion Criteria</h2>
      ${renderCriteria(criteria)}
    </div>

    ${
      mermaid
        ? `<div class="card">
      <h2>Dependency Graph</h2>
      <div class="mermaid-section"><pre class="mermaid">${escapeHtml(mermaid)}</pre></div>
    </div>`
        : ""
    }

    <div class="card actions">
      <h2>Decision</h2>
      <textarea id="feedback" placeholder="Optional feedback..."></textarea>
      <div class="btn-group">
        <button class="btn btn-approve" onclick="submitDecision('approved')">Approve</button>
        <button class="btn btn-reject" onclick="submitDecision('changes_requested')">Request Changes</button>
      </div>
      <div id="result" class="result"></div>
    </div>
  </div>

  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

    function getEffectiveTheme() {
      const stored = localStorage.getItem('ai-dlc-review-theme');
      if (stored) return stored;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function initMermaid() {
      const theme = getEffectiveTheme();
      mermaid.initialize({
        startOnLoad: true,
        theme: theme === 'dark' ? 'dark' : 'default',
        securityLevel: 'loose',
      });
    }

    initMermaid();

    // Re-render mermaid on theme change
    window.addEventListener('themeChanged', async () => {
      const theme = getEffectiveTheme();
      mermaid.initialize({
        theme: theme === 'dark' ? 'dark' : 'default',
        securityLevel: 'loose',
      });
      // Reset and re-render all mermaid diagrams
      const elements = document.querySelectorAll('.mermaid');
      for (const el of elements) {
        const original = el.getAttribute('data-original');
        if (original) {
          el.removeAttribute('data-processed');
          el.innerHTML = original;
        }
      }
      await mermaid.run();
    });

    // Store original mermaid source for re-rendering
    document.querySelectorAll('.mermaid').forEach(el => {
      el.setAttribute('data-original', el.textContent);
    });
  </script>

  <script>
    // Theme toggle
    function applyTheme(theme) {
      if (theme === 'system') {
        document.documentElement.removeAttribute('data-theme');
        localStorage.removeItem('ai-dlc-review-theme');
      } else {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('ai-dlc-review-theme', theme);
      }
      updateThemeButton();
      window.dispatchEvent(new Event('themeChanged'));
    }

    function toggleTheme() {
      const stored = localStorage.getItem('ai-dlc-review-theme');
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (!stored) {
        // Currently system — switch to opposite of system
        applyTheme(systemDark ? 'light' : 'dark');
      } else if (stored === 'dark') {
        applyTheme('light');
      } else if (stored === 'light') {
        // Go back to system
        applyTheme('system');
      }
    }

    function updateThemeButton() {
      const btn = document.getElementById('themeBtn');
      const stored = localStorage.getItem('ai-dlc-review-theme');
      if (!stored) btn.textContent = 'Theme: System';
      else if (stored === 'dark') btn.textContent = 'Theme: Dark';
      else btn.textContent = 'Theme: Light';
    }

    // Apply stored theme on load
    (function() {
      const stored = localStorage.getItem('ai-dlc-review-theme');
      if (stored) document.documentElement.setAttribute('data-theme', stored);
      updateThemeButton();
    })();

    // Decision submission
    async function submitDecision(decision) {
      const feedback = document.getElementById('feedback').value;
      const buttons = document.querySelectorAll('.btn');
      buttons.forEach(b => b.disabled = true);
      const resultEl = document.getElementById('result');
      try {
        const res = await fetch('/review/${sessionId}/decide', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision, feedback })
        });
        if (res.ok) {
          resultEl.className = 'result success';
          resultEl.textContent = 'Decision submitted: ' + decision + '. You can close this tab.';
        } else {
          throw new Error('HTTP ' + res.status);
        }
      } catch (err) {
        resultEl.className = 'result error';
        resultEl.textContent = 'Error: ' + err.message;
        buttons.forEach(b => b.disabled = false);
      }
    }
  </script>
</body>
</html>`;
}
