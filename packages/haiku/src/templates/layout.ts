import { inlineStyles } from "./styles.js"

/**
 * Renders the full HTML document shell.
 * Includes inline Tailwind CSS, Mermaid ESM, dark-mode logic, and skip-nav.
 * Uses a two-column layout: left for main content, right for sticky review sidebar.
 */
export function renderLayout(
	title: string,
	bodyContent: string,
	reviewDataJson: string,
	sidebarContent = "",
): string {
	return `<!DOCTYPE html>
<html lang="en" class="">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeAttr(title)}</title>
  ${inlineStyles}
  <style>
    /* Hide tab panels that are not active */
    [role="tabpanel"][hidden] { display: none; }
    /* Smooth transitions for theme switch */
    html { transition: background-color 0.2s, color 0.2s; }
    /* Mermaid container sizing */
    .mermaid svg { max-width: 100%; height: auto; }
    /* Pulse animation for scroll-to-highlight */
    @keyframes review-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.5); }
      50% { box-shadow: 0 0 0 6px rgba(59, 130, 246, 0); }
    }
    .review-pulse { animation: review-pulse 0.6s ease-in-out 2; }
  </style>
</head>
<body class="bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 min-h-screen transition-colors">
  <!-- Skip to content -->
  <a href="#main-content"
     class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded">
    Skip to main content
  </a>

  <!-- Header -->
  <header class="sticky top-0 z-40 bg-white/80 dark:bg-gray-900/80 backdrop-blur border-b border-gray-200 dark:border-gray-800">
    <div class="max-w-[1400px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
      <h1 class="text-lg font-semibold truncate">${escapeHtml(title)}</h1>
      <button id="theme-toggle"
              onclick="toggleTheme()"
              class="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Toggle color theme">
        <span id="theme-icon" aria-hidden="true"></span>
        <span id="theme-label"></span>
      </button>
    </div>
  </header>

  <!-- Two-column layout: main content + review sidebar -->
  <div class="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 ${sidebarContent ? "lg:flex lg:gap-6" : ""}">
    <!-- Main content -->
    <main id="main-content" class="${sidebarContent ? "flex-1 min-w-0" : "max-w-5xl mx-auto"}">
      ${bodyContent}
    </main>
    ${
			sidebarContent
				? `
    <!-- Review sidebar: sticky on desktop, bottom-sheet on mobile -->
    <div id="sidebar-desktop-slot" class="hidden lg:block w-80 shrink-0">
      ${sidebarContent}
    </div>
    <!-- Mobile: FAB to open bottom sheet -->
    <button id="mobile-sidebar-toggle"
            class="lg:hidden fixed bottom-4 right-4 z-50 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center transition-colors"
            aria-label="Toggle review sidebar"
            onclick="window._toggleMobileSidebar()">
      <span class="text-xl" aria-hidden="true">&#128172;</span>
      <span id="mobile-badge" class="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center hidden">0</span>
    </button>
    <div id="mobile-sidebar-sheet" class="lg:hidden hidden fixed inset-0 z-50">
      <div class="absolute inset-0 bg-black/50" onclick="window._toggleMobileSidebar()"></div>
      <div class="absolute bottom-0 left-0 right-0 max-h-[80vh] bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl overflow-hidden flex flex-col">
        <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <span class="font-semibold">Review</span>
          <button onclick="window._toggleMobileSidebar()" class="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">&times;</button>
        </div>
        <div id="mobile-sidebar-slot" class="overflow-y-auto flex-1 p-4">
          <!-- sidebar moves here on mobile open -->
        </div>
      </div>
    </div>
    <script>
      // Move the single sidebar instance between desktop and mobile containers
      (function() {
        var sidebar = document.getElementById('review-sidebar');
        var desktopSlot = document.getElementById('sidebar-desktop-slot');
        var mobileSlot = document.getElementById('mobile-sidebar-slot');
        var sheet = document.getElementById('mobile-sidebar-sheet');
        window._toggleMobileSidebar = function() {
          var isHidden = sheet.classList.contains('hidden');
          if (isHidden) {
            // Move sidebar to mobile slot
            if (sidebar && mobileSlot) mobileSlot.appendChild(sidebar);
            sheet.classList.remove('hidden');
          } else {
            sheet.classList.add('hidden');
            // Move sidebar back to desktop slot
            if (sidebar && desktopSlot) desktopSlot.appendChild(sidebar);
          }
        };
        // On resize, if we go from mobile->desktop while sheet is open, move back
        window.addEventListener('resize', function() {
          if (window.innerWidth >= 1024 && !sheet.classList.contains('hidden')) {
            sheet.classList.add('hidden');
            if (sidebar && desktopSlot) desktopSlot.appendChild(sidebar);
          }
        });
      })();
    </script>
    `
				: ""
		}
  </div>

  <!-- Embedded review data -->
  <script>const reviewData = ${reviewDataJson};</script>

  <!-- Dark mode: system→dark→light→system toggle -->
  <script>
    (function() {
      const KEY = 'haiku-review-theme';
      function getEffective() {
        const s = localStorage.getItem(KEY);
        if (s === 'dark' || s === 'light') return s;
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      function apply() {
        const eff = getEffective();
        document.documentElement.classList.toggle('dark', eff === 'dark');
        updateButton();
        window.dispatchEvent(new Event('themeChanged'));
      }
      function updateButton() {
        const stored = localStorage.getItem(KEY);
        const icon = document.getElementById('theme-icon');
        const label = document.getElementById('theme-label');
        if (!icon || !label) return;
        if (!stored) { icon.textContent = '\\u2699'; label.textContent = 'System'; }
        else if (stored === 'dark') { icon.textContent = '\\u263E'; label.textContent = 'Dark'; }
        else { icon.textContent = '\\u2600'; label.textContent = 'Light'; }
      }
      window.toggleTheme = function() {
        const stored = localStorage.getItem(KEY);
        const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (!stored) localStorage.setItem(KEY, sysDark ? 'light' : 'dark');
        else if (stored === 'dark') localStorage.setItem(KEY, 'light');
        else localStorage.removeItem(KEY);
        apply();
      };
      apply();
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', apply);
    })();
  </script>

  <!-- Mermaid: UMD build with SRI, theme-aware init, re-render on theme change -->
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11.13.0/dist/mermaid.min.js"
          integrity="sha384-tI0sDqjGJcqrQ8e/XKiQGS+ee11v5knTNWx2goxMBxe4DO9U0uKlfxJtYB9ILZ4j"
          crossorigin="anonymous"></script>
  <script>
    (function() {
      function isDark() {
        return document.documentElement.classList.contains('dark');
      }

      function initMermaid() {
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark() ? 'dark' : 'default',
        });
      }

      // Store original mermaid source for re-rendering
      document.querySelectorAll('.mermaid').forEach(function(el) {
        el.setAttribute('data-original', el.textContent || '');
      });

      initMermaid();
      mermaid.run();

      window.addEventListener('themeChanged', function() {
        mermaid.initialize({
          theme: isDark() ? 'dark' : 'default',
        });
        document.querySelectorAll('.mermaid').forEach(function(el) {
          var original = el.getAttribute('data-original');
          if (original) {
            el.removeAttribute('data-processed');
            // Use textContent (not innerHTML) to avoid XSS when restoring Mermaid source
            el.textContent = original;
          }
        });
        mermaid.run();
      });
    })();
  </script>


</body>
</html>`
}

export function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
}

export function escapeAttr(str: string): string {
	return escapeHtml(str).replace(/'/g, "&#39;")
}
