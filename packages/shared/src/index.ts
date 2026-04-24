// Types

// Frontmatter YAML utilities (duplicate-key recovery)
export {
  dedupeFrontmatterKeys,
  dedupeTopLevelYamlKeys,
  isDuplicateKeyError,
} from "./frontmatter";

// Components (re-exported for convenience — also available via @haiku/shared/components)
export {
	CriteriaChecklist,
	FileTree,
	MarkdownViewer,
	ProgressBar,
	StatusBadge,
} from "./components/index"

// Formatting utilities
export { formatDate, formatDuration, titleCase } from "./format"
export type {
	CriterionItem,
	HaikuArtifact,
	HaikuAsset,
	HaikuIntent,
	HaikuIntentDetail,
	HaikuKnowledgeFile,
	HaikuStageState,
	HaikuUnit,
	MockupInfo,
} from "./types"
