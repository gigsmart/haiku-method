/**
 * Barrel export for the a11y foundation layer.
 *
 * See `stages/development/units/unit-05-a11y-foundations.md` and the tactical
 * plan at `stages/development/artifacts/unit-05-tactical-plan.md` for scope.
 *
 * Every downstream feature unit (shell, review page, feedback components,
 * agent toggle, feedback sheet, revisit modal, stage strip, annotation
 * canvas, question page) consumes primitives from this module.
 */

export type { FocusRingVariant } from "./focus"
export {
	focusRingClass,
	focusRingCompactClass,
	focusRingVariantClasses,
	focusVisibleOnly,
	useFocusTrap,
} from "./focus"
export type { ShortcutBinding, UseShortcutOptions } from "./keyboard"
export {
	KEYBOARD_SHORTCUT_REGISTRY,
	KeyboardShortcutConflict,
	useShortcut,
} from "./keyboard"
export type {
	AsideProps,
	FooterBarProps,
	HeaderProps,
	MainProps,
	NavProps,
} from "./landmarks"
export {
	Aside,
	FooterBar,
	Header,
	Main,
	Nav,
} from "./landmarks"
export type { LiveRegionProps, Severity } from "./live-regions"
export {
	ASSERTIVE_REGION_ID,
	announce,
	LiveRegion,
	LiveRegionShell,
	POLITE_REGION_ID,
	useAnnounce,
} from "./live-regions"
export { motionSafeClass, useReducedMotion } from "./reduced-motion"
export { touchTargetClass, touchTargetHitAreaClass } from "./touch-target"
