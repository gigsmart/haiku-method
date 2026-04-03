"use client"

import { motion } from "framer-motion"
import type { ReactNode } from "react"

interface CastCardProps {
	icon: string
	name: string
	nameColor: string
	borderColor: string
	description: string
	children?: ReactNode
}

export function CastCard({
	icon,
	name,
	nameColor,
	borderColor,
	description,
	children,
}: CastCardProps) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-40px" }}
			transition={{ duration: 0.5 }}
			className={`rounded-xl border border-gray-200 bg-white p-6 transition-transform hover:-translate-y-0.5 dark:border-gray-800 dark:bg-gray-900 ${borderColor}`}
		>
			<span className="mb-2 block text-3xl">{icon}</span>
			<h3 className={`mb-1 text-lg font-bold ${nameColor}`}>{name}</h3>
			<p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
				{description}
			</p>
			{children}
		</motion.div>
	)
}
