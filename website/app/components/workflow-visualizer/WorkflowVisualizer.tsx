"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useCallback, useEffect, useState } from "react"
import { HatDetailCard } from "./HatDetailCard"
import { PlaybackControls } from "./PlaybackControls"
import { WorkflowDiagram } from "./WorkflowDiagram"
import { WorkflowSelector } from "./WorkflowSelector"
import { workflowData } from "./data"

const STEP_DURATION = 2000 // 2 seconds per step

export function WorkflowVisualizer() {
	const [activeWorkflowId, setActiveWorkflowId] = useState(
		workflowData.workflows[0].id,
	)
	const [currentStep, setCurrentStep] = useState(0)
	const [isPlaying, setIsPlaying] = useState(false)
	const [selectedStep, setSelectedStep] = useState<number | null>(null)

	const activeWorkflow = workflowData.workflows.find(
		(w) => w.id === activeWorkflowId,
	)
	const steps = activeWorkflow?.steps ?? []
	const totalSteps = steps.length

	// Auto-advance when playing
	useEffect(() => {
		if (!isPlaying) return

		const timer = setInterval(() => {
			setCurrentStep((prev) => {
				if (prev >= totalSteps - 1) {
					// At the end, loop back if there's an iteration loop
					if (activeWorkflow?.iterationLoop) {
						return activeWorkflow.iterationLoop.toStep
					}
					// Otherwise stop playing
					setIsPlaying(false)
					return prev
				}
				return prev + 1
			})
		}, STEP_DURATION)

		return () => clearInterval(timer)
	}, [isPlaying, totalSteps, activeWorkflow])

	// Reset when workflow changes
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally re-run when activeWorkflowId changes
	useEffect(() => {
		setCurrentStep(0)
		setIsPlaying(false)
		setSelectedStep(null)
	}, [activeWorkflowId])

	const handlePlayPause = useCallback(() => {
		setIsPlaying((prev) => !prev)
	}, [])

	const handleStepBack = useCallback(() => {
		setCurrentStep((prev) => Math.max(0, prev - 1))
	}, [])

	const handleStepForward = useCallback(() => {
		setCurrentStep((prev) => Math.min(totalSteps - 1, prev + 1))
	}, [totalSteps])

	const handleReset = useCallback(() => {
		setCurrentStep(0)
		setIsPlaying(false)
		setSelectedStep(null)
	}, [])

	const handleHatClick = useCallback((stepIndex: number) => {
		setSelectedStep((prev) => (prev === stepIndex ? null : stepIndex))
		setCurrentStep(stepIndex)
		setIsPlaying(false)
	}, [])

	const handleWorkflowSelect = useCallback((workflowId: string) => {
		setActiveWorkflowId(workflowId)
	}, [])

	// Determine which hat to show in the detail card
	const displayStep = selectedStep ?? currentStep
	const currentStepData = steps[displayStep]
	const currentHat = currentStepData
		? workflowData.hats[currentStepData.hatId]
		: null

	return (
		<div className="w-full max-w-5xl mx-auto space-y-8">
			{/* Workflow selector tabs */}
			<WorkflowSelector
				workflows={workflowData.workflows}
				activeWorkflowId={activeWorkflowId}
				onSelect={handleWorkflowSelect}
			/>

			{/* Workflow description */}
			<AnimatePresence mode="wait">
				<motion.div
					key={activeWorkflowId}
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -10 }}
					className="text-center"
				>
					<h2 className="text-2xl font-bold mb-2">
						{activeWorkflow?.name} Workflow
					</h2>
					<p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
						{activeWorkflow?.description}
					</p>
				</motion.div>
			</AnimatePresence>

			{/* Workflow diagram */}
			<div className="py-8">
				{activeWorkflow && (
					<WorkflowDiagram
						workflow={activeWorkflow}
						hats={workflowData.hats}
						currentStep={currentStep}
						onHatClick={handleHatClick}
					/>
				)}
			</div>

			{/* Playback controls */}
			<PlaybackControls
				isPlaying={isPlaying}
				currentStep={currentStep}
				totalSteps={totalSteps}
				onPlayPause={handlePlayPause}
				onStepBack={handleStepBack}
				onStepForward={handleStepForward}
				onReset={handleReset}
			/>

			{/* Hat detail card */}
			<HatDetailCard hat={currentHat} step={currentStepData ?? null} />

			{/* Operating mode legend */}
			<div className="flex flex-wrap justify-center gap-4 pt-4 border-t border-gray-200 dark:border-gray-800">
				<div className="flex items-center gap-2">
					<span className="w-3 h-3 rounded-full bg-blue-500" />
					<span className="text-sm text-gray-600 dark:text-gray-400">
						HITL - Human-in-the-Loop
					</span>
				</div>
				<div className="flex items-center gap-2">
					<span className="w-3 h-3 rounded-full bg-green-500" />
					<span className="text-sm text-gray-600 dark:text-gray-400">
						OHOTL - Observed Human-on-the-Loop
					</span>
				</div>
				<div className="flex items-center gap-2">
					<span className="w-3 h-3 rounded-full bg-orange-500" />
					<span className="text-sm text-gray-600 dark:text-gray-400">
						AHOTL - Autonomous Human-on-the-Loop
					</span>
				</div>
			</div>
		</div>
	)
}
