import type { CriterionItem } from "@ai-dlc/shared";
import { escapeHtml, escapeAttr } from "./layout.js";
import { statusColors } from "./styles.js";

export interface TabDef {
  id: string;
  label: string;
  content: string;
  disabled?: boolean;
}

/**
 * ARIA-compliant tablist with arrow-key navigation.
 * Each tab has role="tab", each panel has role="tabpanel".
 */
export function renderTabs(tabGroupId: string, tabs: TabDef[]): string {
  const enabledTabs = tabs.filter((t) => !t.disabled);
  const firstEnabled = enabledTabs[0]?.id ?? "";

  const tabButtons = tabs
    .map((tab, i) => {
      const isFirst = tab.id === firstEnabled;
      const disabled = tab.disabled ?? false;
      return `<button role="tab"
        id="tab-${tabGroupId}-${tab.id}"
        aria-selected="${isFirst && !disabled ? "true" : "false"}"
        aria-controls="panel-${tabGroupId}-${tab.id}"
        tabindex="${isFirst && !disabled ? "0" : "-1"}"
        ${disabled ? 'aria-disabled="true"' : ""}
        class="px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors
          ${disabled
            ? "border-transparent text-gray-400 dark:text-gray-600 cursor-not-allowed"
            : isFirst
              ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
              : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600 cursor-pointer"
          }"
        data-tab-group="${tabGroupId}"
        data-tab-id="${tab.id}">${escapeHtml(tab.label)}</button>`;
    })
    .join("");

  const tabPanels = tabs
    .map((tab) => {
      const isFirst = tab.id === firstEnabled;
      const hidden = !isFirst || tab.disabled;
      return `<div role="tabpanel"
        id="panel-${tabGroupId}-${tab.id}"
        aria-labelledby="tab-${tabGroupId}-${tab.id}"
        ${hidden ? "hidden" : ""}
        tabindex="0"
        class="focus:outline-none">
        ${tab.content}
      </div>`;
    })
    .join("");

  return `<div data-tabs="${tabGroupId}">
    <div role="tablist" aria-label="Review sections"
         class="flex overflow-x-auto border-b border-gray-200 dark:border-gray-700 -mx-1 mb-6">
      ${tabButtons}
    </div>
    ${tabPanels}
  </div>

  <script>
    (function() {
      var group = '${tabGroupId}';
      var tablist = document.querySelector('[data-tabs="' + group + '"] [role="tablist"]');
      if (!tablist) return;
      var tabs = Array.from(tablist.querySelectorAll('[role="tab"]:not([aria-disabled="true"])'));

      function activate(tab) {
        tabs.forEach(function(t) {
          t.setAttribute('aria-selected', 'false');
          t.setAttribute('tabindex', '-1');
          t.classList.remove('border-blue-600', 'text-blue-600', 'dark:border-blue-400', 'dark:text-blue-400');
          t.classList.add('border-transparent', 'text-gray-500', 'dark:text-gray-400');
          var panel = document.getElementById('panel-' + group + '-' + t.dataset.tabId);
          if (panel) panel.hidden = true;
        });
        tab.setAttribute('aria-selected', 'true');
        tab.setAttribute('tabindex', '0');
        tab.classList.add('border-blue-600', 'text-blue-600', 'dark:border-blue-400', 'dark:text-blue-400');
        tab.classList.remove('border-transparent', 'text-gray-500', 'dark:text-gray-400');
        var panel = document.getElementById('panel-' + group + '-' + tab.dataset.tabId);
        if (panel) panel.hidden = false;
        tab.focus();
      }

      tablist.addEventListener('click', function(e) {
        var tab = e.target.closest('[role="tab"]:not([aria-disabled="true"])');
        if (tab) activate(tab);
      });

      tablist.addEventListener('keydown', function(e) {
        var idx = tabs.indexOf(e.target);
        if (idx < 0) return;
        var next;
        if (e.key === 'ArrowRight') next = tabs[(idx + 1) % tabs.length];
        else if (e.key === 'ArrowLeft') next = tabs[(idx - 1 + tabs.length) % tabs.length];
        else if (e.key === 'Home') next = tabs[0];
        else if (e.key === 'End') next = tabs[tabs.length - 1];
        if (next) { e.preventDefault(); activate(next); }
      });
    })();
  </script>`;
}

/** Color-coded status badge with aria-label. */
export function renderBadge(label: string, status: string): string {
  const normalized = status.toLowerCase().replace(/\s+/g, "_");
  const colors = statusColors[normalized] ?? statusColors.pending;
  return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold
    ${colors.bg} ${colors.text} ${colors.darkBg} ${colors.darkText}"
    aria-label="${escapeAttr(label)}: ${escapeAttr(status)}">${escapeHtml(status.replace(/_/g, " "))}</span>`;
}

/** Numbered criteria checklist with checkbox icons. */
export function renderCriteriaChecklist(criteria: CriterionItem[]): string {
  if (criteria.length === 0) {
    return `<p class="text-gray-500 dark:text-gray-400 italic">No criteria defined.</p>`;
  }
  return `<ol class="space-y-2">
    ${criteria
      .map(
        (c, i) => `<li class="flex items-start gap-3 p-3 rounded-lg ${
          c.checked
            ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
            : "bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700"
        }">
          <span class="flex-shrink-0 mt-0.5 text-lg ${c.checked ? "text-green-600 dark:text-green-400" : "text-gray-400 dark:text-gray-500"}"
                aria-hidden="true">${c.checked ? "&#9745;" : "&#9744;"}</span>
          <span class="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold
            ${c.checked ? "bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-300" : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400"}">${i + 1}</span>
          <span class="${c.checked ? "text-green-800 dark:text-green-200" : "text-gray-700 dark:text-gray-300"}">${escapeHtml(c.text)}</span>
        </li>`,
      )
      .join("")}
  </ol>`;
}

/** Decision form: Approve (green) + Request Changes (amber). Request Changes reveals textarea. */
export function renderDecisionForm(sessionId: string): string {
  return `<div class="mt-8 p-6 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm"
              id="decision-section">
    <h2 class="text-lg font-semibold mb-4">Review Decision</h2>

    <div id="decision-buttons" class="flex flex-col sm:flex-row gap-3">
      <button onclick="handleApprove()"
              class="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors focus:ring-2 focus:ring-green-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900">
        Approve
      </button>
      <button onclick="showFeedbackForm()"
              class="flex-1 px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg transition-colors focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900">
        Request Changes
      </button>
    </div>

    <div id="feedback-form" class="hidden mt-4">
      <label for="feedback-text" class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
        Describe the changes needed:
      </label>
      <textarea id="feedback-text"
                class="w-full min-h-[120px] p-3 border border-gray-300 dark:border-gray-600 rounded-lg
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                       focus:ring-2 focus:ring-amber-500 focus:border-amber-500 resize-y"
                placeholder="What needs to change?"></textarea>
      <p id="feedback-error" class="hidden mt-1 text-sm text-red-600 dark:text-red-400">
        Please describe the changes needed before submitting.
      </p>
      <div class="flex gap-3 mt-3">
        <button onclick="submitChangesRequested()"
                class="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg transition-colors focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900">
          Submit Feedback
        </button>
        <button onclick="hideFeedbackForm()"
                class="px-6 py-2.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium rounded-lg transition-colors">
          Cancel
        </button>
      </div>
    </div>

    <div id="decision-result" class="hidden mt-4 p-4 rounded-lg"></div>
  </div>

  <script>
    (function() {
      var sessionId = '${sessionId}';

      window.showFeedbackForm = function() {
        document.getElementById('feedback-form').classList.remove('hidden');
        document.getElementById('decision-buttons').classList.add('hidden');
        document.getElementById('feedback-text').focus();
      };

      window.hideFeedbackForm = function() {
        document.getElementById('feedback-form').classList.add('hidden');
        document.getElementById('decision-buttons').classList.remove('hidden');
        document.getElementById('feedback-error').classList.add('hidden');
      };

      window.handleApprove = function() {
        submitDecision('approved', '');
      };

      window.submitChangesRequested = function() {
        var text = document.getElementById('feedback-text').value.trim();
        if (!text) {
          document.getElementById('feedback-error').classList.remove('hidden');
          document.getElementById('feedback-text').focus();
          return;
        }
        document.getElementById('feedback-error').classList.add('hidden');
        submitDecision('changes_requested', text);
      };

      function submitDecision(decision, feedback) {
        var buttons = document.querySelectorAll('#decision-section button');
        buttons.forEach(function(b) { b.disabled = true; b.classList.add('opacity-50', 'cursor-not-allowed'); });

        fetch('/review/' + sessionId + '/decide', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision: decision, feedback: feedback })
        })
        .then(function(res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function() {
          var result = document.getElementById('decision-result');
          result.className = 'mt-4 p-4 rounded-lg bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200';
          result.classList.remove('hidden');
          result.innerHTML = '<p class="font-semibold">Decision submitted: ' + decision.replace(/_/g, ' ') + '</p><p class="text-sm mt-1">You can close this tab.</p>';
          document.getElementById('decision-buttons').classList.add('hidden');
          document.getElementById('feedback-form').classList.add('hidden');
        })
        .catch(function(err) {
          var result = document.getElementById('decision-result');
          result.className = 'mt-4 p-4 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200';
          result.classList.remove('hidden');
          result.textContent = 'Error: ' + err.message;
          buttons.forEach(function(b) { b.disabled = false; b.classList.remove('opacity-50', 'cursor-not-allowed'); });
        });
      }
    })();
  </script>`;
}

/** Breadcrumb navigation. */
export function renderBreadcrumb(items: { label: string; href?: string }[]): string {
  return `<nav aria-label="Breadcrumb" class="mb-4">
    <ol class="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
      ${items
        .map(
          (item, i) =>
            `<li class="flex items-center gap-1">
              ${i > 0 ? '<span aria-hidden="true" class="text-gray-400 dark:text-gray-600">/</span>' : ""}
              ${item.href
                ? `<a href="${escapeAttr(item.href)}" class="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">${escapeHtml(item.label)}</a>`
                : `<span class="text-gray-700 dark:text-gray-200 font-medium" aria-current="page">${escapeHtml(item.label)}</span>`
              }
            </li>`,
        )
        .join("")}
    </ol>
  </nav>`;
}

/** Div with data-markdown attribute, rendered client-side by marked.js. */
export function renderMarkdownBlock(id: string, markdown: string): string {
  return `<div id="${escapeAttr(id)}"
    data-markdown="${escapeAttr(markdown)}"
    class="prose prose-sm dark:prose-invert max-w-none
           prose-code:bg-gray-100 prose-code:dark:bg-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
           prose-pre:bg-gray-100 prose-pre:dark:bg-gray-800 prose-pre:rounded-lg
           prose-table:border-collapse prose-th:border prose-th:border-gray-300 prose-th:dark:border-gray-600 prose-th:px-3 prose-th:py-1.5
           prose-td:border prose-td:border-gray-300 prose-td:dark:border-gray-600 prose-td:px-3 prose-td:py-1.5">
  </div>`;
}

/** Renders mockups inline as iframes within a card. */
export function renderMockupEmbeds(mockups: { label: string; url: string }[]): string {
  if (mockups.length === 0) return "";
  return mockups
    .map(
      (m) => `<div class="mt-4">
        <h4 class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">${escapeHtml(m.label)}</h4>
        <iframe src="${escapeAttr(m.url)}"
                sandbox="allow-scripts allow-same-origin"
                class="w-full h-[500px] border border-gray-200 dark:border-gray-700 rounded-lg bg-white"
                title="${escapeAttr(m.label)}"></iframe>
      </div>`,
    )
    .join("");
}

/** Section card wrapper. */
export function card(content: string, extra?: string): string {
  return `<div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6 mb-6 ${extra ?? ""}">
    ${content}
  </div>`;
}

/** Section heading inside a card. */
export function sectionHeading(text: string, level: 2 | 3 = 2): string {
  const tag = level === 2 ? "h2" : "h3";
  const size = level === 2 ? "text-lg" : "text-base";
  return `<${tag} class="${size} font-semibold mb-3 text-gray-900 dark:text-gray-100">${escapeHtml(text)}</${tag}>`;
}
