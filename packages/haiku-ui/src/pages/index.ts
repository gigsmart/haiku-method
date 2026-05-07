/**
 * Barrel re-export for per-page modules consumed by the leaf routes
 * under `src/routes/`. One folder per page-type; each module owns its
 * own fetch + hook lifecycle and dispatches to the presentational
 * component in `src/components/`.
 *
 * The review page's layout lives in the route tree itself
 * (`src/routes/review/$sessionId/route.tsx`) so there is no
 * `ReviewModule` here — the router drives that lifecycle directly.
 */

export { DirectionPageModule as DirectionModule } from "./direction"
export { PickerPageModule as PickerModule } from "./picker"
export { QuestionPageModule as QuestionModule } from "./question"
