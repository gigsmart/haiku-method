/**
 * /review/:sessionId/stages/:stage — stage layout.
 *
 * Renders the sticky StageBanner + a rereview banner (when the session
 * carries a previous-review snapshot), then the child route content in
 * the main pane.
 */

import { createFileRoute, Outlet } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { RereviewBanner } from "../../../../../pages/review/shared/RereviewBanner"
import { useReviewContext } from "../../-context"
import { gateBadgeCopy, resolveGateModes } from "../../-review-helpers"
import { StageBanner } from "./-stage-banner"

function StageLayout(): React.ReactElement {
	const { stage } = Route.useParams()
	const { session, activeStage } = useReviewContext()
	const stageStates = session.stage_states ?? {}
	const stageStatus =
		stage === activeStage
			? "current"
			: (stageStates[stage]?.status ?? "pending")
	const stagePhase = stageStates[stage]?.phase ?? null
	const gateModes = resolveGateModes(session.gate_type)
	const gateBadges = gateModes.map(gateBadgeCopy)

	// Keep the Tab list from sliding under the sticky StageBanner by
	// publishing the banner's actual rendered height into the scope's
	// `--header-height` CSS variable. `<Tabs>` sticks at
	// `top: var(--header-height)`, and the banner itself varies in
	// height (phase stepper + wrapping gate badges), so a hard-coded
	// value gets it wrong in the banner's taller states.
	const bannerRef = useRef<HTMLDivElement>(null)
	const [bannerHeight, setBannerHeight] = useState<number | null>(null)
	useEffect(() => {
		const el = bannerRef.current
		if (!el) return
		const measure = () => setBannerHeight(el.getBoundingClientRect().height)
		measure()
		const obs = new ResizeObserver(measure)
		obs.observe(el)
		return () => obs.disconnect()
	}, [])

	const scopeStyle = bannerHeight
		? ({ "--header-height": `${bannerHeight}px` } as React.CSSProperties)
		: undefined

	return (
		<div style={scopeStyle}>
			<div ref={bannerRef} className="sticky top-0 z-20">
				<StageBanner
					stageName={stage}
					stageStatus={stageStatus}
					stagePhase={stagePhase}
					gateBadges={gateBadges}
				/>
			</div>
			<div className="px-6 lg:px-10 pb-6">
				{session.previous_review && (
					<RereviewBanner snapshot={session.previous_review} />
				)}
				<Outlet />
			</div>
		</div>
	)
}

export const Route = createFileRoute("/review/$sessionId/stages/$stage")({
	component: StageLayout,
})
