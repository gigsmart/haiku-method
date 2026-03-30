import type { ParsedIntent, ParsedUnit, CriterionItem } from "@ai-dlc/shared";

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

export function generateReviewHtml(
  intent: ParsedIntent,
  units: ParsedUnit[],
  criteria: CriterionItem[],
  reviewType: "intent" | "unit",
  target: string,
  sessionId: string,
  mermaid: string
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
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f5; color: #333; padding: 2rem; }
    .container { max-width: 800px; margin: 0 auto; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    h2 { font-size: 1.2rem; margin: 1.5rem 0 0.5rem; color: #555; }
    h3 { font-size: 1rem; margin: 1rem 0 0.5rem; }
    .card { background: #fff; border-radius: 8px; padding: 1.5rem; margin-bottom: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
    .badge.intent { background: #e0e7ff; color: #3730a3; }
    .badge.unit { background: #fef3c7; color: #92400e; }
    .criteria { list-style: none; padding: 0; }
    .criteria li { padding: 0.25rem 0; }
    .criteria .checked { color: #16a34a; }
    .criteria .unchecked { color: #6b7280; }
    .unit-card { border-left: 3px solid #6366f1; padding-left: 1rem; margin: 0.75rem 0; }
    .unit-card .status { font-size: 0.8rem; color: #6b7280; }
    .mermaid-section { background: #fafafa; border: 1px solid #e5e7eb; border-radius: 4px; padding: 1rem; overflow-x: auto; }
    .mermaid-section pre { font-size: 0.8rem; white-space: pre-wrap; }
    .actions { margin-top: 2rem; }
    .actions textarea { width: 100%; min-height: 100px; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 6px; font-family: inherit; font-size: 0.9rem; resize: vertical; margin-bottom: 1rem; }
    .btn-group { display: flex; gap: 0.75rem; }
    .btn { padding: 0.6rem 1.5rem; border: none; border-radius: 6px; font-size: 0.95rem; font-weight: 600; cursor: pointer; transition: background 0.15s; }
    .btn-approve { background: #16a34a; color: #fff; }
    .btn-approve:hover { background: #15803d; }
    .btn-reject { background: #dc2626; color: #fff; }
    .btn-reject:hover { background: #b91c1c; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .result { margin-top: 1rem; padding: 1rem; border-radius: 6px; display: none; }
    .result.success { display: block; background: #dcfce7; color: #166534; }
    .result.error { display: block; background: #fee2e2; color: #991b1b; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <span class="badge ${reviewType}">${reviewType} review</span>
      <h1>${escapeHtml(intent.title)}</h1>
      ${problem ? `<h2>Problem</h2><p>${escapeHtml(problem)}</p>` : ""}
      ${solution ? `<h2>Solution</h2><p>${escapeHtml(solution)}</p>` : ""}
    </div>

    ${
      targetUnit
        ? `<div class="card">
      <h2>Unit: ${escapeHtml(targetUnit.title)}</h2>
      <p class="status">Status: ${escapeHtml(targetUnit.frontmatter.status)}</p>
      ${(() => {
        const cc = findSection(targetUnit.sections, "Completion Criteria");
        return cc ? `<h3>Completion Criteria</h3><pre>${escapeHtml(cc)}</pre>` : "";
      })()}
    </div>`
        : ""
    }

    <div class="card">
      <h2>Units</h2>
      ${units
        .map(
          (u) => `<div class="unit-card">
        <strong>${escapeHtml(u.title)}</strong>
        <div class="status">${escapeHtml(u.frontmatter.status)}${u.frontmatter.depends_on?.length ? ` · depends on: ${u.frontmatter.depends_on.join(", ")}` : ""}</div>
      </div>`
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
      <div class="mermaid-section"><pre>${escapeHtml(mermaid)}</pre></div>
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

  <script>
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
