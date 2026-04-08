/**
 * Navigation data structure for H·AI·K·U website
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
		title: "Methodology",
		href: "/methodology/",
		description: "How H·AI·K·U works",
	},
	{
		title: "How It Works",
		href: "/how-it-works/",
		description: "Technical deep-dive",
	},
	{
		title: "Studios",
		href: "/studios/",
		description: "Domain profiles",
	},
	{
		title: "Docs",
		href: "/docs/",
		description: "Developer documentation",
	},
	{
		title: "Paper",
		href: "/paper/",
		description: "Full methodology paper",
	},
	{
		title: "Browse",
		href: "/browse/",
		description: "View H·AI·K·U portfolios",
	},
	{
		title: "Blog",
		href: "/blog/",
		description: "Updates and insights",
	},
]

/**
 * Main navigation categories with mega menu content
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
						description: "Install the Claude plugin",
					},
					{
						title: "Getting Started",
						href: "/docs/getting-started/",
						description: "Your first H\u00b7AI\u00b7K\u00b7U session",
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
			title: "New to H\u00b7AI\u00b7K\u00b7U?",
			description:
				"Start with the methodology overview to understand how H\u00b7AI\u00b7K\u00b7U works, then install the plugin to try it.",
			href: "/methodology/",
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
						title: "Studios",
						href: "/docs/studios/",
						description: "Lifecycle templates for different work types",
					},
					{
						title: "Stages",
						href: "/docs/stages/",
						description: "Stage-based progression model",
					},
					{
						title: "CLI Reference",
						href: "/docs/cli-reference/",
						description: "Complete command reference",
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
						description: "Day-to-day H\u00b7AI\u00b7K\u00b7U usage",
					},
					{
						title: "For Designers",
						href: "/docs/guide-designer/",
						description: "UX/UI collaboration with H\u00b7AI\u00b7K\u00b7U",
					},
					{
						title: "For Tech Leads",
						href: "/docs/guide-tech-lead/",
						description: "Leading a H\u00b7AI\u00b7K\u00b7U team",
					},
					{
						title: "For Managers",
						href: "/docs/guide-manager/",
						description: "Tracking progress and metrics",
					},
					{
						title: "For AI Agents",
						href: "/docs/guide-ai/",
						description: "Autonomous operation with H\u00b7AI\u00b7K\u00b7U",
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
						description: "H\u00b7AI\u00b7K\u00b7U terminology and definitions",
					},
					{
						title: "Changelog",
						href: "/changelog/",
						description: "What's new in H\u00b7AI\u00b7K\u00b7U",
					},
				],
			},
			{
				title: "Community",
				items: [
					{
						title: "Community",
						href: "/docs/community/",
						description: "Join the H\u00b7AI\u00b7K\u00b7U community",
					},
					{
						title: "Fork Deployment Guide",
						href: "/docs/fork-deployment/",
						description: "Deploy your own fork of H\u00b7AI\u00b7K\u00b7U",
					},
					{
						title: "GitHub",
						href: "https://github.com/gigsmart/haiku-method",
						description: "Source code and discussions",
					},
					{
						title: "H·AI·K·U Method",
						href: "https://haikumethod.ai",
						description: "Parent methodology for human-AI collaboration",
					},
				],
			},
		],
	},
]

/**
 * Footer navigation - restructured for methodology-first experience
 */
export const footerNavigation = {
	framework: {
		title: "Framework",
		items: [
			{ title: "Methodology", href: "/methodology/" },
			{ title: "How It Works", href: "/how-it-works/" },
			{ title: "Elaboration", href: "/methodology/elaboration/" },
			{ title: "Execution", href: "/methodology/execution/" },
			{ title: "Operation", href: "/methodology/operation/" },
			{ title: "Reflection", href: "/methodology/reflection/" },
			{ title: "Studios", href: "/studios/" },
		],
	},
	developers: {
		title: "Developers",
		items: [
			{ title: "Installation", href: "/docs/installation/" },
			{ title: "Getting Started", href: "/docs/getting-started/" },
			{ title: "Documentation", href: "/docs/" },
			{ title: "Changelog", href: "/changelog/" },
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
			{ title: "Glossary", href: "/glossary/" },
			{
				title: "GitHub",
				href: "https://github.com/gigsmart/haiku-method",
			},
			{ title: "H·AI·K·U Method", href: "https://haikumethod.ai" },
			{
				title: "Portfolio",
				href: `/browse/github.com/${process.env.NEXT_PUBLIC_REPO_SLUG ?? "gigsmart/haiku-method"}/`,
			},
		],
	},
	legal: {
		title: "Legal",
		items: [
			{ title: "Privacy Policy", href: "/docs/privacy/" },
			{ title: "Terms of Service", href: "/docs/terms/" },
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
		title: "Method",
		href: "/methodology/",
		icon: "book",
	},
	{
		title: "Docs",
		href: "/docs/",
		icon: "code",
	},
	{
		title: "Menu",
		href: "#menu",
		icon: "menu",
	},
]
