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
 * Main navigation categories with mega menu content
 */
export const navigation: NavCategory[] = [
	{
		title: "Overview",
		href: "/",
		sections: [
			{
				title: "Get Started",
				items: [
					{
						title: "Home",
						href: "/",
						description: "Introduction to AI-DLC",
					},
					{
						title: "The Paper",
						href: "/paper/",
						description: "Read the complete AI-DLC methodology",
					},
					{
						title: "Big Picture",
						href: "/big-picture/",
						description: "Interactive visualization of the methodology",
					},
					{
						title: "Start Here",
						href: "/start-here/",
						description: "Guided onboarding for new users",
					},
				],
			},
			{
				title: "Reference",
				items: [
					{
						title: "Glossary",
						href: "/glossary/",
						description: "AI-DLC terminology and definitions",
					},
					{
						title: "About AI-DLC",
						href: "/about/",
						description: "The story behind the methodology",
					},
					{
						title: "Blog",
						href: "/blog/",
						description: "Updates and insights",
					},
				],
			},
		],
		featured: {
			title: "New to AI-DLC?",
			description:
				"Read the full paper or start with the Big Picture diagram to understand how all the pieces fit together.",
			href: "/paper/",
		},
	},
	{
		title: "Learn",
		href: "/docs/",
		sections: [
			{
				title: "Core Concepts",
				items: [
					{
						title: "Introduction",
						href: "/docs/",
						description: "What is AI-DLC and why it matters",
					},
					{
						title: "Hats",
						href: "/docs/hats/",
						description: "Role-based focus for every phase of development",
					},
					{
						title: "Key Concepts",
						href: "/docs/concepts/",
						description: "Units, Intents, Modes, and more",
					},
					{
						title: "Workflows",
						href: "/docs/workflows/",
						description: "How hats flow in different scenarios",
					},
				],
			},
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
				],
			},
		],
		featured: {
			title: "Quick Start",
			description:
				"Get up and running with AI-DLC in under 10 minutes with our guided tutorial.",
			href: "/docs/quick-start/",
		},
	},
	{
		title: "Implement",
		href: "/docs/installation/",
		sections: [
			{
				title: "Setup",
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
						title: "Adoption Roadmap",
						href: "/docs/adoption-roadmap/",
						description: "Rolling out AI-DLC to your team",
					},
				],
			},
			{
				title: "Examples",
				items: [
					{
						title: "Feature Example",
						href: "/docs/example-feature/",
						description: "Building a new feature end-to-end",
					},
					{
						title: "Bugfix Example",
						href: "/docs/example-bugfix/",
						description: "Fixing a bug with AI-DLC",
					},
				],
			},
			{
				title: "Checklists",
				items: [
					{
						title: "First Intent",
						href: "/docs/checklist-first-intent/",
						description: "Checklist for your first unit",
					},
					{
						title: "Team Onboarding",
						href: "/docs/checklist-team-onboarding/",
						description: "Onboard your team to AI-DLC",
					},
				],
			},
		],
	},
	{
		title: "Tools",
		href: "/tools/mode-selector/",
		sections: [
			{
				title: "Interactive Tools",
				items: [
					{
						title: "Mode Selector",
						href: "/tools/mode-selector/",
						description: "Find the right mode for your task",
					},
					{
						title: "Workflow Visualizer",
						href: "/workflows/",
						description: "See hat transitions in action",
					},
					{
						title: "Big Picture Diagram",
						href: "/big-picture/",
						description: "Interactive methodology overview",
					},
				],
			},
			{
				title: "Templates",
				items: [
					{
						title: "Intent Template",
						href: "/templates/intent-template.md",
						description: "Template for defining intents",
					},
					{
						title: "Unit Template",
						href: "/templates/unit-template.md",
						description: "Template for unit documentation",
					},
					{
						title: "Settings Template",
						href: "/templates/settings-template.yml",
						description: "Claude Code settings for AI-DLC",
					},
				],
			},
			{
				title: "Assessment",
				items: [
					{
						title: "Readiness Assessment",
						href: "/docs/assessment/",
						description: "Is your team ready for AI-DLC?",
					},
				],
			},
		],
		featured: {
			title: "Mode Selector Tool",
			description:
				"Answer a few questions to find the right AI-DLC mode for your current task.",
			href: "/tools/mode-selector/",
		},
	},
	{
		title: "Resources",
		href: "/docs/community/",
		sections: [
			{
				title: "Community",
				items: [
					{
						title: "Community",
						href: "/docs/community/",
						description: "Join the AI-DLC community",
					},
					{
						title: "Changelog",
						href: "/changelog/",
						description: "What's new in AI-DLC",
					},
					{
						title: "GitHub",
						href: "https://github.com/thebushidocollective/ai-dlc",
						description: "Source code and discussions",
					},
				],
			},
			{
				title: "Related Projects",
				items: [
					{
						title: "HAIKU Method",
						href: "https://haikumethod.ai",
						description: "Parent methodology for human-AI collaboration",
					},
					{
						title: "Han Plugin Marketplace",
						href: "https://han.guru",
						description: "Claude Code plugin ecosystem",
					},
					{
						title: "Anthropic",
						href: "https://anthropic.com",
						description: "Creators of Claude",
					},
				],
			},
		],
	},
]

/**
 * Footer navigation - simplified sitemap structure
 */
export const footerNavigation = {
	learn: {
		title: "Learn",
		items: [
			{ title: "Introduction", href: "/docs/" },
			{ title: "Hats", href: "/docs/hats/" },
			{ title: "Key Concepts", href: "/docs/concepts/" },
			{ title: "Workflows", href: "/docs/workflows/" },
			{ title: "Role Guides", href: "/docs/guide-developer/" },
		],
	},
	implement: {
		title: "Implement",
		items: [
			{ title: "Installation", href: "/docs/installation/" },
			{ title: "Quick Start", href: "/docs/quick-start/" },
			{ title: "Feature Example", href: "/docs/example-feature/" },
			{ title: "Bugfix Example", href: "/docs/example-bugfix/" },
			{ title: "Adoption Roadmap", href: "/docs/adoption-roadmap/" },
		],
	},
	tools: {
		title: "Tools",
		items: [
			{ title: "Mode Selector", href: "/tools/mode-selector/" },
			{ title: "Workflow Visualizer", href: "/workflows/" },
			{ title: "Big Picture", href: "/big-picture/" },
			{ title: "Templates", href: "/templates/" },
		],
	},
	resources: {
		title: "Resources",
		items: [
			{ title: "Community", href: "/docs/community/" },
			{ title: "Blog", href: "/blog/" },
			{ title: "Changelog", href: "/changelog/" },
			{
				title: "GitHub",
				href: "https://github.com/thebushidocollective/ai-dlc",
			},
			{ title: "HAIKU Method", href: "https://haikumethod.ai" },
			{ title: "Han Plugins", href: "https://han.guru" },
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
		title: "Learn",
		href: "/docs/",
		icon: "book",
	},
	{
		title: "Tools",
		href: "/tools/mode-selector/",
		icon: "tool",
	},
	{
		title: "Menu",
		href: "#menu",
		icon: "menu",
	},
]
