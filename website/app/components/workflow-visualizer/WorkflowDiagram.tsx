"use client"

import { motion } from "framer-motion"
import { HatNode } from "./HatNode"
import { IterationLoop } from "./IterationLoop"
import { TransitionArrow } from "./TransitionArrow"
import type { Hat, Workflow } from "./types"

interface WorkflowDiagramProps {
	workflow: Workflow
	hats: Record<string, Hat>
	currentStep: number
	onHatClick: (stepIndex: number) => void
}

export function WorkflowDiagram({
	workflow,
	hats,
	currentStep,
	onHatClick,
}: WorkflowDiagramProps) {
	const isLastStep = currentStep === workflow.steps.length - 1
	const showIterationLoop = workflow.iterationLoop && isLastStep

	return (
		<div className="w-full">
			{/* Main workflow diagram */}
			<div className="flex flex-col items-center">
				{/* Desktop: horizontal layout */}
				<div className="hidden md:flex items-center justify-center gap-2 w-full max-w-4xl px-4">
					{workflow.steps.map((step, index) => {
						const hat = hats[step.hatId]
						if (!hat) return null

						const isActive = index === currentStep
						const isCompleted = index < currentStep

						return (
							<motion.div
								// biome-ignore lint/suspicious/noArrayIndexKey: same hatId can appear at multiple steps in a workflow; the index disambiguates the instance
								key={`${workflow.id}-${step.hatId}-${index}`}
								className="flex items-center"
								initial={{ opacity: 0, y: 20 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: index * 0.1 }}
							>
								<HatNode
									hat={hat}
									isActive={isActive}
									isCompleted={isCompleted}
									stepNumber={index}
									onClick={() => onHatClick(index)}
								/>
								{index < workflow.steps.length - 1 && (
									<TransitionArrow
										isActive={index === currentStep - 1}
										direction="right"
									/>
								)}
							</motion.div>
						)
					})}
				</div>

				{/* Mobile: vertical layout */}
				<div className="flex md:hidden flex-col items-center gap-2 w-full px-4">
					{workflow.steps.map((step, index) => {
						const hat = hats[step.hatId]
						if (!hat) return null

						const isActive = index === currentStep
						const isCompleted = index < currentStep

						return (
							<motion.div
								// biome-ignore lint/suspicious/noArrayIndexKey: same hatId can appear at multiple steps (mobile layout)
								key={`${workflow.id}-${step.hatId}-${index}-mobile`}
								className="flex flex-col items-center"
								initial={{ opacity: 0, x: -20 }}
								animate={{ opacity: 1, x: 0 }}
								transition={{ delay: index * 0.1 }}
							>
								<HatNode
									hat={hat}
									isActive={isActive}
									isCompleted={isCompleted}
									stepNumber={index}
									onClick={() => onHatClick(index)}
								/>
								{index < workflow.steps.length - 1 && (
									<TransitionArrow
										isActive={index === currentStep - 1}
										direction="down"
									/>
								)}
							</motion.div>
						)
					})}
				</div>

				{/* Iteration loop (shown when at last step) */}
				{workflow.iterationLoop && (
					<div className="hidden md:block w-full max-w-4xl px-4">
						<IterationLoop
							loop={workflow.iterationLoop}
							isActive={showIterationLoop ?? false}
							stepCount={workflow.steps.length}
						/>
					</div>
				)}

				{/* Mobile iteration loop indicator */}
				{workflow.iterationLoop && showIterationLoop && (
					<motion.div
						initial={{ opacity: 0, scale: 0.8 }}
						animate={{ opacity: 1, scale: 1 }}
						className="md:hidden mt-4 px-4 py-2 bg-amber-100 dark:bg-amber-900/50 rounded-full text-amber-800 dark:text-amber-200 text-sm font-medium flex items-center gap-2"
					>
						<svg
							className="w-4 h-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							aria-hidden="true"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
							/>
						</svg>
						{workflow.iterationLoop.label}
					</motion.div>
				)}
			</div>
		</div>
	)
}
