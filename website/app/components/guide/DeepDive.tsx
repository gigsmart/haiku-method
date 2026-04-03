"use client"

import { motion } from "framer-motion"
import { type ReactNode, useEffect, useState } from "react"

interface DeepDiveProps {
	title: string
	children: ReactNode
	forceOpen?: boolean
}

export function DeepDive({ title, children, forceOpen }: DeepDiveProps) {
	const [open, setOpen] = useState(false)

	useEffect(() => {
		if (forceOpen !== undefined) {
			setOpen(forceOpen)
		}
	}, [forceOpen])

	return (
		<motion.div
			initial={{ opacity: 0, y: 16 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-40px" }}
			transition={{ duration: 0.5 }}
			className="my-6 overflow-hidden rounded-lg border border-gray-200 border-l-violet-500 border-l-[3px] bg-white dark:border-gray-700 dark:border-l-violet-500 dark:bg-gray-950"
		>
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className="flex w-full items-center gap-2 px-5 py-4 text-left text-sm font-semibold text-violet-600 transition-colors hover:bg-violet-50/50 dark:text-violet-400 dark:hover:bg-violet-950/20"
			>
				<span className="text-base">&#x1F52C;</span>
				<span className="flex-1">{title}</span>
				<span
					className={`text-[0.65rem] text-gray-400 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
				>
					&#x25B6;
				</span>
			</button>
			{open && (
				<div className="border-t border-gray-200 px-5 py-5 text-sm leading-relaxed text-gray-600 dark:border-gray-700 dark:text-gray-300">
					{children}
				</div>
			)}
		</motion.div>
	)
}
