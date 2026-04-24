/**
 * Barrel export for the feedback component cluster (unit-08).
 *
 * See `stages/development/units/unit-08-feedback-components.md` and
 * `stages/development/artifacts/unit-08-tactical-plan.md` for scope.
 */

export type { FeedbackFloatingButtonProps } from "./FeedbackFloatingButton"
export { FeedbackFloatingButton } from "./FeedbackFloatingButton"
export type { FeedbackItemProps } from "./FeedbackItem"
export { FeedbackItem } from "./FeedbackItem"
export type { FeedbackListProps } from "./FeedbackList"
export {
	DEFAULT_ITEM_SIZE,
	DEFAULT_LIST_HEIGHT,
	FeedbackList,
	VIRTUALIZE_THRESHOLD,
} from "./FeedbackList"
export type { FeedbackOriginIconProps } from "./FeedbackOriginIcon"
export {
	FeedbackOriginIcon,
	originIcons,
	originLabels,
} from "./FeedbackOriginIcon"
export type { FeedbackSheetProps } from "./FeedbackSheet"
export { FeedbackSheet } from "./FeedbackSheet"
export type { FeedbackStatusBadgeProps } from "./FeedbackStatusBadge"
export { FeedbackStatusBadge } from "./FeedbackStatusBadge"
export type { FeedbackSummaryBarProps } from "./FeedbackSummaryBar"
export { FeedbackSummaryBar } from "./FeedbackSummaryBar"
export type { FeedbackOrigin, FeedbackStatus } from "./tokens"
export {
	feedbackStatusColors,
	originColors,
	statusBackground,
	statusBorderLeft,
	statusDotClasses,
	TOKEN_HASH,
	visitCounterClasses,
} from "./tokens"
export type {
	FeedbackListKeyboardNavHandle,
	UseFeedbackListKeyboardNavOptions,
} from "./useFeedbackListKeyboardNav"
export { useFeedbackListKeyboardNav } from "./useFeedbackListKeyboardNav"
