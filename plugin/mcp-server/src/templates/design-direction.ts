import type {
	DesignArchetypeData,
	DesignParameterData,
} from "../sessions.js"
import { escapeAttr, escapeHtml, renderLayout } from "./layout.js"
import { card, sectionHeading } from "./components.js"

export interface DesignDirectionPageData {
	title: string
	archetypes: DesignArchetypeData[]
	parameters: DesignParameterData[]
	sessionId: string
}

export function renderDesignDirectionPage(
	data: DesignDirectionPageData,
): string {
	const { title, archetypes, parameters, sessionId } = data

	let body = ""

	// -- Section A: Archetype Gallery --
	body += card(
		sectionHeading("Design Direction", 2) +
			`<p class="text-sm text-gray-500 dark:text-gray-400 mb-4">Select an archetype, tune the parameters, then submit your choice.</p>
    <div role="radiogroup" aria-label="Design archetypes" id="archetype-gallery"
         class="grid gap-4 sm:grid-cols-2 lg:grid-cols-${Math.min(archetypes.length, 3)}">
      ${archetypes
				.map(
					(a, i) => `<div role="radio" aria-checked="${i === 0 ? "true" : "false"}"
            tabindex="${i === 0 ? "0" : "-1"}"
            data-archetype="${escapeAttr(a.name)}"
            data-defaults='${escapeAttr(JSON.stringify(a.default_parameters))}'
            class="archetype-card group relative rounded-xl border-2 cursor-pointer transition-all
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900
              ${i === 0 ? "border-blue-600 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20" : "border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500"}">
            <div class="p-4">
              <div class="flex items-center gap-2 mb-2">
                <span class="archetype-check w-5 h-5 rounded-full border-2 flex items-center justify-center
                  ${i === 0 ? "border-blue-600 dark:border-blue-400" : "border-gray-300 dark:border-gray-600"}">
                  <span class="${i === 0 ? "" : "hidden"} w-2.5 h-2.5 rounded-full bg-blue-600 dark:bg-blue-400"></span>
                </span>
                <h3 class="font-semibold text-gray-900 dark:text-gray-100">${escapeHtml(a.name)}</h3>
              </div>
              <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">${escapeHtml(a.description)}</p>
              <iframe srcdoc="${escapeAttr(a.preview_html)}"
                      sandbox
                      title="Preview: ${escapeAttr(a.name)}"
                      class="w-full h-32 rounded-lg border border-gray-200 dark:border-gray-700 bg-white pointer-events-none"></iframe>
            </div>
          </div>`,
				)
				.join("")}
    </div>`,
	)

	// -- Section B: Parameter Tuners --
	if (parameters.length > 0) {
		body += card(
			sectionHeading("Parameters", 2) +
				`<div class="space-y-5" id="parameter-tuners">
        ${parameters
					.map(
						(p) => `<div class="parameter-row">
            <div class="flex items-center justify-between mb-1">
              <label for="param-${escapeAttr(p.name)}" class="text-sm font-medium text-gray-900 dark:text-gray-100">
                ${escapeHtml(p.label)}
              </label>
              <output id="param-value-${escapeAttr(p.name)}"
                      for="param-${escapeAttr(p.name)}"
                      class="text-sm font-mono text-blue-600 dark:text-blue-400">${p.default}</output>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">${escapeHtml(p.description)}</p>
            <div class="flex items-center gap-3">
              <span class="text-xs text-gray-500 dark:text-gray-400 w-16 text-right shrink-0">${escapeHtml(p.labels.low)}</span>
              <input type="range" id="param-${escapeAttr(p.name)}"
                     name="${escapeAttr(p.name)}"
                     min="${p.min}" max="${p.max}" step="${p.step}" value="${p.default}"
                     aria-label="${escapeAttr(p.label)}"
                     aria-describedby="param-value-${escapeAttr(p.name)}"
                     class="flex-1 h-2 rounded-lg appearance-none cursor-pointer
                       bg-gray-200 dark:bg-gray-700
                       accent-blue-600 dark:accent-blue-400">
              <span class="text-xs text-gray-500 dark:text-gray-400 w-16 shrink-0">${escapeHtml(p.labels.high)}</span>
            </div>
          </div>`,
					)
					.join("")}
      </div>`,
		)
	}

	// -- Section C: Submit --
	body += `<button type="button" id="submit-direction"
    class="w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg
           transition-colors focus:ring-2 focus:ring-green-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900">
    Choose This Direction
  </button>
  <div id="submit-result" class="hidden mt-4 p-4 rounded-lg"></div>`

	// -- Client-side JS --
	const clientScript = `
  <script>
  (function() {
    var sessionId = '${sessionId}';
    var cards = Array.from(document.querySelectorAll('.archetype-card'));
    var sliders = document.querySelectorAll('#parameter-tuners input[type="range"]');

    // --- Archetype selection ---
    function selectCard(card) {
      cards.forEach(function(c) {
        c.setAttribute('aria-checked', 'false');
        c.setAttribute('tabindex', '-1');
        c.classList.remove('border-blue-600', 'dark:border-blue-400', 'bg-blue-50', 'dark:bg-blue-900/20');
        c.classList.add('border-gray-200', 'dark:border-gray-700');
        var dot = c.querySelector('.archetype-check span');
        if (dot) dot.classList.add('hidden');
        var ring = c.querySelector('.archetype-check');
        if (ring) { ring.classList.remove('border-blue-600', 'dark:border-blue-400'); ring.classList.add('border-gray-300', 'dark:border-gray-600'); }
      });
      card.setAttribute('aria-checked', 'true');
      card.setAttribute('tabindex', '0');
      card.classList.add('border-blue-600', 'dark:border-blue-400', 'bg-blue-50', 'dark:bg-blue-900/20');
      card.classList.remove('border-gray-200', 'dark:border-gray-700');
      var dot = card.querySelector('.archetype-check span');
      if (dot) dot.classList.remove('hidden');
      var ring = card.querySelector('.archetype-check');
      if (ring) { ring.classList.add('border-blue-600', 'dark:border-blue-400'); ring.classList.remove('border-gray-300', 'dark:border-gray-600'); }
      card.focus();

      // Apply default parameters
      try {
        var defaults = JSON.parse(card.getAttribute('data-defaults') || '{}');
        for (var key in defaults) {
          var slider = document.getElementById('param-' + key);
          var output = document.getElementById('param-value-' + key);
          if (slider) { slider.value = defaults[key]; }
          if (output) { output.textContent = defaults[key]; }
        }
      } catch(e) { /* ignore parse errors */ }
    }

    cards.forEach(function(c) {
      c.addEventListener('click', function() { selectCard(c); });
    });

    // Keyboard: arrow keys between cards
    document.getElementById('archetype-gallery').addEventListener('keydown', function(e) {
      var idx = cards.indexOf(document.activeElement);
      if (idx < 0) return;
      var next;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = cards[(idx + 1) % cards.length];
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = cards[(idx - 1 + cards.length) % cards.length];
      if (next) { e.preventDefault(); selectCard(next); }
    });

    // --- Slider live value display ---
    sliders.forEach(function(slider) {
      slider.addEventListener('input', function() {
        var output = document.getElementById('param-value-' + slider.name);
        if (output) output.textContent = slider.value;
      });
    });

    // --- Submit ---
    document.getElementById('submit-direction').addEventListener('click', function() {
      var selected = document.querySelector('.archetype-card[aria-checked="true"]');
      if (!selected) return;

      var archetype = selected.getAttribute('data-archetype');
      var params = {};
      sliders.forEach(function(s) { params[s.name] = parseFloat(s.value); });

      var btn = document.getElementById('submit-direction');
      btn.disabled = true;
      btn.classList.add('opacity-50', 'cursor-not-allowed');

      fetch('/direction/' + sessionId + '/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archetype: archetype, parameters: params })
      })
      .then(function(res) {
        if (!res.ok) return res.json().then(function(b) { throw new Error(b.error || 'HTTP ' + res.status); });
        return res.json();
      })
      .then(function() {
        var result = document.getElementById('submit-result');
        result.className = 'mt-4 p-4 rounded-lg bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200';
        result.classList.remove('hidden');
        result.innerHTML = '<p class="font-semibold">Direction selected: ' + archetype + '</p><p class="text-sm mt-1">You can close this tab.</p>';
      })
      .catch(function(err) {
        var result = document.getElementById('submit-result');
        result.className = 'mt-4 p-4 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200';
        result.classList.remove('hidden');
        result.textContent = 'Error: ' + err.message;
        btn.disabled = false;
        btn.classList.remove('opacity-50', 'cursor-not-allowed');
      });
    });
  })();
  </script>`

	const clientData = { sessionId, archetypeCount: archetypes.length }
	return renderLayout(title, body + clientScript, JSON.stringify(clientData))
}
