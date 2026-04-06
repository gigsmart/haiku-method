import { useEffect, useState } from "react";

const KEY = "haiku-review-theme";

type ThemeState = "system" | "dark" | "light";

function getStoredTheme(): ThemeState {
  const stored = localStorage.getItem(KEY);
  if (stored === "dark") return "dark";
  if (stored === "light") return "light";
  return "system";
}

function applyTheme(theme: ThemeState) {
  const isDark =
    theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", isDark);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeState>(getStoredTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function toggle() {
    const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    let next: ThemeState;
    if (theme === "system") {
      next = sysDark ? "light" : "dark";
    } else if (theme === "dark") {
      next = "light";
    } else {
      next = "system";
    }

    if (next === "system") {
      localStorage.removeItem(KEY);
    } else {
      localStorage.setItem(KEY, next);
    }
    setTheme(next);
  }

  const icon = theme === "system" ? "\u2699" : theme === "dark" ? "\u263E" : "\u2600";
  const label = theme === "system" ? "System" : theme === "dark" ? "Dark" : "Light";

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-stone-300 dark:border-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
      aria-label="Toggle color theme"
    >
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
