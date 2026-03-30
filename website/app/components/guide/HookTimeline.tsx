"use client"

import { motion } from "framer-motion"

interface HookEvent {
	name: string
	desc: string
	type: "hook" | "action" | "session"
}

const events: HookEvent[] = [
	{ name: "SESSION START", desc: "A new AI session begins", type: "session" },
	{
		name: "\u2699\uFE0F inject-context",
		desc: "Loads all saved state: current hat, plan, blockers, scratchpad, iteration number",
		type: "hook",
	},
	{
		name: "AI reads files",
		desc: "Understanding the codebase",
		type: "action",
	},
	{
		name: "AI edits files",
		desc: "Writing implementation code",
		type: "action",
	},
	{
		name: "\u2699\uFE0F workflow-guard",
		desc: '"Are you wearing a hat? Stay in your lane."',
		type: "hook",
	},
	{
		name: "\u2699\uFE0F prompt-guard",
		desc: '"Is this safe content? No injections, no jailbreaks."',
		type: "hook",
	},
	{
		name: "AI runs a tool",
		desc: "Executing commands, running tests",
		type: "action",
	},
	{
		name: "\u2699\uFE0F context-monitor",
		desc: '"How much memory is left? Getting low? Save your work."',
		type: "hook",
	},
	{
		name: "AI spawns a subagent",
		desc: "Delegating to a specialist",
		type: "action",
	},
	{
		name: "\u2699\uFE0F subagent-hook",
		desc: '"Inject AI-DLC context into the new agent so it knows the plan."',
		type: "hook",
	},
	{
		name: "User tries /plan mode",
		desc: "Attempting to use a built-in command",
		type: "action",
	},
	{
		name: "\u2699\uFE0F redirect-plan-mode",
		desc: '"Use /elaborate instead -- that\'s the AI-DLC way."',
		type: "hook",
	},
	{
		name: "SESSION END",
		desc: "Context window full, or work complete",
		type: "session",
	},
	{
		name: "\u2699\uFE0F enforce-iteration",
		desc: '"Work remains! Call /execute to continue." -- Ensures nothing falls through the cracks.',
		type: "hook",
	},
]

export function HookTimeline() {
	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-40px" }}
			transition={{ duration: 0.5 }}
			className="relative my-8 pl-10"
		>
			{/* Vertical line */}
			<div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />

			{events.map((event) => (
				<div key={event.name} className="relative py-3 pl-5">
					{/* Dot */}
					<span
						className={`absolute -left-[0.8rem] top-[1.1rem] block h-2.5 w-2.5 rounded-full border-2 border-white dark:border-gray-950 ${
							event.type === "hook"
								? "bg-amber-400 shadow-[0_0_8px_rgba(240,180,41,0.3)]"
								: event.type === "session"
									? "h-3.5 w-3.5 -left-[0.95rem] bg-blue-500"
									: "bg-gray-400 dark:bg-gray-600"
						}`}
					/>
					<div
						className={`text-sm font-semibold ${
							event.type === "hook"
								? "text-amber-500"
								: event.type === "session"
									? "text-blue-500"
									: "text-gray-700 dark:text-gray-300"
						}`}
					>
						{event.name}
					</div>
					<div className="text-xs text-gray-500 dark:text-gray-400">
						{event.desc}
					</div>
				</div>
			))}
		</motion.div>
	)
}
