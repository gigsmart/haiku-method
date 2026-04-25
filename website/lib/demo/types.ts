export interface DemoMessage {
	role: "user" | "agent" | "system"
	label: string
	text: string
}

export interface DemoFile {
	path: string
	highlight: boolean
}

export interface DemoCard {
	stage: string
	name: string
	status: "" | "in-progress" | "completed"
}

export interface DemoStep {
	delay: number
	actions: DemoAction[]
}

export type DemoAction =
	| {
			type: "msg"
			role: "user" | "agent" | "system"
			label: string
			text: string
	  }
	| { type: "file"; path: string }
	| { type: "card"; stage: string; name: string; status: string }
	| { type: "updateCard"; stage: string; name: string; status: string }
	| { type: "activateStage"; stage: string }
	| { type: "typing" }
	| { type: "removeTyping" }
	| { type: "fastForward"; seconds: string }
	| { type: "removeFastForward" }
	| {
			type: "showReview"
			title: string
			intent: string
			criteria: string[]
			gateType?: string
	  }
	| { type: "showDesignReview"; title: string; intent: string }
	| { type: "animateCheckmarks" }
	| { type: "highlightApprove" }
	| { type: "hideReview" }
	| { type: "complete" }

export interface DemoConfig {
	title: string
	studio: string
	stages: string[]
	completionText: string
	steps: DemoStep[]
}
