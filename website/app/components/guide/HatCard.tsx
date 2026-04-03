"use client"

interface HatCardProps {
	icon: string
	name: string
	description: string
	borderColor: string
}

export function HatCard({
	icon,
	name,
	description,
	borderColor,
}: HatCardProps) {
	return (
		<div
			className={`flex-1 min-w-[155px] max-w-[220px] rounded-lg border border-stone-200 bg-white p-3.5 transition-transform hover:-translate-y-0.5 dark:border-stone-700 dark:bg-stone-900 ${borderColor}`}
		>
			<span className="mb-1 block text-xl">{icon}</span>
			<div className="mb-1 text-sm font-semibold text-stone-800 dark:text-stone-200">
				{name}
			</div>
			<p className="text-xs leading-snug text-stone-500 dark:text-stone-400">
				{description}
			</p>
		</div>
	)
}

export function HatArrow() {
	return (
		<span className="flex flex-shrink-0 items-center px-0.5 text-xl text-stone-400 dark:text-stone-600">
			&#x2192;
		</span>
	)
}
