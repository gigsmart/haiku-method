export interface IntentGit {
  change_strategy: string;
  auto_merge: boolean;
  auto_squash: boolean;
}

export interface IntentFrontmatter {
  workflow: string;
  git: IntentGit;
  announcements: string[];
  passes?: string[];
  active_pass?: string;
  iterates_on?: string;
  created: string;
  status: string;
  epic?: string;
}

export interface UnitFrontmatter {
  status: string;
  last_updated: string;
  depends_on: string[];
  branch: string;
  discipline: string;
  pass?: string;
  workflow?: string;
  ticket?: string;
  wireframe?: string;
  design_ref?: string;
  deployment?: Record<string, unknown>;
  monitoring?: Record<string, unknown>;
  operations?: Record<string, unknown>;
}

export interface DiscoveryFrontmatter {
  intent: string;
  created: string;
  status: string;
}

export interface Section {
  heading: string;
  level: number;
  content: string;
  subsections: Section[];
}

export interface CriterionItem {
  text: string;
  checked: boolean;
}

export interface ParsedIntent {
  slug: string;
  frontmatter: IntentFrontmatter;
  title: string;
  sections: Section[];
  rawContent: string;
}

export interface ParsedUnit {
  slug: string;
  number: number;
  frontmatter: UnitFrontmatter;
  title: string;
  sections: Section[];
  rawContent: string;
}

export interface ParsedDiscovery {
  frontmatter: DiscoveryFrontmatter;
  title: string;
  body: string;
}

export interface DAGNode {
  id: string;
  status: string;
}

export interface DAGEdge {
  from: string;
  to: string;
}

export interface DAGGraph {
  nodes: DAGNode[];
  edges: DAGEdge[];
  adjacency: Map<string, string[]>;
}
