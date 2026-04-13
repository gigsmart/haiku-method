import { markdownToHtml } from "../markdown.js"
import type { CriterionItem } from "../types.js"
import { escapeAttr, escapeHtml } from "./layout.js"
import { statusColors } from "./styles.js"

export interface TabDef {
	id: string
	label: string
	content: string
	disabled?: boolean
}

/**
 * ARIA-compliant tablist with arrow-key navigation.
 * Each tab has role="tab", each panel has role="tabpanel".
 */
export function renderTabs(tabGroupId: string, tabs: TabDef[]): string {
	const enabledTabs = tabs.filter((t) => !t.disabled)
	const firstEnabled = enabledTabs[0]?.id ?? ""

	const tabButtons = tabs
		.map((tab, i) => {
			const isFirst = tab.id === firstEnabled
			const disabled = tab.disabled ?? false
			return `<button role="tab"
        id="tab-${tabGroupId}-${tab.id}"
        aria-selected="${isFirst && !disabled ? "true" : "false"}"
        aria-controls="panel-${tabGroupId}-${tab.id}"
        tabindex="${isFirst && !disabled ? "0" : "-1"}"
        ${disabled ? 'aria-disabled="true"' : ""}
        class="px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors
          ${
						disabled
							? "border-transparent text-gray-400 dark:text-gray-600 cursor-not-allowed"
							: isFirst
								? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
								: "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600 cursor-pointer"
					}"
        data-tab-group="${tabGroupId}"
        data-tab-id="${tab.id}">${escapeHtml(tab.label)}</button>`
		})
		.join("")

	const tabPanels = tabs
		.map((tab) => {
			const isFirst = tab.id === firstEnabled
			const hidden = !isFirst || tab.disabled
			return `<div role="tabpanel"
        id="panel-${tabGroupId}-${tab.id}"
        aria-labelledby="tab-${tabGroupId}-${tab.id}"
        ${hidden ? "hidden" : ""}
        tabindex="0"
        class="focus:outline-none">
        ${tab.content}
      </div>`
		})
		.join("")

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
  </script>`
}

/** Color-coded status badge with aria-label. */
export function renderBadge(label: string, status: string): string {
	const safeStatus = status || "unknown"
	const normalized = safeStatus.toLowerCase().replace(/\s+/g, "_")
	const colors = statusColors[normalized] ?? statusColors.pending
	return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold
    ${colors.bg} ${colors.text} ${colors.darkBg} ${colors.darkText}"
    aria-label="${escapeAttr(label)}: ${escapeAttr(safeStatus)}">${escapeHtml(safeStatus.replace(/_/g, " "))}</span>`
}

/** Numbered criteria checklist with checkbox icons. */
export function renderCriteriaChecklist(criteria: CriterionItem[]): string {
	if (criteria.length === 0) {
		return `<p class="text-gray-500 dark:text-gray-400 italic">No criteria defined.</p>`
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
  </ol>`
}

/** Breadcrumb navigation. */
export function renderBreadcrumb(
	items: { label: string; href?: string }[],
): string {
	return `<nav aria-label="Breadcrumb" class="mb-4">
    <ol class="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
      ${items
				.map(
					(item, i) =>
						`<li class="flex items-center gap-1">
              ${i > 0 ? '<span aria-hidden="true" class="text-gray-400 dark:text-gray-600">/</span>' : ""}
              ${
								item.href
									? `<a href="${escapeAttr(item.href)}" class="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">${escapeHtml(item.label)}</a>`
									: `<span class="text-gray-700 dark:text-gray-200 font-medium" aria-current="page">${escapeHtml(item.label)}</span>`
							}
            </li>`,
				)
				.join("")}
    </ol>
  </nav>`
}

/** Server-side markdown rendering via markdownToHtml(). */
export function renderMarkdownBlock(id: string, markdown: string): string {
	return `<div id="${escapeAttr(id)}"
    class="prose prose-sm dark:prose-invert max-w-none
           prose-code:bg-gray-100 prose-code:dark:bg-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
           prose-pre:bg-gray-100 prose-pre:dark:bg-gray-800 prose-pre:rounded-lg
           prose-table:border-collapse prose-th:border prose-th:border-gray-300 prose-th:dark:border-gray-600 prose-th:px-3 prose-th:py-1.5
           prose-td:border prose-td:border-gray-300 prose-td:dark:border-gray-600 prose-td:px-3 prose-td:py-1.5">
    ${markdownToHtml(markdown)}
  </div>`
}

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif"]

function isImageUrl(url: string): boolean {
	const ext = url.substring(url.lastIndexOf(".")).toLowerCase()
	return IMAGE_EXTS.includes(ext)
}

/** Renders mockups inline — images as <img>, HTML as <iframe>.
 * Each embed is expandable (click to enlarge) and has an "Annotate" toggle
 * that opens a pin/pen annotation canvas overlay.
 */
export function renderMockupEmbeds(
	mockups: { label: string; url: string }[],
): string {
	if (mockups.length === 0) return ""
	return mockups
		.map((m, i) => {
			const uid = `mockup-${i}-${m.label.replace(/\W+/g, "-").toLowerCase()}`
			const isImage = isImageUrl(m.url)
			return `<div class="mt-4 mockup-embed" data-mockup-id="${escapeAttr(uid)}">
        <div class="flex items-center justify-between mb-2">
          <h4 class="text-sm font-medium text-gray-600 dark:text-gray-400">${escapeHtml(m.label)}</h4>
          <div class="flex items-center gap-2">
            <button type="button" class="mockup-annotate-btn text-xs px-2 py-1 rounded-md
                     bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400
                     hover:bg-blue-100 hover:text-blue-700 dark:hover:bg-blue-900/40 dark:hover:text-blue-300
                     transition-colors" data-target="${escapeAttr(uid)}">
              &#128204; Annotate
            </button>
            <button type="button" class="mockup-expand-btn text-xs px-2 py-1 rounded-md
                     bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400
                     hover:bg-gray-200 dark:hover:bg-gray-700
                     transition-colors" data-target="${escapeAttr(uid)}">
              &#8599; Expand
            </button>
            <a href="${escapeAttr(m.url)}" target="_blank" rel="noopener noreferrer"
               class="text-xs text-blue-600 dark:text-blue-400 hover:underline">
              Open &#8599;
            </a>
          </div>
        </div>
        <div class="mockup-preview" data-uid="${escapeAttr(uid)}">
          ${
						isImage
							? `<img src="${escapeAttr(m.url)}"
                   alt="${escapeAttr(m.label)}"
                   class="max-w-full h-auto border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer" />`
							: `<iframe src="${escapeAttr(m.url)}"
                      sandbox="allow-scripts allow-same-origin"
                      class="w-full h-[400px] border border-gray-200 dark:border-gray-700 rounded-lg bg-white"
                      title="${escapeAttr(m.label)}"></iframe>`
					}
        </div>
      </div>`
		})
		.join("")
}

/** Client-side JS for mockup expand/annotate. Include once in the page. */
export function renderMockupInteractionScript(): string {
	return `<script>
(function() {
  // --- Expand: open mockup in a fullscreen overlay ---
  document.querySelectorAll('.mockup-expand-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var uid = btn.getAttribute('data-target');
      var preview = document.querySelector('.mockup-preview[data-uid="' + uid + '"]');
      if (!preview) return;

      var overlay = document.createElement('div');
      overlay.className = 'fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4';
      overlay.style.backdropFilter = 'blur(4px)';

      var closeBtn = document.createElement('button');
      closeBtn.className = 'absolute top-4 right-4 text-white text-2xl bg-black/50 rounded-full w-10 h-10 flex items-center justify-center hover:bg-black/70 z-10';
      closeBtn.innerHTML = '&times;';
      closeBtn.addEventListener('click', function() { overlay.remove(); });

      var content = document.createElement('div');
      content.className = 'max-w-[95vw] max-h-[95vh] overflow-auto bg-white dark:bg-gray-900 rounded-xl shadow-2xl';

      var img = preview.querySelector('img');
      var iframe = preview.querySelector('iframe');
      if (img) {
        var bigImg = document.createElement('img');
        bigImg.src = img.src;
        bigImg.alt = img.alt;
        bigImg.className = 'max-w-full max-h-[90vh] object-contain';
        content.appendChild(bigImg);
      } else if (iframe) {
        var bigIframe = document.createElement('iframe');
        bigIframe.src = iframe.src;
        bigIframe.sandbox = iframe.sandbox;
        bigIframe.title = iframe.title;
        bigIframe.className = 'w-[90vw] h-[90vh] border-none';
        content.appendChild(bigIframe);
      }

      overlay.appendChild(closeBtn);
      overlay.appendChild(content);
      document.body.appendChild(overlay);

      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) overlay.remove();
      });
      document.addEventListener('keydown', function handler(e) {
        if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', handler); }
      });
    });
  });

  // --- Annotate: capture the mockup as an image and overlay annotation canvas ---
  document.querySelectorAll('.mockup-annotate-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var uid = btn.getAttribute('data-target');
      var container = document.querySelector('[data-mockup-id="' + uid + '"]');
      var preview = container.querySelector('.mockup-preview');
      if (!preview) return;

      // Toggle: if canvas already open, hide it (don't destroy — preserves annotations)
      var existing = container.querySelector('.mockup-annotation-wrap');
      if (existing) {
        var isHidden = existing.style.display === 'none';
        existing.style.display = isHidden ? '' : 'none';
        preview.style.display = isHidden ? 'none' : '';
        if (isHidden) {
          btn.classList.add('bg-blue-100', 'text-blue-700', 'dark:bg-blue-900/40', 'dark:text-blue-300');
          btn.classList.remove('bg-gray-100', 'text-gray-600', 'dark:bg-gray-800', 'dark:text-gray-400');
        } else {
          btn.classList.remove('bg-blue-100', 'text-blue-700', 'dark:bg-blue-900/40', 'dark:text-blue-300');
          btn.classList.add('bg-gray-100', 'text-gray-600', 'dark:bg-gray-800', 'dark:text-gray-400');
        }
        return;
      }

      // Activate button state
      btn.classList.add('bg-blue-100', 'text-blue-700', 'dark:bg-blue-900/40', 'dark:text-blue-300');
      btn.classList.remove('bg-gray-100', 'text-gray-600', 'dark:bg-gray-800', 'dark:text-gray-400');

      var img = preview.querySelector('img');
      var iframe = preview.querySelector('iframe');

      if (img) {
        // For images, inject the annotation canvas directly
        preview.style.display = 'none';
        var wrap = document.createElement('div');
        wrap.className = 'mockup-annotation-wrap';
        // Clone the annotation canvas template and swap the image src
        wrap.innerHTML = buildAnnotationCanvasHTML(img.src);
        container.appendChild(wrap);
        initAnnotationCanvas(wrap);
      } else if (iframe) {
        // Annotation is not supported for embedded iframes — show a notice
        preview.style.display = 'none';
        var wrap = document.createElement('div');
        wrap.className = 'mockup-annotation-wrap';
        wrap.innerHTML = '<div class="p-6 text-center text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">' +
          '<p class="text-sm font-medium mb-1">Annotation unavailable for embedded frames</p>' +
          '<p class="text-xs">Use the Expand button to view full size.</p>' +
        '</div>';
        container.appendChild(wrap);
      }
    });
  });

  // Build annotation canvas HTML inline (mirrors annotation-canvas.ts structure)
  // No built-in sidebar — pins route to unified review sidebar.
  function escImgSrc(s) {
    return s.replace(/&/g, '&amp;').replace(/"/g, '%22').replace(/'/g, '%27').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function buildAnnotationCanvasHTML(imageSrc) {
    return '<div class="relative">' +
      '<div class="flex items-center gap-2 mb-3 p-2 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">' +
        '<button type="button" class="ac-tool ac-tool-pin active-tool px-3 py-1.5 text-sm font-medium rounded-md bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" aria-pressed="true" title="Pin tool">&#128204; Pin</button>' +
        '<button type="button" class="ac-tool ac-tool-pen px-3 py-1.5 text-sm font-medium rounded-md bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700" aria-pressed="false" title="Pen tool">&#9998; Pen</button>' +
        '<div class="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1"></div>' +
        '<button type="button" class="ac-undo px-3 py-1.5 text-sm font-medium rounded-md bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700" title="Undo">&#8630; Undo</button>' +
        '<button type="button" class="ac-clear px-3 py-1.5 text-sm font-medium rounded-md bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700" title="Clear">&#10060; Clear</button>' +
        '<div class="flex-1"></div>' +
        '<span class="ac-status text-xs text-gray-500 dark:text-gray-400">Pin mode</span>' +
      '</div>' +
      '<div class="ac-canvas-wrapper relative inline-block border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 cursor-crosshair">' +
        '<img class="ac-image block max-w-full h-auto select-none" src="' + escImgSrc(imageSrc) + '" alt="Content to annotate" draggable="false" />' +
        '<canvas class="ac-draw absolute top-0 left-0 w-full h-full" style="pointer-events: auto;"></canvas>' +
        '<div class="ac-pins absolute top-0 left-0 w-full h-full" style="pointer-events: none;"></div>' +
      '</div>' +
    '</div>';
  }

  // Initialize annotation canvas behavior on a container.
  // Pins route to the unified review sidebar via window.addReviewComment().
  // TODO: Extract shared logic with annotation-canvas.ts into window._initAnnotationCanvas(wrap, opts)
  // to eliminate ~200 lines of duplication. The two differ in DOM selection strategy and pin label format.
  function initAnnotationCanvas(wrap) {
    var img = wrap.querySelector('.ac-image');
    var canvas = wrap.querySelector('.ac-draw');
    var ctx = canvas.getContext('2d');
    var pinsLayer = wrap.querySelector('.ac-pins');
    var statusEl = wrap.querySelector('.ac-status');
    var wrapperEl = wrap.querySelector('.ac-canvas-wrapper');

    // Get the mockup label from the parent container
    var mockupContainer = wrap.closest('.mockup-embed');
    var mockupLabel = mockupContainer ? (mockupContainer.querySelector('h4') ? mockupContainer.querySelector('h4').textContent : 'Mockup') : 'Mockup';

    var currentTool = 'pin';
    var pins = [];
    var drawHistory = [];
    var isDrawing = false;
    var mockupPinCounter = 0;

    function sizeCanvas() {
      canvas.width = img.naturalWidth || img.offsetWidth;
      canvas.height = img.naturalHeight || img.offsetHeight;
      canvas.style.width = img.offsetWidth + 'px';
      canvas.style.height = img.offsetHeight + 'px';
      if (drawHistory.length > 0) ctx.putImageData(drawHistory[drawHistory.length - 1], 0, 0);
    }
    if (img.complete) sizeCanvas();
    img.addEventListener('load', sizeCanvas);

    // Tool switching
    var pinBtn = wrap.querySelector('.ac-tool-pin');
    var penBtn = wrap.querySelector('.ac-tool-pen');
    function setTool(tool) {
      currentTool = tool;
      [pinBtn, penBtn].forEach(function(b) {
        if (b.classList.contains('ac-tool-' + tool)) {
          b.classList.remove('bg-gray-100', 'text-gray-700', 'dark:bg-gray-800', 'dark:text-gray-300');
          b.classList.add('bg-blue-100', 'text-blue-700', 'dark:bg-blue-900/40', 'dark:text-blue-300');
          b.setAttribute('aria-pressed', 'true');
        } else {
          b.classList.add('bg-gray-100', 'text-gray-700', 'dark:bg-gray-800', 'dark:text-gray-300');
          b.classList.remove('bg-blue-100', 'text-blue-700', 'dark:bg-blue-900/40', 'dark:text-blue-300');
          b.setAttribute('aria-pressed', 'false');
        }
      });
      statusEl.textContent = tool === 'pin' ? 'Pin mode' : 'Pen mode';
    }
    pinBtn.addEventListener('click', function() { setTool('pin'); });
    penBtn.addEventListener('click', function() { setTool('pen'); });

    function getCanvasCoords(e) {
      var rect = canvas.getBoundingClientRect();
      return { x: (e.clientX - rect.left) * (canvas.width / rect.width), y: (e.clientY - rect.top) * (canvas.height / rect.height) };
    }
    function getPctCoords(e) {
      var rect = wrapperEl.getBoundingClientRect();
      return { x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 };
    }
    function saveDrawState() { drawHistory.push(ctx.getImageData(0, 0, canvas.width, canvas.height)); }

    canvas.addEventListener('mousedown', function(e) {
      if (currentTool !== 'pen') return;
      e.preventDefault(); isDrawing = true; saveDrawState();
      var c = getCanvasCoords(e);
      ctx.beginPath(); ctx.moveTo(c.x, c.y);
      ctx.strokeStyle = '#e11d48'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    });
    canvas.addEventListener('mousemove', function(e) { if (!isDrawing) return; var c = getCanvasCoords(e); ctx.lineTo(c.x, c.y); ctx.stroke(); });
    canvas.addEventListener('mouseup', function() { if (isDrawing) { isDrawing = false; ctx.closePath(); } });
    canvas.addEventListener('mouseleave', function() { if (isDrawing) { isDrawing = false; ctx.closePath(); } });

    canvas.addEventListener('click', function(e) {
      if (currentTool !== 'pin') return;
      e.preventDefault();
      var pct = getPctCoords(e);
      addPin(pct.x, pct.y);
    });

    function addPin(pctX, pctY) {
      var num = pins.length + 1;
      mockupPinCounter++;
      var pinId = 'mockup-pin-' + mockupPinCounter + '-' + Date.now();

      var pinEl = document.createElement('div');
      pinEl.className = 'annotation-pin';
      pinEl.id = pinId;
      pinEl.textContent = num;
      pinEl.style.left = pctX + '%'; pinEl.style.top = pctY + '%';
      pinEl.style.cssText += 'position:absolute;width:24px;height:24px;border-radius:50%;background:#e11d48;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;transform:translate(-50%,-50%);box-shadow:0 2px 6px rgba(0,0,0,0.3);pointer-events:auto;cursor:pointer;z-index:10;border:2px solid #fff;';
      pinsLayer.appendChild(pinEl);

      var pin = { x: pctX, y: pctY, text: '', el: pinEl, sidebarCommentId: null };
      pins.push(pin);

      // Route to unified sidebar
      if (typeof window.addReviewComment === 'function') {
        var sidebarId = window.addReviewComment({
          type: 'mockup',
          sourceId: pinId,
          sourceLabel: mockupLabel + ' pin #' + num,
          text: '',
          scrollTargetId: pinId,
          highlightEl: pinEl,
          onDelete: function() { removePin(pin, true); },
          onTextChange: function(val) { pin.text = val; }
        });
        pin.sidebarCommentId = sidebarId;
      }

      // Click pin -> scroll to sidebar card
      pinEl.addEventListener('click', function(e) {
        e.stopPropagation();
        if (pin.sidebarCommentId) {
          var card = document.querySelector('[data-comment-id="' + pin.sidebarCommentId + '"]');
          if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            var ta = card.querySelector('textarea');
            if (ta) ta.focus();
          }
        }
      });

      saveDrawState();
    }

    function removePin(pin, fromSidebar) {
      var idx = pins.indexOf(pin); if (idx < 0) return;
      pins.splice(idx, 1); pin.el.remove();
      if (!fromSidebar && pin.sidebarCommentId && typeof window.removeReviewComment === 'function') {
        window.removeReviewComment(pin.sidebarCommentId);
      }
      for (var i = 0; i < pins.length; i++) {
        pins[i].el.textContent = i + 1;
        if (pins[i].sidebarCommentId && typeof window.updateReviewCommentLabel === 'function') {
          window.updateReviewCommentLabel(pins[i].sidebarCommentId, mockupLabel + ' pin #' + (i + 1));
        }
      }
    }

    wrap.querySelector('.ac-undo').addEventListener('click', function() {
      if (drawHistory.length > 0) { drawHistory.pop(); ctx.clearRect(0, 0, canvas.width, canvas.height); if (drawHistory.length > 0) ctx.putImageData(drawHistory[drawHistory.length - 1], 0, 0); }
      else if (pins.length > 0) removePin(pins[pins.length - 1], false);
    });
    wrap.querySelector('.ac-clear').addEventListener('click', function() {
      ctx.clearRect(0, 0, canvas.width, canvas.height); drawHistory = [];
      while (pins.length > 0) {
        var p = pins.pop(); p.el.remove();
        if (p.sidebarCommentId && typeof window.removeReviewComment === 'function') {
          window.removeReviewComment(p.sidebarCommentId);
        }
      }
    });

    // Expose capture for this instance
    wrap.captureAnnotations = function() {
      var captureCanvas = document.createElement('canvas');
      captureCanvas.width = canvas.width; captureCanvas.height = canvas.height;
      var cctx = captureCanvas.getContext('2d');
      cctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      cctx.drawImage(canvas, 0, 0);
      for (var i = 0; i < pins.length; i++) {
        var px = (pins[i].x / 100) * canvas.width, py = (pins[i].y / 100) * canvas.height;
        cctx.beginPath(); cctx.arc(px, py, 14, 0, 2 * Math.PI); cctx.fillStyle = '#e11d48'; cctx.fill();
        cctx.strokeStyle = '#fff'; cctx.lineWidth = 2; cctx.stroke();
        cctx.fillStyle = '#fff'; cctx.font = 'bold 12px system-ui'; cctx.textAlign = 'center'; cctx.textBaseline = 'middle';
        cctx.fillText(String(i + 1), px, py);
      }
      return { screenshot: captureCanvas.toDataURL('image/png'), pins: pins.map(function(p) { return { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100, text: p.text }; }) };
    };
    wrap.hasAnnotations = function() { return pins.length > 0 || drawHistory.length > 0; };
  }

  // Expose globally for the review submit to collect all mockup annotations
  window.collectMockupAnnotations = function() {
    var results = [];
    document.querySelectorAll('.mockup-annotation-wrap').forEach(function(wrap) {
      if (wrap.hasAnnotations && wrap.hasAnnotations()) {
        var container = wrap.closest('.mockup-embed');
        var label = container ? container.querySelector('h4') : null;
        results.push({
          mockup: label ? label.textContent : 'unknown',
          ...(wrap.captureAnnotations ? wrap.captureAnnotations() : {})
        });
      }
    });
    return results.length > 0 ? results : undefined;
  };
})();
</script>`
}

/**
 * Renders the unified review sidebar HTML.
 * Collects inline text comments, annotation canvas pins, and general feedback
 * into a single sticky panel — GitHub/GitLab-style.
 */
export function renderReviewSidebar(sessionId: string): string {
	return `<aside id="review-sidebar"
    class="sticky top-20 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden flex flex-col"
    style="max-height: calc(100vh - 6rem);">
  <!-- Header -->
  <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shrink-0">
    <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
      Review Comments
      <span id="sidebar-comment-count"
            class="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full text-xs font-bold bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400">0</span>
    </h2>
  </div>

  <!-- Scrollable comments list -->
  <div id="sidebar-comment-list" class="flex-1 overflow-y-auto p-3 space-y-2">
    <p id="sidebar-no-comments" class="text-xs text-gray-400 dark:text-gray-500 italic p-2">
      No comments yet. Highlight text or drop pins to add comments.
    </p>
  </div>

  <!-- Footer: general comment + decision buttons -->
  <div class="shrink-0 border-t border-gray-200 dark:border-gray-700 p-3 space-y-3 bg-gray-50/50 dark:bg-gray-800/50">
    <div>
      <label for="sidebar-general-comment" class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">General comment</label>
      <textarea id="sidebar-general-comment"
                class="w-full text-sm p-2 border border-gray-300 dark:border-gray-600 rounded-lg
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                       focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
                rows="3" placeholder="Leave a general comment..."></textarea>
    </div>
    <div class="flex gap-2">
      <button id="sidebar-btn-approve"
              class="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors
                     focus:ring-2 focus:ring-green-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900">
        Approve
      </button>
      <button id="sidebar-btn-request-changes"
              class="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg transition-colors
                     focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900">
        Request Changes
      </button>
    </div>
    <div id="sidebar-decision-result" class="hidden"></div>
  </div>
</aside>`
}

/**
 * Client-side JS for the unified review sidebar.
 * Provides window.addReviewComment(), window.removeReviewComment(),
 * window.getReviewComments(), and submit logic.
 */
export function renderReviewSidebarScript(sessionId: string): string {
	return `<script>
(function() {
  var sessionId = '${sessionId}';
  var comments = []; // { id, type, sourceId, sourceLabel, text, scrollTargetId, highlightEl, onDelete }
  var nextId = 1;

  var listEl = document.getElementById('sidebar-comment-list');
  var noCommentsEl = document.getElementById('sidebar-no-comments');
  var countEl = document.getElementById('sidebar-comment-count');
  var mobileBadge = document.getElementById('mobile-badge');

  function updateCount() {
    var n = comments.length;
    if (countEl) countEl.textContent = String(n);
    if (noCommentsEl) noCommentsEl.style.display = n > 0 ? 'none' : '';
    // Update mobile badge
    if (mobileBadge) {
      mobileBadge.textContent = String(n);
      mobileBadge.classList.toggle('hidden', n === 0);
    }
    updateDecisionButtons();
  }

  function updateDecisionButtons() {
    var approveBtn = document.getElementById('sidebar-btn-approve');
    var changesBtn = document.getElementById('sidebar-btn-request-changes');
    if (!approveBtn || !changesBtn) return;
    var hasComments = comments.length > 0;
    var hasGeneralComment = (document.getElementById('sidebar-general-comment').value || '').trim().length > 0;
    var hasFeedback = hasComments || hasGeneralComment;

    if (hasFeedback) {
      // Comments exist — "Request Changes" becomes primary, "Approve" is de-emphasized
      approveBtn.className = 'flex-1 px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white text-sm font-semibold rounded-lg transition-colors focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 dark:focus:ring-offset-gray-900';
      approveBtn.textContent = 'Approve Anyway';
    } else {
      // No feedback — restore normal button states
      approveBtn.className = 'flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors focus:ring-2 focus:ring-green-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900';
      approveBtn.textContent = 'Approve';
    }
  }

  function escText(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function truncate(str, max) {
    if (str.length <= max) return escText(str);
    return escText(str.substring(0, max)) + '\\u2026';
  }

  function typeIcon(type) {
    if (type === 'pin') return '\\uD83D\\uDCCC'; // pushpin
    if (type === 'text') return '\\uD83D\\uDCDD'; // memo
    return '\\uD83D\\uDCAC'; // speech balloon
  }

  /**
   * Add a comment to the sidebar.
   * @param {Object} opts
   * @param {string} opts.type - 'text' | 'pin' | 'mockup' | 'general'
   * @param {string} opts.sourceId - unique ID for cross-referencing
   * @param {string} opts.sourceLabel - human label, e.g. "Selected text" or "Pin #3"
   * @param {string} opts.text - the comment text (may be empty; user can fill in via textarea)
   * @param {string} [opts.scrollTargetId] - element ID to scroll to on click
   * @param {Element} [opts.highlightEl] - element to pulse on click
   * @param {string} [opts.quotedText] - the selected/annotated text to show
   * @param {Function} [opts.onDelete] - callback when this comment is removed
   * @param {Function} [opts.onTextChange] - callback when the comment text changes
   * @returns {number} the comment ID
   */
  window.addReviewComment = function(opts) {
    var id = nextId++;
    var comment = {
      id: id,
      type: opts.type || 'general',
      sourceId: opts.sourceId || '',
      sourceLabel: opts.sourceLabel || '',
      text: opts.text || '',
      scrollTargetId: opts.scrollTargetId || '',
      highlightEl: opts.highlightEl || null,
      quotedText: opts.quotedText || '',
      onDelete: opts.onDelete || null,
      onTextChange: opts.onTextChange || null
    };

    var cardEl = document.createElement('div');
    cardEl.className = 'review-comment-card p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-transparent hover:border-blue-400 dark:hover:border-blue-500 transition-colors cursor-pointer';
    cardEl.setAttribute('data-comment-id', String(id));

    var headerHtml = '<div class="flex items-center gap-2 mb-1">' +
      '<span class="text-sm" aria-hidden="true">' + typeIcon(comment.type) + '</span>' +
      '<span class="text-xs font-medium text-gray-600 dark:text-gray-400 flex-1 truncate">' + escText(comment.sourceLabel) + '</span>' +
      '<button type="button" class="sidebar-comment-delete text-gray-400 hover:text-red-500 text-xs leading-none" aria-label="Delete comment" title="Delete">&times;</button>' +
    '</div>';

    var quoteHtml = comment.quotedText
      ? '<p class="text-xs text-gray-500 dark:text-gray-400 italic truncate mb-1" title="' + escText(comment.quotedText).replace(/"/g, '&quot;') + '">\\u201C' + truncate(comment.quotedText, 60) + '\\u201D</p>'
      : '';

    var textareaHtml = '<textarea class="sidebar-comment-text w-full text-xs p-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500" rows="2" placeholder="Add your comment\\u2026">' + escText(comment.text) + '</textarea>';

    cardEl.innerHTML = headerHtml + quoteHtml + textareaHtml;
    listEl.appendChild(cardEl);
    comment.cardEl = cardEl;
    comments.push(comment);

    // Wire textarea
    var ta = cardEl.querySelector('.sidebar-comment-text');
    ta.addEventListener('input', function() {
      comment.text = ta.value;
      if (comment.onTextChange) comment.onTextChange(ta.value);
    });

    // Click card -> scroll to target
    cardEl.addEventListener('click', function(e) {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') return;
      scrollToTarget(comment);
    });

    // Delete
    cardEl.querySelector('.sidebar-comment-delete').addEventListener('click', function(e) {
      e.stopPropagation();
      window.removeReviewComment(id);
    });

    // Hover cross-highlight
    cardEl.addEventListener('mouseenter', function() {
      if (comment.highlightEl) comment.highlightEl.classList.add('active');
    });
    cardEl.addEventListener('mouseleave', function() {
      if (comment.highlightEl) comment.highlightEl.classList.remove('active');
    });

    updateCount();
    // Scroll the comment into view in the sidebar
    cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    ta.focus();

    return id;
  };

  /**
   * Remove a comment by ID.
   */
  window.removeReviewComment = function(id) {
    var idx = comments.findIndex(function(c) { return c.id === id; });
    if (idx < 0) return;
    var comment = comments[idx];
    if (comment.onDelete) comment.onDelete();
    if (comment.cardEl) comment.cardEl.remove();
    comments.splice(idx, 1);
    updateCount();
  };

  /**
   * Update a comment's sourceLabel by ID.
   */
  window.updateReviewCommentLabel = function(id, newLabel) {
    var comment = comments.find(function(c) { return c.id === id; });
    if (!comment) return;
    comment.sourceLabel = newLabel;
    if (comment.cardEl) {
      var labelEl = comment.cardEl.querySelector('.text-xs.font-medium');
      if (labelEl) labelEl.textContent = newLabel;
    }
  };

  /**
   * Get all comments for submission.
   */
  window.getReviewComments = function() {
    return comments.map(function(c) {
      return {
        type: c.type,
        sourceId: c.sourceId,
        sourceLabel: c.sourceLabel,
        text: c.text,
        quotedText: c.quotedText
      };
    });
  };

  function scrollToTarget(comment) {
    var el = comment.highlightEl;
    if (!el && comment.scrollTargetId) {
      el = document.getElementById(comment.scrollTargetId);
    }
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Pulse animation
    el.classList.add('review-pulse');
    setTimeout(function() { el.classList.remove('review-pulse'); }, 1300);
  }

  // --- Gather annotations (same data shape as before, for backward compat) ---
  function gatherAnnotations() {
    var annotations = {};
    var hasAny = false;

    // Canvas annotations (pins + screenshot)
    if (typeof window.captureAnnotations === 'function' && typeof window.hasCanvasAnnotations === 'function' && window.hasCanvasAnnotations()) {
      var canvasData = window.captureAnnotations();
      if (canvasData.screenshot) { annotations.screenshot = canvasData.screenshot; hasAny = true; }
      if (canvasData.annotations && canvasData.annotations.length > 0) { annotations.pins = canvasData.annotations; hasAny = true; }
    }

    // Inline text comments are captured via the sidebar's reviewComments field
    // (inline-comments.ts routes them to the sidebar via window.addReviewComment)

    // Mockup annotations
    if (typeof window.collectMockupAnnotations === 'function') {
      var mockupData = window.collectMockupAnnotations();
      if (mockupData) { annotations.mockups = mockupData; hasAny = true; }
    }

    // Sidebar review comments
    var sidebarComments = window.getReviewComments();
    if (sidebarComments && sidebarComments.length > 0) {
      annotations.reviewComments = sidebarComments;
      hasAny = true;
    }

    return hasAny ? annotations : undefined;
  }

  function submitDecision(decision) {
    var generalComment = document.getElementById('sidebar-general-comment').value.trim();
    var feedback = '';

    if (decision === 'changes_requested') {
      // Require at least a general comment or some review comments
      var hasComments = comments.length > 0;
      if (!generalComment && !hasComments) {
        document.getElementById('sidebar-general-comment').focus();
        document.getElementById('sidebar-general-comment').classList.add('ring-2', 'ring-red-500', 'border-red-500');
        setTimeout(function() {
          document.getElementById('sidebar-general-comment').classList.remove('ring-2', 'ring-red-500', 'border-red-500');
        }, 2000);
        return;
      }
      feedback = generalComment;
    } else {
      feedback = generalComment;
    }

    // Disable buttons
    var approveBtn = document.getElementById('sidebar-btn-approve');
    var changesBtn = document.getElementById('sidebar-btn-request-changes');
    [approveBtn, changesBtn].forEach(function(b) {
      b.disabled = true;
      b.classList.add('opacity-50', 'cursor-not-allowed');
    });

    var payload = { decision: decision, feedback: feedback };
    var annotations = gatherAnnotations();
    if (annotations) payload.annotations = annotations;

    fetch('/review/' + sessionId + '/decide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function() {
      var result = document.getElementById('sidebar-decision-result');
      result.className = 'p-3 rounded-lg bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200 text-sm';
      result.classList.remove('hidden');
      var msg = '<p class="font-semibold">Decision submitted: ' + decision.replace(/_/g, ' ') + '</p>';
      if (annotations) {
        var parts = [];
        if (annotations.screenshot) parts.push('annotated screenshot');
        if (annotations.pins && annotations.pins.length) parts.push(annotations.pins.length + ' pin(s)');
        if (annotations.reviewComments && annotations.reviewComments.length) parts.push(annotations.reviewComments.length + ' review comment(s)');
        if (parts.length > 0) msg += '<p class="text-xs mt-1">Included: ' + parts.join(', ') + '</p>';
      }
      msg += '<p class="text-xs mt-1">You can close this tab.</p>';
      result.innerHTML = msg;
      approveBtn.classList.add('hidden');
      changesBtn.classList.add('hidden');
    })
    .catch(function(err) {
      var result = document.getElementById('sidebar-decision-result');
      result.className = 'p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 text-sm';
      result.classList.remove('hidden');
      result.textContent = 'Error: ' + err.message;
      [approveBtn, changesBtn].forEach(function(b) {
        b.disabled = false;
        b.classList.remove('opacity-50', 'cursor-not-allowed');
      });
    });
  }

  document.getElementById('sidebar-btn-approve').addEventListener('click', function() { submitDecision('approved'); });
  document.getElementById('sidebar-btn-request-changes').addEventListener('click', function() { submitDecision('changes_requested'); });

  // Update button states when general comment changes
  document.getElementById('sidebar-general-comment').addEventListener('input', updateDecisionButtons);
})();
</script>`
}

/** Section card wrapper. */
export function card(content: string, extra?: string): string {
	return `<div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6 mb-6 ${extra ?? ""}">
    ${content}
  </div>`
}

/** Section heading inside a card. */
export function sectionHeading(text: string, level: 2 | 3 = 2): string {
	const tag = level === 2 ? "h2" : "h3"
	const size = level === 2 ? "text-lg" : "text-base"
	return `<${tag} class="${size} font-semibold mb-3 text-gray-900 dark:text-gray-100">${escapeHtml(text)}</${tag}>`
}
