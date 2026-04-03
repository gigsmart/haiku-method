"use client"

import { motion } from "framer-motion"

interface TransitionArrowProps {
	isActive: boolean
	direction?: "right" | "down"
}

export function TransitionArrow({
	isActive,
	direction = "right",
}: TransitionArrowProps) {
	const isHorizontal = direction === "right"

	return (
		<div
			className={`flex items-center justify-center ${isHorizontal ? "w-12 h-full" : "h-12 w-full"}`}
		>
			<motion.div
				className={`relative ${isHorizontal ? "w-full h-0.5" : "w-0.5 h-full"}`}
			>
				{/* Arrow line */}
				<motion.div
					className={`absolute ${isHorizontal ? "h-0.5 top-0 left-0" : "w-0.5 top-0 left-0"} bg-stone-300 dark:bg-stone-600`}
					style={isHorizontal ? { width: "100%" } : { height: "100%" }}
				/>

				{/* Animated fill */}
				<motion.div
					className={`absolute ${isHorizontal ? "h-0.5 top-0 left-0" : "w-0.5 top-0 left-0"} bg-blue-500 dark:bg-blue-400`}
					initial={isHorizontal ? { width: 0 } : { height: 0 }}
					animate={
						isActive
							? isHorizontal
								? { width: "100%" }
								: { height: "100%" }
							: isHorizontal
								? { width: 0 }
								: { height: 0 }
					}
					transition={{ duration: 0.5, ease: "easeInOut" }}
				/>

				{/* Arrow head */}
				<motion.div
					className={`absolute ${isHorizontal ? "right-0 top-1/2 -translate-y-1/2" : "bottom-0 left-1/2 -translate-x-1/2"}`}
					animate={{
						opacity: isActive ? 1 : 0.5,
						scale: isActive ? 1.2 : 1,
					}}
					transition={{ duration: 0.3 }}
				>
					{isHorizontal ? (
						<svg
							className="w-3 h-3 text-stone-400 dark:text-stone-300"
							fill="currentColor"
							viewBox="0 0 20 20"
							aria-hidden="true"
						>
							<path
								fillRule="evenodd"
								d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
								clipRule="evenodd"
							/>
						</svg>
					) : (
						<svg
							className="w-3 h-3 text-stone-400 dark:text-stone-300"
							fill="currentColor"
							viewBox="0 0 20 20"
							aria-hidden="true"
						>
							<path
								fillRule="evenodd"
								d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z"
								clipRule="evenodd"
							/>
						</svg>
					)}
				</motion.div>
			</motion.div>
		</div>
	)
}
