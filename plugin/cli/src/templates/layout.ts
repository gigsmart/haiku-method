import { tailwindConfig } from "./styles.js";

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function escapeAttr(str: string): string {
  return escapeHtml(str).replace(/'/g, "&#39;");
}

export interface LayoutOptions {
  navHref?: string;
  navLabel?: string;
  breadcrumbHtml?: string;
}

/**
 * Renders the full static HTML document shell.
 * Tailwind CDN, Mermaid ESM with theme-aware re-render, dark-mode toggle, skip-nav.
 * Markdown is rendered server-side — no marked.js needed.
 */
export function renderStaticLayout(
  title: string,
  bodyContent: string,
  options?: LayoutOptions,
): string {
  const navLink = options?.navHref
    ? `<a href="${escapeAttr(options.navHref)}"
          class="text-sm text-blue-600 dark:text-blue-400 hover:underline mr-4">&larr; ${escapeHtml(options.navLabel ?? "Back")}</a>`
    : "";

  const breadcrumb = options?.breadcrumbHtml ?? "";

  return `<!DOCTYPE html>
<html lang="en" class="">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeAttr(title)}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  ${tailwindConfig}
  <style>
    [role="tabpanel"][hidden] { display: none; }
    html { transition: background-color 0.2s, color 0.2s; }
    .mermaid svg { max-width: 100%; height: auto; }
  </style>
</head>
<body class="bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 min-h-screen transition-colors">
  <a href="#main-content"
     class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded">
    Skip to main content
  </a>

  <header class="sticky top-0 z-40 bg-white/80 dark:bg-gray-900/80 backdrop-blur border-b border-gray-200 dark:border-gray-800">
    <div class="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
      <div class="flex items-center min-w-0">
        ${navLink}
        <h1 class="text-lg font-semibold truncate">${escapeHtml(title)}</h1>
      </div>
      <button id="theme-toggle"
              onclick="toggleTheme()"
              class="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Toggle color theme">
        <span id="theme-icon" aria-hidden="true"></span>
        <span id="theme-label"></span>
      </button>
    </div>
  </header>

  <main id="main-content" class="max-w-5xl mx-auto px-4 sm:px-6 py-6">
    ${breadcrumb}
    ${bodyContent}
  </main>

  <!-- Dark mode: system preference default, toggle cycles system→dark→light -->
  <script>
    (function() {
      var KEY = 'ai-dlc-dashboard-theme';
      function getEffective() {
        var s = localStorage.getItem(KEY);
        if (s === 'dark' || s === 'light') return s;
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      function apply() {
        var eff = getEffective();
        document.documentElement.classList.toggle('dark', eff === 'dark');
        updateButton();
        window.dispatchEvent(new Event('themeChanged'));
      }
      function updateButton() {
        var stored = localStorage.getItem(KEY);
        var icon = document.getElementById('theme-icon');
        var label = document.getElementById('theme-label');
        if (!icon || !label) return;
        if (!stored) { icon.textContent = '\\u2699'; label.textContent = 'System'; }
        else if (stored === 'dark') { icon.textContent = '\\u263E'; label.textContent = 'Dark'; }
        else { icon.textContent = '\\u2600'; label.textContent = 'Light'; }
      }
      window.toggleTheme = function() {
        var stored = localStorage.getItem(KEY);
        var sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (!stored) localStorage.setItem(KEY, sysDark ? 'light' : 'dark');
        else if (stored === 'dark') localStorage.setItem(KEY, 'light');
        else localStorage.removeItem(KEY);
        apply();
      };
      apply();
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', apply);
    })();
  </script>

  <!-- Mermaid: ESM import, theme-aware init, re-render on theme change -->
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

    function isDark() {
      return document.documentElement.classList.contains('dark');
    }

    document.querySelectorAll('.mermaid').forEach(function(el) {
      el.setAttribute('data-original', el.textContent || '');
    });

    mermaid.initialize({
      startOnLoad: false,
      theme: isDark() ? 'dark' : 'default',
      securityLevel: 'loose',
    });
    await mermaid.run();

    window.addEventListener('themeChanged', async function() {
      mermaid.initialize({
        theme: isDark() ? 'dark' : 'default',
        securityLevel: 'loose',
      });
      for (var el of document.querySelectorAll('.mermaid')) {
        var original = el.getAttribute('data-original');
        if (original) {
          el.removeAttribute('data-processed');
          el.innerHTML = original;
        }
      }
      await mermaid.run();
    });
  </script>
</body>
</html>`;
}
