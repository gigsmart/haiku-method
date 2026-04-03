"use client"

import { AnimatePresence, motion } from "framer-motion"
import type { Hat, WorkflowStep } from "./types"

interface HatDetailCardProps {
	hat: Hat | null
	step: WorkflowStep | null
}

export function HatDetailCard({ hat, step }: HatDetailCardProps) {
	return (
		<AnimatePresence mode="wait">
			{hat && step ? (
				<motion.div
					key={hat.id}
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -20 }}
					transition={{ duration: 0.3 }}
					className={`
						p-6 rounded-2xl border-2
						${hat.color.bg} dark:${hat.color.bgDark}
						${hat.color.border} dark:${hat.color.borderDark}
					`}
				>
					<div className="flex items-start gap-4">
						{/* Emoji */}
						<div className="w-14 h-14 rounded-full bg-white dark:bg-stone-800 shadow-md flex items-center justify-center text-3xl flex-shrink-0">
							{hat.emoji}
						</div>

						<div className="flex-1 min-w-0">
							{/* Header */}
							<div className="flex items-center gap-3 mb-2">
								<h3
									className={`text-xl font-bold ${hat.color.text} dark:${hat.color.textDark}`}
								>
									{hat.name}
								</h3>
							</div>

							{/* Step description */}
							<p className="text-stone-700 dark:text-stone-300 mb-4">
								{step.description}
							</p>

							{/* Responsibilities */}
							<div>
								<h4 className="text-sm font-semibold text-stone-600 dark:text-stone-400 mb-2">
									Responsibilities
								</h4>
								<ul className="space-y-1">
									{hat.responsibilities.map((responsibility, index) => (
										<motion.li
											key={responsibility}
											initial={{ opacity: 0, x: -10 }}
											animate={{ opacity: 1, x: 0 }}
											transition={{ delay: index * 0.1 }}
											className="flex items-start gap-2 text-sm text-stone-600 dark:text-stone-400"
										>
											<svg
												className={`w-4 h-4 mt-0.5 flex-shrink-0 ${hat.color.text} dark:${hat.color.textDark}`}
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
												aria-hidden="true"
											>
												<title>Bullet</title>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
													d="M9 12l2 2 4-4"
												/>
											</svg>
											{responsibility}
										</motion.li>
									))}
								</ul>
							</div>
						</div>
					</div>
				</motion.div>
			) : (
				<motion.div
					key="placeholder"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					className="p-6 rounded-2xl border-2 border-dashed border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-900/30"
				>
					<p className="text-center text-stone-500 dark:text-stone-400">
						Click on a hat to see its details, or press play to see the workflow
						in action.
					</p>
				</motion.div>
			)}
		</AnimatePresence>
	)
}
