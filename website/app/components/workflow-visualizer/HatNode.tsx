"use client"

import { motion } from "framer-motion"
import type { Hat } from "./types"

interface HatNodeProps {
	hat: Hat
	isActive: boolean
	isCompleted: boolean
	stepNumber: number
	onClick: () => void
}

export function HatNode({
	hat,
	isActive,
	isCompleted,
	stepNumber,
	onClick,
}: HatNodeProps) {
	return (
		<motion.button
			type="button"
			onClick={onClick}
			className={`
				relative flex flex-col items-center gap-2 p-4 rounded-2xl
				transition-colors duration-300 cursor-pointer
				focus:outline-none focus:ring-2 focus:ring-offset-2
				${hat.color.bg} dark:${hat.color.bgDark}
				${isActive ? `${hat.color.border} dark:${hat.color.borderDark} border-2` : "border border-transparent"}
				${isCompleted ? "opacity-60" : "opacity-100"}
				hover:scale-105
			`}
			animate={{
				scale: isActive ? 1.1 : 1,
				boxShadow: isActive
					? `0 0 24px 4px ${hat.color.glow}`
					: "0 0 0 0 transparent",
			}}
			transition={{
				scale: { type: "spring", stiffness: 300, damping: 20 },
				boxShadow: { duration: 0.3 },
			}}
			aria-label={`${hat.name} - ${hat.description}`}
			aria-pressed={isActive}
		>
			{/* Step number badge */}
			<div
				className={`
					absolute -top-2 -left-2 w-6 h-6 rounded-full
					flex items-center justify-center text-xs font-bold
					${isActive ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900" : "bg-stone-300 text-stone-700 dark:bg-stone-700 dark:text-stone-300"}
				`}
			>
				{stepNumber + 1}
			</div>

			{/* Emoji circle */}
			<motion.div
				className={`
					w-16 h-16 rounded-full flex items-center justify-center text-3xl
					bg-white dark:bg-stone-800 shadow-md
					${isActive ? `ring-2 ring-offset-2 ${hat.color.border}` : ""}
				`}
				animate={{
					rotate: isActive ? [0, -5, 5, -5, 0] : 0,
				}}
				transition={{
					duration: 0.5,
					repeat: isActive ? Number.POSITIVE_INFINITY : 0,
					repeatDelay: 2,
				}}
			>
				{hat.emoji}
			</motion.div>

			{/* Name */}
			<span
				className={`font-semibold text-sm ${hat.color.text} dark:${hat.color.textDark}`}
			>
				{hat.name}
			</span>

			{/* Completed checkmark */}
			{isCompleted && (
				<motion.div
					initial={{ scale: 0 }}
					animate={{ scale: 1 }}
					className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center"
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
							strokeWidth={3}
							d="M5 13l4 4L19 7"
						/>
					</svg>
				</motion.div>
			)}
		</motion.button>
	)
}
