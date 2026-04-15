// Types
export type {
	CriterionItem,
	MockupInfo,
	ReviewAnnotations,
	QuestionDef,
	QuestionAnswer,
	DesignArchetypeData,
	DesignParameterData,
	Section,
	UnitFrontmatter,
	ParsedUnit,
	IntentFrontmatter,
	ParsedIntent,
	StageStateInfo,
	KnowledgeFile,
	StageArtifact,
	OutputArtifact,
	SessionData,
	ReviewDecision,
} from "./types"

// Transport contract
export type { ReviewTransport } from "./transport"
export { ReviewTransportProvider, useReviewTransport } from "./context"
export { useSession, type UseSessionResult } from "./hooks/useSession"
export { tryCloseTab } from "./hooks/tryCloseTab"

// Top-level
export { ReviewApp, type ReviewAppProps } from "./components/ReviewApp"

// Pages
export { ReviewPage } from "./components/ReviewPage"
export { QuestionPage } from "./components/QuestionPage"
export { DesignPicker } from "./components/DesignPicker"

// Building blocks
export { ReviewSidebar, type SidebarComment } from "./components/ReviewSidebar"
export { Tabs, type TabDef } from "./components/Tabs"
export { Card, SectionHeading } from "./components/Card"
export {
	AnnotationCanvas,
	type AnnotationPin,
} from "./components/AnnotationCanvas"
export {
	InlineComments,
	type InlineCommentEntry,
	type InlineComment,
	scrollToInlineComment,
} from "./components/InlineComments"
export { MermaidDiagram } from "./components/MermaidDiagram"
export { MermaidFlow } from "./components/MermaidFlow"
export { ThemeToggle } from "./components/ThemeToggle"
export { SubmitSuccess } from "./components/SubmitSuccess"

// Re-export the shared atoms so consumers can import from a single package.
export { StatusBadge, MarkdownViewer, CriteriaChecklist } from "@haiku/shared"
