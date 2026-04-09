// Shared H·AI·K·U types used by both the website and review-app

export interface HaikuIntent {
  slug: string;
  title: string;
  studio: string;
  studioStages: string[];
  activeStage: string;
  mode: string;
  stagesComplete: number;
  stagesTotal: number;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  composite: Array<{ studio: string; stages: string[] }> | null;
  follows: string | null;
  content?: string;
  raw: Record<string, unknown>;
  /** The git branch this intent lives on (populated when scanning haiku/* branches) */
  branch?: string;
  /** PR/MR URL if one exists for this intent's branch */
  prUrl?: string | null;
  /** PR/MR state: "open", "merged", "closed" */
  prStatus?: string | null;
  /** PR/MR number */
  prNumber?: number | null;
}

export interface HaikuUnit {
  name: string;
  stage: string;
  type: string;
  status: string;
  dependsOn: string[];
  bolt: number;
  hat: string;
  startedAt: string | null;
  completedAt: string | null;
  refs: string[];
  criteria: Array<{ text: string; checked: boolean }>;
  content: string;
  raw: Record<string, unknown>;
}

export interface HaikuStageState {
  name: string;
  status: "pending" | "active" | "complete";
  phase: string;
  startedAt: string | null;
  completedAt: string | null;
  gateOutcome: string | null;
  units: HaikuUnit[];
}

export interface HaikuAsset {
  path: string;
  name: string;
  rawUrl: string;
}

export interface HaikuIntentDetail extends HaikuIntent {
  stages: HaikuStageState[];
  knowledge: string[];
  operations: string[];
  reflection: string | null;
  content: string;
  assets: HaikuAsset[];
}

export interface CriterionItem {
  text: string;
  checked: boolean;
}

export interface MockupInfo {
  label: string;
  url: string;
}
