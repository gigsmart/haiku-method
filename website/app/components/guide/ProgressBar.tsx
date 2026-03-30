"use client"

import { motion, useScroll, useSpring } from "framer-motion"

export function ProgressBar() {
	const { scrollYProgress } = useScroll()
	const scaleX = useSpring(scrollYProgress, {
		stiffness: 100,
		damping: 30,
		restDelta: 0.001,
	})

	return (
		<motion.div
			className="fixed top-0 left-0 right-0 z-[100] h-[3px] origin-left bg-gradient-to-r from-blue-500 via-amber-400 to-green-500"
			style={{ scaleX }}
		/>
	)
}
