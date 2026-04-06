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
  type?: string;
  depends_on?: string[];
  wireframe?: string;
  [key: string]: unknown;
}

export interface ParsedUnit {
  slug: string;
  title: string;
  number: number;
  frontmatter: UnitFrontmatter;
  sections: Section[];
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
  target?: string;
  intent?: ParsedIntent;
  units?: ParsedUnit[];
  criteria?: CriterionItem[];
  mermaid?: string;
  intent_mockups?: MockupInfo[];
  unit_mockups?: Record<string, MockupInfo[]>;

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
