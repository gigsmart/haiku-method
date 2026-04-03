"use client"

import { motion } from "framer-motion"
import type { ReactNode } from "react"

interface ChatBubbleProps {
	speaker: "human" | "ai" | "system"
	label?: string
	children: ReactNode
}

const speakerConfig = {
	human: {
		align: "justify-start" as const,
		bg: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",
		radius: "rounded-2xl rounded-bl-sm",
		labelColor: "text-blue-500",
		icon: "\u{1F9D1}",
		defaultLabel: "You",
	},
	ai: {
		align: "justify-end" as const,
		bg: "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800",
		radius: "rounded-2xl rounded-br-sm",
		labelColor: "text-amber-500",
		icon: "\u{1F916}",
		defaultLabel: "Claude",
	},
	system: {
		align: "justify-center" as const,
		bg: "bg-gray-50 border-gray-200 dark:bg-gray-900/50 dark:border-gray-700",
		radius: "rounded-2xl",
		labelColor: "text-gray-500",
		icon: "\u2699\uFE0F",
		defaultLabel: "System",
	},
}

export function ChatBubble({ speaker, label, children }: ChatBubbleProps) {
	const config = speakerConfig[speaker]

	return (
		<div className={`flex ${config.align}`}>
			<motion.div
				initial={{ opacity: 0, y: 12 }}
				whileInView={{ opacity: 1, y: 0 }}
				viewport={{ once: true, margin: "-20px" }}
				transition={{ duration: 0.4 }}
				className={`max-w-xl border p-4 ${config.bg} ${config.radius} ${speaker === "system" ? "w-full max-w-2xl text-center" : ""}`}
			>
				<div
					className={`mb-1.5 flex items-center gap-1.5 text-xs font-semibold ${config.labelColor}`}
				>
					<span>{config.icon}</span>
					<span>{label || config.defaultLabel}</span>
				</div>
				<div className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
					{children}
				</div>
			</motion.div>
		</div>
	)
}

interface BubbleOptionProps {
	children: ReactNode
	variant?: "blue" | "gold" | "selected"
}

export function BubbleOption({
	children,
	variant = "blue",
}: BubbleOptionProps) {
	const styles = {
		blue: "border-blue-300 bg-blue-50 text-blue-500 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
		gold: "border-amber-300 bg-amber-50 text-amber-600 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
		selected:
			"border-green-400 bg-green-50 text-green-600 dark:border-green-700 dark:bg-green-950/30 dark:text-green-400",
	}

	return (
		<span
			className={`inline-block rounded-full border px-3 py-1 text-xs font-medium ${styles[variant]}`}
		>
			{children}
		</span>
	)
}

interface ExchangeLabelProps {
	children: ReactNode
}

export function ExchangeLabel({ children }: ExchangeLabelProps) {
	return (
		<div className="py-1 text-center text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
			{children}
		</div>
	)
}
