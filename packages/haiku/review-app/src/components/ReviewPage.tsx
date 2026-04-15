import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionData, ReviewAnnotations, ParsedUnit, MockupInfo, Section, OutputArtifact, PreviousReviewSnapshot } from "../types";
import { StatusBadge, MarkdownViewer, CriteriaChecklist } from "@haiku/shared";
import { Tabs, type TabDef } from "./Tabs";
import { Card, SectionHeading } from "./Card";
import { AnnotationCanvas, type AnnotationPin } from "./AnnotationCanvas";
import { InlineComments, type InlineCommentEntry, scrollToInlineComment } from "./InlineComments";
import { ReviewSidebar, type SidebarComment } from "./ReviewSidebar";
import { MermaidDiagram } from "./MermaidDiagram";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkHtml from "remark-html";

interface Props {
  session: SessionData;
  sessionId: string;
  wsRef?: React.RefObject<WebSocket | null>;
}

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif"];
function isImageUrl(url: string): boolean {
  const ext = url.substring(url.lastIndexOf(".")).toLowerCase();
  return IMAGE_EXTS.includes(ext);
}

function findSection(sections: Section[], ...names: string[]): string {
  for (const name of names) {
    const section = sections.find(
      (s) => s.heading.toLowerCase() === name.toLowerCase(),
    );
    if (section?.content) return section.content;
  }
  return "";
}

function findSectionWithSubs(sections: Section[], ...names: string[]): Section | undefined {
  for (const name of names) {
    const section = sections.find(
      (s) => s.heading.toLowerCase() === name.toLowerCase(),
    );
    if (section) return section;
  }
  return undefined;
}

/** Get the preamble (intro text before first ## heading) from sections */
function getPreamble(sections: Section[]): string {
  const preamble = sections.find((s) => s.heading === "_preamble");
  return preamble?.content ?? "";
}

interface ReviewDraft {
  generalText: string;
  generalComments: SidebarComment[];
}

const DRAFT_STORAGE_KEY = (sessionId: string) => `haiku-review-draft:${sessionId}`;

function loadDraft(sessionId: string): ReviewDraft {
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY(sessionId));
    if (!raw) return { generalText: "", generalComments: [] };
    const parsed = JSON.parse(raw) as Partial<ReviewDraft>;
    return {
      generalText: typeof parsed.generalText === "string" ? parsed.generalText : "",
      generalComments: Array.isArray(parsed.generalComments) ? parsed.generalComments : [],
    };
  } catch {
    return { generalText: "", generalComments: [] };
  }
}

function saveDraft(sessionId: string, draft: ReviewDraft): void {
  try {
    // Empty draft — remove the key so we don't leave stale entries behind.
    if (!draft.generalText && draft.generalComments.length === 0) {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY(sessionId));
      return;
    }
    window.localStorage.setItem(DRAFT_STORAGE_KEY(sessionId), JSON.stringify(draft));
  } catch {
    /* localStorage full / disabled — drop silently */
  }
}

export function ReviewPage({ session, sessionId, wsRef }: Props) {
  // Hydrate persisted draft on mount so a refresh doesn't nuke in-progress
  // comments. Inline highlights and pins are DOM-bound and not restored here.
  const [initialDraft] = useState<ReviewDraft>(() => loadDraft(sessionId));

  // Lifted comment state: all inline comments and pins across tabs
  const [allInlineComments, setAllInlineComments] = useState<InlineCommentEntry[]>([]);
  const [allPins, setAllPins] = useState<AnnotationPin[]>([]);

  // Refs for getAnnotations (keep in sync)
  const inlineCommentsRef = useRef<InlineCommentEntry[]>([]);
  inlineCommentsRef.current = allInlineComments;
  const pinsRef = useRef<AnnotationPin[]>([]);
  pinsRef.current = allPins;

  const getAnnotations = useCallback((): ReviewAnnotations | undefined => {
    const annotations: ReviewAnnotations = {};
    let hasAny = false;

    if (pinsRef.current.length > 0) {
      annotations.pins = pinsRef.current.map((p) => ({
        x: Math.round(p.x * 100) / 100,
        y: Math.round(p.y * 100) / 100,
        text: p.text,
      }));
      hasAny = true;
    }

    if (inlineCommentsRef.current.length > 0) {
      annotations.comments = inlineCommentsRef.current.map((c) => ({
        selectedText: c.selectedText,
        comment: c.comment,
        paragraph: c.paragraph,
      }));
      hasAny = true;
    }

    return hasAny ? annotations : undefined;
  }, []);

  // General comments (added via sidebar)
  const [generalComments, setGeneralComments] = useState<SidebarComment[]>(initialDraft.generalComments);
  const [generalText, setGeneralText] = useState<string>(initialDraft.generalText);
  let generalCounter = useRef(0);

  // Persist draft (general text + general comments) to localStorage so a
  // refresh doesn't lose typed-but-not-submitted feedback. Debounced to avoid
  // thrashing on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      saveDraft(sessionId, { generalText, generalComments });
    }, 250);
    return () => clearTimeout(t);
  }, [sessionId, generalText, generalComments]);

  const clearDraft = useCallback(() => {
    setGeneralText("");
    setGeneralComments([]);
    try {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY(sessionId));
    } catch {
      /* ignore */
    }
  }, [sessionId]);

  const handleAddGeneral = useCallback((comment: string) => {
    generalCounter.current++;
    setGeneralComments((prev) => [
      ...prev,
      { type: "general", text: "", comment, id: `general-${generalCounter.current}-${Date.now()}` },
    ]);
  }, []);

  // Build sidebar comments from all sources
  const sidebarComments: SidebarComment[] = [
    ...allInlineComments.map((c) => ({
      type: "inline" as const,
      text: c.selectedText,
      comment: c.comment,
      id: c.id,
    })),
    ...allPins.map((p) => ({
      type: "pin" as const,
      text: `Pin at (${Math.round(p.x)}%, ${Math.round(p.y)}%)`,
      comment: p.text,
      id: p.id,
    })),
    ...generalComments,
  ];

  const handleDeleteComment = useCallback((id: string) => {
    // Try inline comments first
    const inlineMatch = inlineCommentsRef.current.find((c) => c.id === id);
    if (inlineMatch) {
      // Unwrap highlight
      if (inlineMatch.highlightEl?.parentNode) {
        const parent = inlineMatch.highlightEl.parentNode;
        while (inlineMatch.highlightEl.firstChild) {
          parent.insertBefore(inlineMatch.highlightEl.firstChild, inlineMatch.highlightEl);
        }
        parent.removeChild(inlineMatch.highlightEl);
        (parent as Element).normalize?.();
      }
      setAllInlineComments((prev) => prev.filter((c) => c.id !== id));
      return;
    }
    // Try pins
    if (pinsRef.current.find((p) => p.id === id)) {
      setAllPins((prev) => prev.filter((p) => p.id !== id));
      return;
    }
    // Try general comments
    setGeneralComments((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const handleEditComment = useCallback((id: string, newComment: string) => {
    // Try inline comments first
    const inlineMatch = inlineCommentsRef.current.find((c) => c.id === id);
    if (inlineMatch) {
      setAllInlineComments((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c;
          // Update the highlight element's aria-label too
          if (c.highlightEl) {
            c.highlightEl.setAttribute("aria-label", `Commented text: ${newComment || "(no comment)"}`);
          }
          return { ...c, comment: newComment };
        })
      );
      return;
    }
    // Try pins
    if (pinsRef.current.find((p) => p.id === id)) {
      setAllPins((prev) =>
        prev.map((p) => (p.id === id ? { ...p, text: newComment } : p))
      );
      return;
    }
    // Try general comments
    setGeneralComments((prev) =>
      prev.map((c) => (c.id === id ? { ...c, comment: newComment } : c))
    );
  }, []);

  const handleClearAll = useCallback(() => {
    // Unwrap all inline highlights
    for (const c of inlineCommentsRef.current) {
      if (c.highlightEl?.parentNode) {
        const parent = c.highlightEl.parentNode;
        while (c.highlightEl.firstChild) {
          parent.insertBefore(c.highlightEl.firstChild, c.highlightEl);
        }
        parent.removeChild(c.highlightEl);
        (parent as Element).normalize?.();
      }
    }
    setAllInlineComments([]);
    setAllPins([]);
    setGeneralComments([]);
    setGeneralText("");
  }, []);

  const handleScrollTo = useCallback((id: string) => {
    // Inline comment: scroll to highlight
    const inlineMatch = inlineCommentsRef.current.find((c) => c.id === id);
    if (inlineMatch) {
      scrollToInlineComment(id);
      return;
    }
    // Pin: scroll to pin element
    const pinEl = document.querySelector(`[data-pin-id="${id}"]`);
    if (pinEl) {
      pinEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  const handleInlineCommentsChange = useCallback((comments: InlineCommentEntry[]) => {
    setAllInlineComments(comments);
  }, []);

  const handlePinsChange = useCallback((pins: AnnotationPin[]) => {
    setAllPins(pins);
  }, []);

  const commonProps = {
    session,
    sessionId,
    getAnnotations,
    wsRef,
    onInlineCommentsChange: handleInlineCommentsChange,
    onPinsChange: handlePinsChange,
  };

  return (
    <div className="flex gap-6">
      {/* Main content — grows to fill available space */}
      <div className="flex-1 min-w-0">
        {session.previous_review && (
          <RereviewBanner snapshot={session.previous_review} />
        )}
        {session.review_type === "unit" && session.target ? (
          <UnitReview {...commonProps} />
        ) : (
          <IntentReview {...commonProps} />
        )}
      </div>
      {/* Sticky review sidebar */}
      <ReviewSidebar
        sessionId={sessionId}
        gateType={session.gate_type}
        comments={sidebarComments}
        getAnnotations={getAnnotations}
        wsRef={wsRef}
        onDelete={handleDeleteComment}
        onEdit={handleEditComment}
        onClearAll={handleClearAll}
        onScrollTo={handleScrollTo}
        onAddGeneral={handleAddGeneral}
        generalText={generalText}
        onGeneralTextChange={setGeneralText}
        onClearDraft={clearDraft}
      />
    </div>
  );
}

// --- Intent Review ---

interface SubReviewProps {
  session: SessionData;
  sessionId: string;
  getAnnotations: () => ReviewAnnotations | undefined;
  wsRef?: React.RefObject<WebSocket | null>;
  onInlineCommentsChange: (comments: InlineCommentEntry[]) => void;
  onPinsChange: (pins: AnnotationPin[]) => void;
}

function IntentReview({
  session,
  onInlineCommentsChange,
  onPinsChange,
}: SubReviewProps) {
  const intent = session.intent ?? ({ slug: "", title: "", frontmatter: {}, sections: [], rawContent: "" } as unknown as NonNullable<SessionData["intent"]>);
  const units = session.units ?? [];
  const criteria = session.criteria ?? [];
  const mermaid = session.mermaid ?? "";
  const intentMockups = session.intent_mockups ?? [];
  const unitMockupsMap = session.unit_mockups ?? {};
  const stageStates = session.stage_states ?? {};
  const knowledgeFiles = session.knowledge_files ?? [];
  const stageArtifacts = session.stage_artifacts ?? [];
  const outputArtifacts = session.output_artifacts ?? [];
  const [dagMaximized, setDagMaximized] = useState(false);

  if (!intent) {
    return <p className="text-stone-500">No intent data available.</p>;
  }

  const preamble = getPreamble(intent.sections);
  const problem = findSection(intent.sections, "Problem");
  const solution = findSection(intent.sections, "Solution");
  const goals = findSection(intent.sections, "Goals", "Objectives");
  const domainSection = findSectionWithSubs(intent.sections, "Domain Model");

  // Build overview markdown from whatever sections are available
  let overviewMarkdown = "";
  if (preamble) overviewMarkdown += `${preamble}\n\n`;
  if (problem) overviewMarkdown += `## Problem\n\n${problem}\n\n`;
  if (solution) overviewMarkdown += `## Solution\n\n${solution}\n\n`;
  if (goals) overviewMarkdown += `## Goals\n\n${goals}\n\n`;
  // If no structured sections, show all remaining sections
  if (!overviewMarkdown.trim()) {
    for (const section of intent.sections) {
      if (section.heading === "_preamble") continue;
      overviewMarkdown += `## ${section.heading}\n\n${section.content}\n\n`;
    }
  }

  const firstImageMockup = intentMockups.find((m) => isImageUrl(m.url));
  const remainingMockups = intentMockups.filter((m) => m !== firstImageMockup);


  // Group units by stage for display — use intent's stage order, not alphabetical
  const intentStageOrder = (intent.frontmatter.stages as string[]) ?? [];
  const stageStateKeys = Object.keys(stageStates);
  const stageNames = intentStageOrder.length > 0
    ? intentStageOrder.filter(s => stageStateKeys.includes(s))
    : stageStateKeys;
  const unitsByStage = new Map<string, ParsedUnit[]>();
  for (const unit of units) {
    const stage = unit.frontmatter.stage ?? "_root";
    const group = unitsByStage.get(stage) ?? [];
    group.push(unit);
    unitsByStage.set(stage, group);
  }

  const hasUnits = units.length > 0;
  const hasKnowledge = knowledgeFiles.length > 0 || stageArtifacts.length > 0;
  const hasOutputs = outputArtifacts.length > 0;
  const hasDomain = !!domainSection;

  const tabs: TabDef[] = [
    {
      id: "overview",
      label: "Overview",
      content: (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <StatusBadge label="Review type" status="intent" />
            <StatusBadge label="Status" status={intent.frontmatter.status} />
          </div>

          {overviewMarkdown && (
            <Card>
              <SectionHeading>Overview -- Comment on text</SectionHeading>
              <p className="text-xs text-stone-500 dark:text-stone-400 mb-3">Select text to add inline comments.</p>
              <InlineComments htmlContent={markdownToSimpleHtml(overviewMarkdown)} onCommentsChange={onInlineCommentsChange} />
            </Card>
          )}

          {criteria.length > 0 && (
            <Card>
              <SectionHeading>Success Criteria</SectionHeading>
              <CriteriaChecklist criteria={criteria} />
            </Card>
          )}

          {firstImageMockup && (
            <Card>
              <SectionHeading>Mockup -- Annotate</SectionHeading>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-stone-600 dark:text-stone-400">{firstImageMockup.label}</h4>
                <a
                  href={firstImageMockup.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-teal-600 dark:text-teal-400 hover:underline"
                >
                  Open in new tab &#8599;
                </a>
              </div>
              <AnnotationCanvas imageUrl={firstImageMockup.url} onPinsChange={onPinsChange} />
            </Card>
          )}

          {remainingMockups.length > 0 && (
            <Card>
              <SectionHeading>{firstImageMockup ? "Additional Mockups" : "Mockups"}</SectionHeading>
              <MockupEmbeds mockups={remainingMockups} />
            </Card>
          )}

          {stageNames.length > 0 && (
            <Card>
              <SectionHeading>Stage Progress</SectionHeading>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b-2 border-stone-200 dark:border-stone-700">
                      <th className="py-2 pr-3 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">Stage</th>
                      <th className="py-2 pr-3 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">Status</th>
                      <th className="py-2 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">Units</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stageNames.map((name) => {
                      const state = stageStates[name];
                      const stageUnits = unitsByStage.get(name) ?? [];
                      return (
                        <tr key={name} className="border-b border-stone-100 dark:border-stone-800">
                          <td className="py-3 pr-3 font-medium capitalize">{name}</td>
                          <td className="py-3 pr-3">
                            <StatusBadge label="Status" status={state?.status ?? "pending"} />
                          </td>
                          <td className="py-3 text-sm text-stone-500 dark:text-stone-400">{stageUnits.length}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      ),
    },
    {
      id: "units-dag",
      label: `Units (${units.length})`,
      content: (
        <>
          {mermaid && (
            <>
              <Card>
                <div className="flex items-center justify-between mb-3">
                  <SectionHeading>Dependency Graph</SectionHeading>
                  <button
                    type="button"
                    onClick={() => setDagMaximized(true)}
                    className="text-xs px-2 py-1 rounded border border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                  >
                    View Full Size
                  </button>
                </div>
                <MermaidDiagram definition={mermaid} />
              </Card>
              {dagMaximized && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
                  onClick={() => setDagMaximized(false)}
                >
                  <div
                    className="relative bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700 shadow-xl overflow-auto"
                    style={{ width: "90vw", height: "90vh" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="sticky top-0 z-10 flex items-center justify-between p-4 bg-white/90 dark:bg-stone-900/90 backdrop-blur border-b border-stone-200 dark:border-stone-700">
                      <span className="font-semibold text-stone-900 dark:text-stone-100">Dependency Graph</span>
                      <button
                        type="button"
                        onClick={() => setDagMaximized(false)}
                        className="text-sm px-3 py-1 rounded border border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                      >
                        Close
                      </button>
                    </div>
                    <div className="p-4">
                      <MermaidDiagram definition={mermaid} />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <Card>
            <SectionHeading>Units</SectionHeading>
            <UnitsTable units={units} unitMockups={unitMockupsMap} onInlineCommentsChange={onInlineCommentsChange} previousUnitContents={session.previous_review?.unitRawContents} />
          </Card>
        </>
      ),
    },
    {
      id: "knowledge",
      label: "Knowledge",
      disabled: knowledgeFiles.length === 0 && stageArtifacts.length === 0,
      content: (
        <>
          <div className="flex gap-6 items-start">
            {/* Sticky sidebar TOC */}
            <div className="hidden lg:block w-56 flex-shrink-0 self-start">
              <div className="sticky top-20">
                <nav className="text-sm space-y-1">
                  <h3 className="font-semibold text-stone-900 dark:text-stone-100 mb-2">Contents</h3>
                  {knowledgeFiles.map((kf, i) => (
                    <a key={`kf-${i}`} href={`#knowledge-${i}`}
                       className="block py-1 px-2 rounded text-stone-600 dark:text-stone-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors truncate">
                      {kf.name}
                    </a>
                  ))}
                  {stageArtifacts.map((sa, i) => (
                    <a key={`sa-${i}`} href={`#artifact-${i}`}
                       className="block py-1 px-2 rounded text-stone-600 dark:text-stone-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors truncate">
                      {sa.stage}: {sa.name}
                    </a>
                  ))}
                </nav>
              </div>
            </div>

            {/* Content area */}
            <div className="flex-1 min-w-0">
              {knowledgeFiles.map((kf, i) => (
                <Card key={`kf-${i}`} id={`knowledge-${i}`}>
                  <SectionHeading>{kf.name}</SectionHeading>
                  <InlineComments htmlContent={markdownToSimpleHtml(kf.content)} onCommentsChange={onInlineCommentsChange} />
                </Card>
              ))}
              {stageArtifacts.map((sa, i) => (
                <Card key={`sa-${i}`} id={`artifact-${i}`}>
                  <SectionHeading>{sa.stage}: {sa.name}</SectionHeading>
                  <InlineComments htmlContent={markdownToSimpleHtml(sa.content)} onCommentsChange={onInlineCommentsChange} />
                </Card>
              ))}
              {knowledgeFiles.length === 0 && stageArtifacts.length === 0 && (
                <Card>
                  <p className="text-stone-500 dark:text-stone-400 italic">No knowledge files or stage artifacts available.</p>
                </Card>
              )}
            </div>
          </div>
        </>
      ),
    },
    {
      id: "outputs",
      label: `Outputs (${outputArtifacts.length})`,
      disabled: !hasOutputs,
      content: (
        <OutputArtifactsTab artifacts={outputArtifacts} onInlineCommentsChange={onInlineCommentsChange} />
      ),
    },
    {
      id: "domain",
      label: "Domain Model",
      content: domainSection ? (
        <Card>
          <SectionHeading>Domain Model</SectionHeading>
          <MarkdownViewer id="domain-overview">{domainSection.content}</MarkdownViewer>
          {domainSection.subsections.map((sub, i) => (
            <div key={i} className="mt-6">
              <SectionHeading level={3}>{sub.heading}</SectionHeading>
              <MarkdownViewer id={`domain-sub-${i}`}>{sub.content}</MarkdownViewer>
            </div>
          ))}
        </Card>
      ) : (
        <Card>
          <SectionHeading>Domain Model</SectionHeading>
          <p className="text-stone-500 dark:text-stone-400 italic">No domain model defined.</p>
        </Card>
      ),
    },
  ].filter((tab) => {
    if (tab.id === "units-dag" && !hasUnits) return false;
    if (tab.id === "knowledge" && !hasKnowledge) return false;
    if (tab.id === "outputs" && !hasOutputs) return false;
    if (tab.id === "domain" && !hasDomain) return false;
    return true;
  });

  return <Tabs groupId="intent" tabs={tabs} />;
}

// --- Unit Review ---

function UnitReview({
  session,
  onInlineCommentsChange,
  onPinsChange,
}: SubReviewProps) {
  const intent = session.intent ?? ({ slug: "", title: "", frontmatter: {}, sections: [], rawContent: "" } as unknown as NonNullable<SessionData["intent"]>);
  const units = session.units ?? [];
  const criteria = session.criteria ?? [];
  const unitMockupsMap = session.unit_mockups ?? {};

  if (!intent) {
    return <p className="text-stone-500">No intent data available.</p>;
  }

  const targetUnit = units.find(
    (u) => u.slug === session.target || u.title === session.target,
  );

  if (!targetUnit) {
    return (
      <div className="p-8 text-center text-red-600 dark:text-red-400">
        <p className="text-lg font-semibold">Unit not found: {session.target}</p>
      </div>
    );
  }

  const wireframeMockups = unitMockupsMap[targetUnit.slug] ?? [];

  const unitPreamble = getPreamble(targetUnit.sections);
  const description = findSection(targetUnit.sections, "Description", "Overview");
  const techSpec = findSection(targetUnit.sections, "Technical Spec", "Technical Specification", "Implementation");
  const domainEntities = findSection(targetUnit.sections, "Domain Entities", "Entities");
  const completionCriteria = findSection(targetUnit.sections, "Completion Criteria", "Success Criteria", "Criteria");
  const risks = findSection(targetUnit.sections, "Risks", "Risk", "Known Risks (Accepted)");
  const boundaries = findSection(targetUnit.sections, "Boundaries", "Out of Scope", "NOT in scope");
  const notes = findSection(targetUnit.sections, "Notes", "Additional Notes");
  const findings = findSection(targetUnit.sections, "Findings Addressed", "Findings");

  let combinedSpec = "";
  if (unitPreamble) combinedSpec += `${unitPreamble}\n\n`;
  if (description) combinedSpec += `## Description\n\n${description}\n\n`;
  if (techSpec) combinedSpec += `## Technical Spec\n\n${techSpec}\n\n`;
  if (domainEntities) combinedSpec += `## Domain Entities\n\n${domainEntities}\n\n`;
  if (completionCriteria) combinedSpec += `## Completion Criteria\n\n${completionCriteria}\n\n`;
  if (findings) combinedSpec += `## Findings Addressed\n\n${findings}\n\n`;

  const hasWireframe = wireframeMockups.length > 0;
  const firstImageMockup = wireframeMockups.find((m) => isImageUrl(m.url));
  const remainingMockups = wireframeMockups.filter((m) => m !== firstImageMockup);

  const tabs: TabDef[] = [
    {
      id: "spec",
      label: "Spec",
      content: (
        <>
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="mb-4">
            <ol className="flex items-center gap-1 text-sm text-stone-500 dark:text-stone-400">
              <li>{intent.title}</li>
              <li className="flex items-center gap-1">
                <span aria-hidden="true" className="text-stone-400 dark:text-stone-600">/</span>
                <span className="text-stone-700 dark:text-stone-200 font-medium" aria-current="page">{targetUnit.title}</span>
              </li>
            </ol>
          </nav>

          <div className="flex flex-wrap items-center gap-2 mb-6">
            <StatusBadge label="Unit" status="unit" />
            <StatusBadge label="Status" status={targetUnit.frontmatter.status} />
            {targetUnit.frontmatter.discipline && (
              <StatusBadge label="Discipline" status={targetUnit.frontmatter.discipline} />
            )}
            {(() => {
              const prev = session.previous_review?.unitRawContents?.[targetUnit.slug];
              if (prev === undefined) return null;
              if (prev === targetUnit.rawContent) return null;
              return (
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-semibold uppercase tracking-wider">
                  Changed
                </span>
              );
            })()}
          </div>

          {combinedSpec ? (
            <Card>
              <SectionHeading>Spec -- Comment on text</SectionHeading>
              <p className="text-xs text-stone-500 dark:text-stone-400 mb-3">Select text to add inline comments.</p>
              <InlineComments htmlContent={markdownToSimpleHtml(combinedSpec)} onCommentsChange={onInlineCommentsChange} />
            </Card>
          ) : (
            <Card>
              <p className="text-stone-500 dark:text-stone-400 italic">No spec content available.</p>
            </Card>
          )}
        </>
      ),
    },
    {
      id: "wireframe",
      label: "Wireframe",
      disabled: !hasWireframe,
      content: hasWireframe ? (
        <>
          {firstImageMockup && (
            <Card>
              <SectionHeading>Wireframe -- Annotate</SectionHeading>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-stone-600 dark:text-stone-400">{firstImageMockup.label}</h4>
                <a
                  href={firstImageMockup.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-teal-600 dark:text-teal-400 hover:underline"
                >
                  Open in new tab &#8599;
                </a>
              </div>
              <AnnotationCanvas imageUrl={firstImageMockup.url} onPinsChange={onPinsChange} />
            </Card>
          )}
          {remainingMockups.length > 0 && (
            <Card>
              <SectionHeading>{firstImageMockup ? "Additional Wireframes" : "Wireframe"}</SectionHeading>
              <MockupEmbeds mockups={remainingMockups} />
            </Card>
          )}
        </>
      ) : (
        <Card>
          <SectionHeading>Wireframe</SectionHeading>
          <p className="text-stone-500 dark:text-stone-400 italic">No wireframe available for this unit.</p>
        </Card>
      ),
    },
    {
      id: "criteria",
      label: "Success Criteria",
      content: (
        <Card>
          <SectionHeading>Success Criteria</SectionHeading>
          <CriteriaChecklist criteria={criteria} />
        </Card>
      ),
    },
    {
      id: "risks",
      label: "Risks & Boundaries",
      content: (
        <>
          {risks && (
            <Card>
              <SectionHeading>Risks</SectionHeading>
              <MarkdownViewer id="unit-risks">{risks}</MarkdownViewer>
            </Card>
          )}
          {boundaries && (
            <Card>
              <SectionHeading>Boundaries (NOT in scope)</SectionHeading>
              <MarkdownViewer id="unit-boundaries">{boundaries}</MarkdownViewer>
            </Card>
          )}
          {notes && (
            <Card>
              <SectionHeading>Notes</SectionHeading>
              <MarkdownViewer id="unit-notes">{notes}</MarkdownViewer>
            </Card>
          )}
          {!risks && !boundaries && !notes && (
            <Card>
              <p className="text-stone-500 dark:text-stone-400 italic">No risks or boundaries documented for this unit.</p>
            </Card>
          )}
        </>
      ),
    },
  ];

  return <Tabs groupId="unit" tabs={tabs} />;
}

// --- Helper components ---

function OutputArtifactsTab({ artifacts, onInlineCommentsChange }: { artifacts: OutputArtifact[]; onInlineCommentsChange: (comments: InlineCommentEntry[]) => void }) {
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  if (artifacts.length === 0) {
    return (
      <Card>
        <p className="text-stone-500 dark:text-stone-400 italic">No output artifacts available.</p>
      </Card>
    );
  }

  // Group by stage
  const stageOrder: string[] = [];
  const byStage = new Map<string, OutputArtifact[]>();
  for (const a of artifacts) {
    if (!byStage.has(a.stage)) {
      byStage.set(a.stage, []);
      stageOrder.push(a.stage);
    }
    byStage.get(a.stage)!.push(a);
  }

  return (
    <>
      <div className="flex gap-6 items-start">
        {/* Sticky sidebar TOC */}
        <div className="hidden lg:block w-56 flex-shrink-0 self-start">
          <div className="sticky top-20">
            <nav className="text-sm space-y-1">
              <h3 className="font-semibold text-stone-900 dark:text-stone-100 mb-2">Contents</h3>
              {artifacts.map((a, i) => (
                <a key={`oa-${i}`} href={`#output-${i}`}
                   className="block py-1 px-2 rounded text-stone-600 dark:text-stone-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors truncate">
                  {a.stage}: {a.name}
                </a>
              ))}
            </nav>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 min-w-0">
          {stageOrder.map((stage) => {
            const stageArtifacts = byStage.get(stage) || [];
            return (
              <div key={stage}>
                <h3 className="text-sm font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-3 mt-6 first:mt-0">
                  {stage.charAt(0).toUpperCase() + stage.slice(1)}
                </h3>
                {stageArtifacts.map((a, i) => {
                  const globalIndex = artifacts.indexOf(a);
                  if (a.type === "markdown" && a.content) {
                    return (
                      <Card key={`oa-${globalIndex}`} id={`output-${globalIndex}`}>
                        <SectionHeading>{a.name}</SectionHeading>
                        <InlineComments htmlContent={markdownToSimpleHtml(a.content)} onCommentsChange={onInlineCommentsChange} />
                      </Card>
                    );
                  }
                  if (a.type === "html" && a.content) {
                    return (
                      <Card key={`oa-${globalIndex}`} id={`output-${globalIndex}`}>
                        <div className="flex items-center justify-between mb-3">
                          <SectionHeading>{a.name}</SectionHeading>
                          {a.relativePath && (
                            <a
                              href={a.relativePath}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-teal-600 dark:text-teal-400 hover:underline"
                            >
                              View Full Size &#8599;
                            </a>
                          )}
                        </div>
                        <iframe
                          srcDoc={a.content}
                          sandbox="allow-scripts"
                          className="w-full h-[600px] border border-stone-200 dark:border-stone-700 rounded-lg bg-white"
                          title={a.name}
                        />
                      </Card>
                    );
                  }
                  if (a.type === "image" && a.relativePath) {
                    return (
                      <Card key={`oa-${globalIndex}`} id={`output-${globalIndex}`}>
                        <div className="flex items-center justify-between mb-3">
                          <SectionHeading>{a.name}</SectionHeading>
                          <a
                            href={a.relativePath}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-teal-600 dark:text-teal-400 hover:underline"
                          >
                            Open in new tab &#8599;
                          </a>
                        </div>
                        <button
                          type="button"
                          onClick={() => setExpandedImage(expandedImage === a.relativePath ? null : a.relativePath!)}
                          className="block cursor-pointer"
                        >
                          <img
                            src={a.relativePath}
                            alt={a.name}
                            className={`border border-stone-200 dark:border-stone-700 rounded-lg transition-all ${
                              expandedImage === a.relativePath ? "max-w-full" : "max-w-md"
                            }`}
                          />
                        </button>
                        {expandedImage !== a.relativePath && (
                          <p className="text-xs text-stone-400 dark:text-stone-500 mt-1">Click to expand</p>
                        )}
                      </Card>
                    );
                  }
                  return null;
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Image lightbox overlay */}
      {expandedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8 cursor-pointer"
          onClick={() => setExpandedImage(null)}
          onKeyDown={(e) => e.key === "Escape" && setExpandedImage(null)}
          role="dialog"
          aria-label="Expanded image"
          tabIndex={0}
        >
          <img
            src={expandedImage}
            alt="Expanded artifact"
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>
      )}
    </>
  );
}

function UnitsTable({ units, unitMockups, onInlineCommentsChange, previousUnitContents }: { units: ParsedUnit[]; unitMockups: Record<string, MockupInfo[]>; onInlineCommentsChange?: (comments: InlineCommentEntry[]) => void; previousUnitContents?: Record<string, string> }) {
  const [expandedUnit, setExpandedUnit] = useState<string | null>(null);

  if (units.length === 0) {
    return <p className="text-stone-500 dark:text-stone-400 italic">No units found.</p>;
  }

  // Group by stage, preserving order
  const stageOrder: string[] = [];
  const byStage = new Map<string, ParsedUnit[]>();
  for (const u of units) {
    const stage = u.frontmatter.stage || "unknown";
    if (!byStage.has(stage)) {
      byStage.set(stage, []);
      stageOrder.push(stage);
    }
    byStage.get(stage)!.push(u);
  }

  return (
    <div className="space-y-6">
      {stageOrder.map((stage) => {
        const stageUnits = byStage.get(stage) || [];
        const completed = stageUnits.filter((u) => u.frontmatter.status === "completed").length;
        return (
          <div key={stage}>
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                {stage.charAt(0).toUpperCase() + stage.slice(1)}
              </h3>
              <span className="text-xs text-stone-400 dark:text-stone-500">
                {completed}/{stageUnits.length} complete
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b-2 border-stone-200 dark:border-stone-700">
                    <th className="py-2 pr-3 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">#</th>
                    <th className="py-2 pr-3 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">Name</th>
                    <th className="py-2 pr-3 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">Type</th>
                    <th className="py-2 pr-3 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">Status</th>
                    <th className="py-2 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">Dependencies</th>
                  </tr>
                </thead>
                <tbody>
          {stageUnits.map((u) => {
            const deps = u.frontmatter.depends_on?.length ? u.frontmatter.depends_on.join(", ") : "\u2014";
            const isExpanded = expandedUnit === u.slug;
            const prevRaw = previousUnitContents?.[u.slug];
            const isNew = previousUnitContents !== undefined && prevRaw === undefined;
            const isChanged = prevRaw !== undefined && u.rawContent !== undefined && prevRaw !== u.rawContent;
            // Build unit content from sections for inline commenting
            let unitContent = "";
            for (const section of u.sections) {
              if (section.heading === "_preamble") {
                unitContent += `${section.content}\n\n`;
              } else {
                unitContent += `## ${section.heading}\n\n${section.content}\n\n`;
              }
            }
            return (
              <tr key={u.slug} className="border-b border-stone-100 dark:border-stone-800">
                <td className="py-3 pr-3 font-mono text-sm text-stone-500 dark:text-stone-400" colSpan={isExpanded ? 6 : undefined}>
                  {isExpanded ? (
                    <div>
                      <button
                        type="button"
                        onClick={() => setExpandedUnit(null)}
                        className="text-xs text-teal-600 dark:text-teal-400 hover:underline mb-3"
                      >
                        Collapse
                      </button>
                      <div className="font-sans">
                        <h4 className="text-base font-semibold text-stone-800 dark:text-stone-200 mb-2">
                          {u.title}
                          {(isChanged || isNew) && (
                            <span
                              className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider align-middle ${
                                isNew
                                  ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                                  : "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
                              }`}
                            >
                              {isNew ? "New" : "Changed"}
                            </span>
                          )}
                        </h4>
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                          <StatusBadge label="Status" status={u.frontmatter.status} />
                          {u.frontmatter.stage && <StatusBadge label="Stage" status={u.frontmatter.stage} />}
                          {u.frontmatter.discipline && <StatusBadge label="Discipline" status={u.frontmatter.discipline} />}
                        </div>
                        {unitContent.trim() && (
                          <InlineComments htmlContent={markdownToSimpleHtml(unitContent)} onCommentsChange={onInlineCommentsChange} />
                        )}
                      </div>
                    </div>
                  ) : (
                    String(u.number).padStart(2, "0")
                  )}
                </td>
                {!isExpanded && (
                  <>
                    <td className="py-3 pr-3 font-medium">
                      <button
                        type="button"
                        onClick={() => setExpandedUnit(u.slug)}
                        className="text-left hover:text-teal-600 dark:hover:text-teal-400 hover:underline"
                      >
                        {u.title}
                      </button>
                      {(isChanged || isNew) && (
                        <span
                          className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                            isNew
                              ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                              : "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
                          }`}
                          title={isNew ? "Added since your last review" : "Content changed since your last review"}
                        >
                          {isNew ? "New" : "Changed"}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-3 text-sm capitalize">{u.frontmatter.stage ?? ""}</td>
                    <td className="py-3 pr-3 text-sm">{u.frontmatter.discipline ?? ""}</td>
                    <td className="py-3 pr-3">
                      <StatusBadge label="Status" status={u.frontmatter.status} />
                    </td>
                    <td className="py-3 text-sm text-stone-500 dark:text-stone-400">{deps}</td>
                  </>
                )}
              </tr>
            );
          })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MockupEmbeds({ mockups }: { mockups: MockupInfo[] }) {
  return (
    <>
      {mockups.map((m, i) => (
        <div key={i} className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-stone-600 dark:text-stone-400">{m.label}</h4>
            <a
              href={m.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-teal-600 dark:text-teal-400 hover:underline"
            >
              Open in new tab &#8599;
            </a>
          </div>
          {isImageUrl(m.url) ? (
            <img
              src={m.url}
              alt={m.label}
              className="max-w-full h-auto border border-stone-200 dark:border-stone-700 rounded-lg"
            />
          ) : (
            <iframe
              src={m.url}
              sandbox="allow-scripts allow-same-origin"
              className="w-full h-[600px] border border-stone-200 dark:border-stone-700 rounded-lg bg-white"
              title={m.label}
            />
          )}
        </div>
      ))}
    </>
  );
}

/** Simple client-side markdown to HTML using remark.
 *  InlineComments needs raw HTML, so we use remark instead of react-markdown. */
function markdownToSimpleHtml(md: string): string {
  return remark().use(remarkGfm).use(remarkHtml).processSync(md).toString();
}

function formatRelativeTime(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return "";
    const diffMs = Date.now() - then;
    const mins = Math.round(diffMs / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  } catch {
    return "";
  }
}

/** Banner shown at the top of a re-review session. Displays the previous
 *  reviewer's feedback and when it was submitted, so the user can see what
 *  they asked for without hunting for it. The per-unit "Changed" badges
 *  elsewhere indicate which units were actually edited in response. */
function RereviewBanner({ snapshot }: { snapshot: PreviousReviewSnapshot }) {
  const relative = formatRelativeTime(snapshot.reviewedAt);
  return (
    <div className="mb-4 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-4">
      <div className="flex items-start gap-2 mb-2">
        <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 text-xs font-semibold">
          Re-review
        </span>
        <span className="text-xs text-amber-800 dark:text-amber-300">
          You requested changes on this intent{relative ? ` \u2014 ${relative}` : ""}.
          Edited units are flagged with a <strong>Changed</strong> badge below.
        </span>
      </div>
      {snapshot.feedback.trim() && (
        <details className="mt-2" open>
          <summary className="cursor-pointer text-xs font-medium text-amber-900 dark:text-amber-200">
            Your previous feedback
          </summary>
          <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-stone-800 dark:text-stone-200 bg-white/60 dark:bg-stone-900/60 p-3 rounded border border-amber-200 dark:border-amber-800">
            {snapshot.feedback}
          </pre>
        </details>
      )}
    </div>
  );
}

