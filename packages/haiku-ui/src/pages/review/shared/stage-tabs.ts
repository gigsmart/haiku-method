/**
 * Stage-tab + detail-kind union types used by `<StageReview>` and the
 * leaf routes under `/review/:sessionId/stages/:stage/*`.
 *
 * These are the canonical set of tabs the stage view surfaces and the
 * set of artifact kinds that carry a dedicated detail view. Keeping
 * them here (rather than in a routing module) lets them stay aligned
 * with the component that renders them; the router just consumes these
 * unions when validating URL params.
 */

export type ReviewTab = "overview" | "units" | "knowledge" | "outputs"

export type ReviewDetailKind = "units" | "knowledge" | "outputs"
