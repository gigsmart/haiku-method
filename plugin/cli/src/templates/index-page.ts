import type { ParsedIntent, ParsedUnit } from "@ai-dlc/shared";
import { escapeHtml, escapeAttr } from "./layout.js";
import { renderBadge, renderProgressBar } from "./components.js";

export interface IntentSummary {
  intent: ParsedIntent;
  units: ParsedUnit[];
}

/** Renders the index page body content listing all intents. */
export function renderIndexPage(intents: IntentSummary[]): string {
  const filterButtons = `
    <div class="flex flex-wrap gap-2 mb-6" role="toolbar" aria-label="Filter intents by status">
      <button data-filter="all"
              class="filter-btn px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors
                     bg-blue-600 text-white border-blue-600"
              aria-pressed="true">All</button>
      <button data-filter="in_progress"
              class="filter-btn px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors
                     border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-pressed="false">Active</button>
      <button data-filter="completed"
              class="filter-btn px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors
                     border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-pressed="false">Completed</button>
      <button data-filter="blocked"
              class="filter-btn px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors
                     border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-pressed="false">Blocked</button>
    </div>`;

  const sortControls = `
    <div class="flex items-center gap-2 mb-6">
      <label for="sort-select" class="text-sm text-gray-500 dark:text-gray-400">Sort by:</label>
      <select id="sort-select"
              class="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1
                     bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
        <option value="name">Name</option>
        <option value="date">Date</option>
      </select>
    </div>`;

  const intentCards = intents
    .map((s) => {
      const completed = s.units.filter((u) => u.frontmatter.status === "completed").length;
      const total = s.units.length;
      const disciplines = [...new Set(s.units.map((u) => u.frontmatter.discipline).filter(Boolean))];
      const created = s.intent.frontmatter.created ?? "";

      return `<a href="intents/${escapeAttr(s.intent.slug)}/index.html"
                 class="intent-card block bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 transition-all"
                 data-status="${escapeAttr(s.intent.frontmatter.status)}"
                 data-name="${escapeAttr(s.intent.title.toLowerCase())}"
                 data-date="${escapeAttr(created)}">
        <div class="flex items-start justify-between gap-3 mb-3">
          <h2 class="text-base font-semibold text-gray-900 dark:text-gray-100 leading-tight">${escapeHtml(s.intent.title)}</h2>
          ${renderBadge("Status", s.intent.frontmatter.status)}
        </div>
        ${total > 0 ? `<div class="mb-3">${renderProgressBar(completed, total)}</div>` : ""}
        <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          ${created ? `<span>Created: ${escapeHtml(created)}</span>` : "<span></span>"}
          ${disciplines.length > 0
            ? `<div class="flex flex-wrap gap-1">${disciplines.map((d) => `<span class="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">${escapeHtml(d)}</span>`).join("")}</div>`
            : ""}
        </div>
      </a>`;
    })
    .join("");

  const filterScript = `
  <script>
    (function() {
      var cards = Array.from(document.querySelectorAll('.intent-card'));
      var buttons = Array.from(document.querySelectorAll('.filter-btn'));
      var sortSelect = document.getElementById('sort-select');
      var grid = document.getElementById('intent-grid');
      var currentFilter = 'all';

      function applyFilter(filter) {
        currentFilter = filter;
        cards.forEach(function(card) {
          var status = card.getAttribute('data-status');
          card.style.display = (filter === 'all' || status === filter) ? '' : 'none';
        });
        buttons.forEach(function(btn) {
          var isActive = btn.getAttribute('data-filter') === filter;
          btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
          if (isActive) {
            btn.className = btn.className.replace(/border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300/, '');
            btn.classList.add('bg-blue-600', 'text-white', 'border-blue-600');
            btn.classList.remove('hover:bg-gray-100', 'dark:hover:bg-gray-800');
          } else {
            btn.classList.remove('bg-blue-600', 'text-white', 'border-blue-600');
            btn.classList.add('border-gray-300', 'dark:border-gray-600', 'text-gray-700', 'dark:text-gray-300', 'hover:bg-gray-100', 'dark:hover:bg-gray-800');
          }
        });
      }

      function applySort(field) {
        var sorted = cards.slice().sort(function(a, b) {
          if (field === 'date') {
            return (b.getAttribute('data-date') || '').localeCompare(a.getAttribute('data-date') || '');
          }
          return (a.getAttribute('data-name') || '').localeCompare(b.getAttribute('data-name') || '');
        });
        sorted.forEach(function(card) { grid.appendChild(card); });
        applyFilter(currentFilter);
      }

      buttons.forEach(function(btn) {
        btn.addEventListener('click', function() {
          applyFilter(btn.getAttribute('data-filter'));
        });
      });

      if (sortSelect) {
        sortSelect.addEventListener('change', function() {
          applySort(sortSelect.value);
        });
      }
    })();
  </script>`;

  return `
    <div class="flex flex-wrap items-center justify-between gap-4 mb-2">
      ${filterButtons}
      ${sortControls}
    </div>
    <div id="intent-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      ${intentCards}
    </div>
    ${filterScript}
  `;
}
