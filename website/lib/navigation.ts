/**
 * Navigation data structure for AI-DLC website
 */

export interface NavItem {
	title: string
	href: string
	description?: string
	icon?: string
}

export interface NavSection {
	title: string
	items: NavItem[]
}

export interface NavCategory {
	title: string
	href: string
	sections: NavSection[]
	featured?: {
		title: string
		description: string
		href: string
		image?: string
	}
}

/**
 * Primary navigation items (top-level links without mega menu)
 */
export const primaryNavItems: NavItem[] = [
	{
		title: "How It Works",
		href: "/",
		description: "The story-driven lifecycle guide",
	},
	{
		title: "Install",
		href: "/docs/installation/",
		description: "Get AI-DLC running in your project",
	},
	{
		title: "Docs",
		href: "/docs/",
		description: "Reference documentation",
	},
	{
		title: "Paper",
		href: "/paper/",
		description: "Academic deep dive into the methodology",
	},
	{
		title: "Blog",
		href: "/blog/",
		description: "Updates and insights",
	},
	{
		title: "Changelog",
		href: "/changelog/",
		description: "What's new in AI-DLC",
	},
]

/**
 * Main navigation categories with mega menu content
 *
 * The home page covers "understanding" so the mega menu focuses on "doing".
 */
export const navigation: NavCategory[] = [
	{
		title: "Get Started",
		href: "/docs/installation/",
		sections: [
			{
				title: "Get Started",
				items: [
					{
						title: "Installation",
						href: "/docs/installation/",
						description: "Install the Claude Code plugin",
					},
					{
						title: "Quick Start",
						href: "/docs/quick-start/",
						description: "Your first AI-DLC session",
					},
					{
						title: "First Intent Checklist",
						href: "/docs/checklist-first-intent/",
						description: "Checklist for your first intent",
					},
				],
			},
		],
		featured: {
			title: "New to AI-DLC?",
			description:
				"Start with the home page guide to understand the methodology, then install the plugin to try it.",
			href: "/",
		},
	},
	{
		title: "Reference",
		href: "/docs/",
		sections: [
			{
				title: "Reference",
				items: [
					{
						title: "Docs Index",
						href: "/docs/",
						description: "All documentation in one place",
					},
					{
						title: "Hats",
						href: "/docs/hats/",
						description: "Role-based focus for every phase",
					},
					{
						title: "Workflows",
						href: "/docs/workflows/",
						description: "How hats flow in different scenarios",
					},
					{
						title: "Providers",
						href: "/docs/providers/",
						description: "Ticketing, design, spec, and comms integrations",
					},
					{
						title: "Operations",
						href: "/docs/operations-guide/",
						description: "Post-build operations and deployment",
					},
				],
			},
		],
	},
	{
		title: "Guides",
		href: "/docs/guide-developer/",
		sections: [
			{
				title: "Role Guides",
				items: [
					{
						title: "For Developers",
						href: "/docs/guide-developer/",
						description: "Day-to-day AI-DLC usage",
					},
					{
						title: "For Designers",
						href: "/docs/guide-designer/",
						description: "UX/UI collaboration with AI-DLC",
					},
					{
						title: "For Tech Leads",
						href: "/docs/guide-tech-lead/",
						description: "Leading an AI-DLC team",
					},
					{
						title: "For Managers",
						href: "/docs/guide-manager/",
						description: "Tracking progress and metrics",
					},
					{
						title: "For AI Agents",
						href: "/docs/guide-ai/",
						description: "Autonomous operation with AI-DLC",
					},
				],
			},
		],
	},
	{
		title: "Resources",
		href: "/paper/",
		sections: [
			{
				title: "Resources",
				items: [
					{
						title: "The Paper",
						href: "/paper/",
						description: "Full methodology with research and production lessons",
					},
					{
						title: "Blog",
						href: "/blog/",
						description: "Updates and insights",
					},
					{
						title: "Templates",
						href: "/templates/",
						description: "Intent, unit, and settings templates",
					},
					{
						title: "Glossary",
						href: "/glossary/",
						description: "AI-DLC terminology and definitions",
					},
					{
						title: "Changelog",
						href: "/changelog/",
						description: "What's new in AI-DLC",
					},
				],
			},
			{
				title: "Community",
				items: [
					{
						title: "Community",
						href: "/docs/community/",
						description: "Join the AI-DLC community",
					},
					{
						title: "GitHub",
						href: "https://github.com/thebushidocollective/ai-dlc",
						description: "Source code and discussions",
					},
					{
						title: "H•AI•K•U Method",
						href: "https://haikumethod.ai",
						description: "Parent methodology for human-AI collaboration",
					},
				],
			},
		],
	},
]

/**
 * Footer navigation - simplified sitemap structure matching mega menu sections
 */
export const footerNavigation = {
	getStarted: {
		title: "Get Started",
		items: [
			{ title: "Installation", href: "/docs/installation/" },
			{ title: "Quick Start", href: "/docs/quick-start/" },
			{ title: "First Intent Checklist", href: "/docs/checklist-first-intent/" },
			{ title: "Feature Example", href: "/docs/example-feature/" },
			{ title: "Bugfix Example", href: "/docs/example-bugfix/" },
		],
	},
	reference: {
		title: "Reference",
		items: [
			{ title: "Documentation", href: "/docs/" },
			{ title: "Hats", href: "/docs/hats/" },
			{ title: "Workflows", href: "/docs/workflows/" },
			{ title: "Key Concepts", href: "/docs/concepts/" },
			{ title: "Providers", href: "/docs/providers/" },
			{ title: "Operations", href: "/docs/operations-guide/" },
		],
	},
	guides: {
		title: "Guides",
		items: [
			{ title: "For Developers", href: "/docs/guide-developer/" },
			{ title: "For Designers", href: "/docs/guide-designer/" },
			{ title: "For Tech Leads", href: "/docs/guide-tech-lead/" },
			{ title: "For Managers", href: "/docs/guide-manager/" },
			{ title: "For AI Agents", href: "/docs/guide-ai/" },
		],
	},
	resources: {
		title: "Resources",
		items: [
			{ title: "The Paper", href: "/paper/" },
			{ title: "Blog", href: "/blog/" },
			{ title: "Changelog", href: "/changelog/" },
			{ title: "Glossary", href: "/glossary/" },
			{
				title: "GitHub",
				href: "https://github.com/thebushidocollective/ai-dlc",
			},
			{ title: "H•AI•K•U Method", href: "https://haikumethod.ai" },
		],
	},
}

/**
 * Mobile bottom navigation items
 */
export const bottomNavItems = [
	{
		title: "Home",
		href: "/",
		icon: "home",
	},
	{
		title: "Docs",
		href: "/docs/",
		icon: "book",
	},
	{
		title: "Install",
		href: "/docs/installation/",
		icon: "download",
	},
	{
		title: "Menu",
		href: "#menu",
		icon: "menu",
	},
]
