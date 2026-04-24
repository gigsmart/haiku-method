/**
 * Touch-target helpers per `stages/design/artifacts/touch-target-audit.md §2–§3`
 * and `DESIGN-TOKENS.md §1.7.1`.
 *
 * Rule: every pointer-activated control on mobile/tablet (≤ 768 px viewport)
 * MUST expose a ≥ 44×44 CSS-px hit area. Desktop minimum is 24×24 per WCAG
 * 2.5.8, but we target 44×44 everywhere a component might render on mobile.
 *
 * Two usage patterns:
 *
 *   1. Visible sizing — the element itself is ≥ 44×44. Apply `touchTargetClass`
 *      on any button/link that should grow to meet the minimum. Sets
 *      `min-height: 44px; min-width: 44px`.
 *
 *   2. Invisible hit-area expansion — the visible marker stays small (pins,
 *      dense overlays) but a transparent ::before pseudo-element absorbs
 *      pointer events at 44×44. Apply `touchTargetHitAreaClass`.
 *
 * Both variants are backed by CSS rules in `src/index.css` (.touch-target /
 * .touch-target.touch-target--hit-area). This module re-exports the class
 * tokens as constants so downstream code has a single source of truth.
 */

/**
 * Visible-sizing variant. Sets `min-height: 44px; min-width: 44px`.
 * Preferred for buttons, FABs, and any control where the visible geometry
 * can grow to meet the minimum.
 */
export const touchTargetClass = "touch-target"

/**
 * Invisible hit-area expansion via ::before pseudo-element. Use when the
 * visible marker must stay small (pins, ghost pins, inline markers). The
 * element's visible geometry is unchanged; pointer events hit a centered
 * 44×44 box behind the element.
 */
export const touchTargetHitAreaClass = "touch-target touch-target--hit-area"
