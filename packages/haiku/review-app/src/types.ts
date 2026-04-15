/** Session types matching the server-side data model */

// Import shared types from @haiku/shared and re-export them
import type { CriterionItem, MockupInfo } from "@haiku/shared";
export type { CriterionItem, MockupInfo };

export interface ReviewAnnotations {
  screenshot?: string;
  pins?: Array<{ x: number; y: number; text: string }>;
  comments?: Array<{ selectedText: string; comment: string; paragraph: number }>;
}

export interface QuestionDef {
  question: string;
  header?: string;
  options: string[];
  multiSelect?: boolean;
}

export interface QuestionAnswer {
  question: string;
  selectedOptions: string[];
  otherText?: string;
}

export interface DesignArchetypeData {
  name: string;
  description: string;
  preview_html: string;
  default_parameters: Record<string, number>;
}

export interface DesignParameterData {
  name: string;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  default: number;
  labels: { low: string; high: string };
}

export interface Section {
  heading: string;
  level: number;
  content: string;
  subsections: Section[];
}

export interface UnitFrontmatter {
  status: string;
  discipline?: string;
  depends_on?: string[];
  wireframe?: string;
  stage?: string;
  [key: string]: unknown;
}

export interface ParsedUnit {
  slug: string;
  title: string;
  number: number;
  frontmatter: UnitFrontmatter;
  sections: Section[];
  rawContent?: string;
}

export interface IntentFrontmatter {
  status: string;
  workflow?: string;
  announcements?: string[];
  git?: {
    change_strategy: string;
    auto_merge: boolean;
    auto_squash: boolean;
  };
  [key: string]: unknown;
}

export interface ParsedIntent {
  slug: string;
  title: string;
  frontmatter: IntentFrontmatter;
  sections: Section[];
  rawContent?: string;
}

export interface StageStateInfo {
  stage: string;
  status: string;
  phase: string;
  started_at?: string;
  completed_at?: string | null;
  gate_entered_at?: string | null;
  gate_outcome?: string | null;
}

export interface KnowledgeFile {
  name: string;
  content: string;
}

export interface StageArtifact {
  stage: string;
  name: string;
  content: string;
}

export interface OutputArtifact {
  stage: string;
  name: string;
  type: "markdown" | "html" | "image";
  content?: string;
  relativePath?: string;
}

/** Snapshot of the prior review when the current review is a re-review
 *  following a changes_requested decision. Used to render a delta banner
 *  and "Changed since last review" badges on units that were edited. */
export interface PreviousReviewSnapshot {
  feedback: string;
  reviewedAt: string;
  intentRawContent: string;
  unitRawContents: Record<string, string>;
}

/** The API response from /api/session/:sessionId */
export interface SessionData {
  session_id: string;
  session_type: "review" | "question" | "design_direction";
  status: "pending" | "decided" | "answered" | "approved" | "changes_requested";

  // Review sessions
  intent_slug?: string;
  intent_dir?: string;
  review_type?: "intent" | "unit";
  gate_type?: string;
  target?: string;
  intent?: ParsedIntent;
  units?: ParsedUnit[];
  criteria?: CriterionItem[];
  mermaid?: string;
  intent_mockups?: MockupInfo[];
  unit_mockups?: Record<string, MockupInfo[]>;
  stage_states?: Record<string, StageStateInfo>;
  knowledge_files?: KnowledgeFile[];
  stage_artifacts?: StageArtifact[];
  output_artifacts?: OutputArtifact[];
  previous_review?: PreviousReviewSnapshot;

  // Question sessions
  title?: string;
  context?: string;
  questions?: QuestionDef[];
  image_urls?: string[];

  // Design direction sessions
  archetypes?: DesignArchetypeData[];
  parameters?: DesignParameterData[];

  // Results
  decision?: string;
  feedback?: string;
  annotations?: ReviewAnnotations;
  answers?: QuestionAnswer[];
  selection?: { archetype: string; parameters: Record<string, number> } | null;
}
