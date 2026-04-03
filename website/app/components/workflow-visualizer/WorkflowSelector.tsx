"use client"

import { motion } from "framer-motion"
import type { Workflow } from "./types"

interface WorkflowSelectorProps {
	workflows: Workflow[]
	activeWorkflowId: string
	onSelect: (workflowId: string) => void
}

export function WorkflowSelector({
	workflows,
	activeWorkflowId,
	onSelect,
}: WorkflowSelectorProps) {
	return (
		<div className="flex flex-wrap justify-center gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
			{workflows.map((workflow) => {
				const isActive = workflow.id === activeWorkflowId
				return (
					<button
						key={workflow.id}
						type="button"
						onClick={() => onSelect(workflow.id)}
						className={`
							relative px-4 py-2 rounded-lg font-medium text-sm
							transition-colors duration-200
							${isActive ? "text-gray-900 dark:text-white" : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"}
						`}
						aria-pressed={isActive}
					>
						{isActive && (
							<motion.div
								layoutId="activeWorkflowTab"
								className="absolute inset-0 bg-white dark:bg-gray-700 rounded-lg shadow-sm"
								transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
							/>
						)}
						<span className="relative z-10">{workflow.name}</span>
					</button>
				)
			})}
		</div>
	)
}
