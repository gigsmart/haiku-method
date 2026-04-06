import { useCallback, useRef, useState } from "react";
import type { SessionData, ReviewAnnotations, ParsedUnit, MockupInfo, Section } from "../types";
import { StatusBadge, MarkdownViewer, CriteriaChecklist } from "@haiku/shared";
import { Tabs, type TabDef } from "./Tabs";
import { Card, SectionHeading } from "./Card";
import { DecisionForm } from "./DecisionForm";
import { AnnotationCanvas, type AnnotationPin } from "./AnnotationCanvas";
import { InlineComments, type InlineComment } from "./InlineComments";

interface Props {
  session: SessionData;
  sessionId: string;
}

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif"];
function isImageUrl(url: string): boolean {
  const ext = url.substring(url.lastIndexOf(".")).toLowerCase();
  return IMAGE_EXTS.includes(ext);
}

function findSection(sections: Section[], name: string): string {
  const section = sections.find(
    (s) => s.heading.toLowerCase() === name.toLowerCase(),
  );
  return section?.content ?? "";
}

function findSectionWithSubs(sections: Section[], name: string): Section | undefined {
  return sections.find(
    (s) => s.heading.toLowerCase() === name.toLowerCase(),
  );
}

export function ReviewPage({ session, sessionId }: Props) {
  // State for collecting annotations across tabs
  const annotationPinsRef = useRef<AnnotationPin[]>([]);
  const inlineCommentsRef = useRef<InlineComment[]>([]);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const getAnnotations = useCallback((): ReviewAnnotations | undefined => {
    const annotations: ReviewAnnotations = {};
    let hasAny = false;

    if (annotationPinsRef.current.length > 0) {
      annotations.pins = annotationPinsRef.current.map((p) => ({
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

  if (session.review_type === "unit" && session.target) {
    return (
      <UnitReview
        session={session}
        sessionId={sessionId}
        getAnnotations={getAnnotations}
      />
    );
  }

  return (
    <IntentReview
      session={session}
      sessionId={sessionId}
      getAnnotations={getAnnotations}
    />
  );
}

// --- Intent Review ---

function IntentReview({
  session,
  sessionId,
  getAnnotations,
}: {
  session: SessionData;
  sessionId: string;
  getAnnotations: () => ReviewAnnotations | undefined;
}) {
  const intent = session.intent;
  const units = session.units ?? [];
  const criteria = session.criteria ?? [];
  const mermaid = session.mermaid ?? "";
  const intentMockups = session.intent_mockups ?? [];
  const unitMockupsMap = session.unit_mockups ?? {};

  if (!intent) {
    return <p className="text-stone-500">No intent data available.</p>;
  }

  const problem = findSection(intent.sections, "Problem");
  const solution = findSection(intent.sections, "Solution");
  const contextSection = findSection(intent.sections, "Context");
  const domainSection = findSectionWithSubs(intent.sections, "Domain Model");

  // Build overview markdown
  let overviewMarkdown = "";
  if (problem) overviewMarkdown += `## Problem\n\n${problem}\n\n`;
  if (solution) overviewMarkdown += `## Solution\n\n${solution}\n\n`;

  const firstImageMockup = intentMockups.find((m) => isImageUrl(m.url));
  const remainingMockups = intentMockups.filter((m) => m !== firstImageMockup);

  const gitConfig = intent.frontmatter.git ?? { change_strategy: "", auto_merge: false, auto_squash: false };
  const workflow = intent.frontmatter.workflow ?? "";
  const announcements = intent.frontmatter.announcements ?? [];

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
              <InlineComments htmlContent={markdownToSimpleHtml(overviewMarkdown)} />
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
              <AnnotationCanvas imageUrl={firstImageMockup.url} />
            </Card>
          )}

          {remainingMockups.length > 0 && (
            <Card>
              <SectionHeading>{firstImageMockup ? "Additional Mockups" : "Mockups"}</SectionHeading>
              <MockupEmbeds mockups={remainingMockups} />
            </Card>
          )}
        </>
      ),
    },
    {
      id: "units-dag",
      label: "Units & DAG",
      content: (
        <>
          {mermaid && (
            <Card>
              <SectionHeading>Dependency Graph</SectionHeading>
              <div className="overflow-x-auto p-4 bg-stone-50 dark:bg-stone-800/50 rounded-lg border border-stone-200 dark:border-stone-700">
                <pre className="text-xs text-stone-600 dark:text-stone-400 whitespace-pre-wrap">{mermaid}</pre>
              </div>
            </Card>
          )}
          <Card>
            <SectionHeading>Units</SectionHeading>
            <UnitsTable units={units} unitMockups={unitMockupsMap} />
          </Card>
        </>
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
    {
      id: "technical",
      label: "Technical Details",
      content: (
        <>
          {contextSection && (
            <Card>
              <SectionHeading>Context</SectionHeading>
              <MarkdownViewer id="tech-context">{contextSection}</MarkdownViewer>
            </Card>
          )}
          <Card>
            <SectionHeading>Git Configuration</SectionHeading>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-stone-500 dark:text-stone-400">Change Strategy</dt>
                <dd className="font-medium mt-0.5">{gitConfig.change_strategy}</dd>
              </div>
              <div>
                <dt className="text-stone-500 dark:text-stone-400">Auto-merge</dt>
                <dd className="font-medium mt-0.5">{gitConfig.auto_merge ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt className="text-stone-500 dark:text-stone-400">Auto-squash</dt>
                <dd className="font-medium mt-0.5">{gitConfig.auto_squash ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt className="text-stone-500 dark:text-stone-400">Workflow</dt>
                <dd className="font-medium mt-0.5">{workflow}</dd>
              </div>
            </dl>
          </Card>
          {announcements.length > 0 && (
            <Card>
              <SectionHeading>Announcements</SectionHeading>
              <ul className="space-y-2">
                {announcements.map((a, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-teal-500 mt-0.5" aria-hidden="true">&bull;</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      ),
    },
  ];

  return (
    <>
      <Tabs groupId="intent" tabs={tabs} />
      <DecisionForm sessionId={sessionId} collectAnnotations getAnnotations={getAnnotations} />
    </>
  );
}

// --- Unit Review ---

function UnitReview({
  session,
  sessionId,
  getAnnotations,
}: {
  session: SessionData;
  sessionId: string;
  getAnnotations: () => ReviewAnnotations | undefined;
}) {
  const intent = session.intent;
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

  const description = findSection(targetUnit.sections, "Description") || findSection(targetUnit.sections, "Overview");
  const techSpec = findSection(targetUnit.sections, "Technical Spec") || findSection(targetUnit.sections, "Technical Specification") || findSection(targetUnit.sections, "Implementation");
  const domainEntities = findSection(targetUnit.sections, "Domain Entities") || findSection(targetUnit.sections, "Entities");
  const risks = findSection(targetUnit.sections, "Risks") || findSection(targetUnit.sections, "Risk");
  const boundaries = findSection(targetUnit.sections, "Boundaries") || findSection(targetUnit.sections, "Out of Scope") || findSection(targetUnit.sections, "NOT in scope");
  const notes = findSection(targetUnit.sections, "Notes") || findSection(targetUnit.sections, "Additional Notes");

  let combinedSpec = "";
  if (description) combinedSpec += `## Description\n\n${description}\n\n`;
  if (techSpec) combinedSpec += `## Technical Spec\n\n${techSpec}\n\n`;
  if (domainEntities) combinedSpec += `## Domain Entities\n\n${domainEntities}\n\n`;

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
          </div>

          {combinedSpec ? (
            <Card>
              <SectionHeading>Spec -- Comment on text</SectionHeading>
              <p className="text-xs text-stone-500 dark:text-stone-400 mb-3">Select text to add inline comments.</p>
              <InlineComments htmlContent={markdownToSimpleHtml(combinedSpec)} />
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
              <AnnotationCanvas imageUrl={firstImageMockup.url} />
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

  return (
    <>
      <Tabs groupId="unit" tabs={tabs} />
      <DecisionForm sessionId={sessionId} collectAnnotations getAnnotations={getAnnotations} />
    </>
  );
}

// --- Helper components ---

function UnitsTable({ units, unitMockups }: { units: ParsedUnit[]; unitMockups: Record<string, MockupInfo[]> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b-2 border-stone-200 dark:border-stone-700">
            <th className="py-2 pr-3 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">#</th>
            <th className="py-2 pr-3 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">Name</th>
            <th className="py-2 pr-3 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">Discipline</th>
            <th className="py-2 pr-3 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">Status</th>
            <th className="py-2 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">Dependencies</th>
          </tr>
        </thead>
        <tbody>
          {units.map((u) => {
            const deps = u.frontmatter.depends_on?.length ? u.frontmatter.depends_on.join(", ") : "\u2014";
            const um = unitMockups[u.slug] ?? [];
            return (
              <tr key={u.slug} className="border-b border-stone-100 dark:border-stone-800">
                <td className="py-3 pr-3 font-mono text-sm text-stone-500 dark:text-stone-400">
                  {String(u.number).padStart(2, "0")}
                </td>
                <td className="py-3 pr-3 font-medium">{u.title}</td>
                <td className="py-3 pr-3 text-sm">{u.frontmatter.discipline ?? u.frontmatter.type ?? ""}</td>
                <td className="py-3 pr-3">
                  <StatusBadge label="Status" status={u.frontmatter.status} />
                </td>
                <td className="py-3 text-sm text-stone-500 dark:text-stone-400">{deps}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
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

/** Simple client-side markdown to HTML using react-markdown isn't suitable here
 *  because InlineComments needs raw HTML. Use a minimal conversion. */
function markdownToSimpleHtml(md: string): string {
  // This is a minimal markdown->html for inline commenting.
  // We rely on react-markdown for proper rendering elsewhere.
  let html = md;

  // Headers
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Code blocks
  html = html.replace(/```[\s\S]*?```/g, (match) => {
    const content = match.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
    return `<pre><code>${content.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre>`;
  });

  // Lists
  html = html.replace(/^[-*] (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);

  // Paragraphs
  html = html.replace(/\n\n+/g, "\n\n");
  html = html.split("\n\n").map((block) => {
    const trimmed = block.trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("<h") || trimmed.startsWith("<ul") || trimmed.startsWith("<pre") || trimmed.startsWith("<ol")) return trimmed;
    return `<p>${trimmed}</p>`;
  }).join("\n");

  return html;
}
