import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
	title: "Operation Phase",
	description:
		"Manage what was delivered through recurring tasks, reactive responses, and AI-guided manual activities.",
}

export default function OperationPage() {
	return (
		<div className="mx-auto max-w-3xl px-4 py-12">
			<div className="mb-2 text-sm font-medium text-amber-600">
				Phase 3 of 4
			</div>
			<h1 className="mb-4 text-4xl font-bold">Operation</h1>
			<p className="mb-8 text-lg text-stone-600">
				Manage what was delivered. Not every initiative ends at delivery ---
				many require sustained activity. Operation governs the ongoing
				management of delivered outcomes, following the operational plan
				produced during execution.
			</p>

			<div className="mb-12 rounded-xl border border-amber-200 bg-amber-50 p-6">
				<h2 className="mb-3 font-semibold text-amber-800">Key Artifacts</h2>
				<ul className="space-y-2 text-sm text-amber-700">
					<li>Activity logs documenting actions taken</li>
					<li>Incident records for reactive responses</li>
					<li>Performance data against operational metrics</li>
					<li>Recommendations for improvement</li>
				</ul>
			</div>

			<section className="mb-10">
				<h2 className="mb-4 text-2xl font-bold">Recurring Tasks</h2>
				<p className="mb-4 text-stone-600">
					Scheduled, repeatable activities with AI assistance. Predictable,
					periodic actions that maintain the health or effectiveness of the
					delivered outcome.
				</p>
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b border-stone-200">
								<th className="py-2 pr-4 text-left font-semibold">Domain</th>
								<th className="py-2 text-left font-semibold">Examples</th>
							</tr>
						</thead>
						<tbody className="text-stone-600">
							<tr className="border-b border-stone-100">
								<td className="py-2 pr-4 font-medium text-stone-900">
									Software
								</td>
								<td className="py-2">
									Dependency updates, security patch review, performance
									monitoring
								</td>
							</tr>
							<tr className="border-b border-stone-100">
								<td className="py-2 pr-4 font-medium text-stone-900">
									Marketing
								</td>
								<td className="py-2">
									Content calendar execution, analytics review, campaign
									optimization
								</td>
							</tr>
							<tr className="border-b border-stone-100">
								<td className="py-2 pr-4 font-medium text-stone-900">
									Research
								</td>
								<td className="py-2">
									Data collection rounds, literature monitoring, progress
									reporting
								</td>
							</tr>
							<tr>
								<td className="py-2 pr-4 font-medium text-stone-900">
									Operations
								</td>
								<td className="py-2">
									SLA compliance checks, vendor reviews, process audits
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</section>

			<section className="mb-10">
				<h2 className="mb-4 text-2xl font-bold">Reactive Responses</h2>
				<p className="mb-4 text-stone-600">
					Triggered actions in response to events or conditions. When something
					happens that requires attention, the operational plan defines the
					response protocol.
				</p>
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b border-stone-200">
								<th className="py-2 pr-4 text-left font-semibold">Domain</th>
								<th className="py-2 text-left font-semibold">Examples</th>
							</tr>
						</thead>
						<tbody className="text-stone-600">
							<tr className="border-b border-stone-100">
								<td className="py-2 pr-4 font-medium text-stone-900">
									Software
								</td>
								<td className="py-2">
									Incident response, bug triage, performance degradation
								</td>
							</tr>
							<tr className="border-b border-stone-100">
								<td className="py-2 pr-4 font-medium text-stone-900">
									Marketing
								</td>
								<td className="py-2">
									Negative sentiment spike, competitor action, viral opportunity
								</td>
							</tr>
							<tr className="border-b border-stone-100">
								<td className="py-2 pr-4 font-medium text-stone-900">
									Research
								</td>
								<td className="py-2">
									Unexpected data pattern, equipment failure, protocol deviation
								</td>
							</tr>
							<tr>
								<td className="py-2 pr-4 font-medium text-stone-900">
									Operations
								</td>
								<td className="py-2">
									SLA breach, vendor outage, compliance finding
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</section>

			<section className="mb-10">
				<h2 className="mb-4 text-2xl font-bold">
					Manual Activities with AI Guidance
				</h2>
				<p className="text-stone-600">
					Human-led work supported by AI recommendations and context. Some
					operational activities require human judgment but benefit from AI's
					ability to synthesize information and suggest actions.
				</p>
			</section>

			<section className="mb-10">
				<h2 className="mb-4 text-2xl font-bold">
					Collaboration Modes in Operation
				</h2>
				<div className="space-y-4 text-sm text-stone-600">
					<p>
						<strong className="text-stone-900">Supervised:</strong> Human reviews
						every operational action. Critical for high-stakes environments like
						financial systems or regulated industries.
					</p>
					<p>
						<strong className="text-stone-900">Observed:</strong> AI handles
						routine operations while human monitors. Human intervenes when
						anomalies appear. Standard for most production environments.
					</p>
					<p>
						<strong className="text-stone-900">Autonomous:</strong> AI responds
						to events within defined boundaries, escalating only when conditions
						exceed its authority. Suitable for well-understood, high-volume
						operations.
					</p>
				</div>
			</section>

			<div className="flex items-center justify-between border-t border-stone-200 pt-6">
				<Link
					href="/phases/execution"
					className="inline-flex items-center gap-2 text-sm font-medium text-teal-600 hover:text-teal-700"
				>
					<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
					</svg>
					Previous: Execution
				</Link>
				<Link
					href="/phases/reflection"
					className="inline-flex items-center gap-2 text-sm font-medium text-teal-600 hover:text-teal-700"
				>
					Next: Reflection
					<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
					</svg>
				</Link>
			</div>
		</div>
	)
}
