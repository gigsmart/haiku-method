import type { ParsedIntent, ParsedUnit, CriterionItem } from "./index.js";
import { renderLayout } from "./layout.js";
import { renderIntentReview } from "./intent-review.js";
import type { ReviewResult } from "./intent-review.js";
import { renderUnitReview } from "./unit-review.js";
import { renderMockupInteractionScript } from "./components.js";

import type { MockupInfo } from "./types.js";
export type { MockupInfo } from "./types.js";

export interface ReviewData {
  intent: ParsedIntent;
  units: ParsedUnit[];
  criteria: CriterionItem[];
  reviewType: "intent" | "unit";
  target: string;
  sessionId: string;
  mermaid: string;
  intentMockups: MockupInfo[];
  unitMockups: Map<string, MockupInfo[]>;
}

/**
 * Main entry point: renders a full review HTML page.
 * Routes to intent or unit review template based on reviewType.
 * Uses two-column layout: main content + unified review sidebar.
 */
export function renderReviewPage(data: ReviewData): string {
  // Prepare serialisable review data for client-side embedding
  const clientData = {
    reviewType: data.reviewType,
    target: data.target,
    sessionId: data.sessionId,
    intentTitle: data.intent.title,
    intentSlug: data.intent.slug,
  };

  let result: ReviewResult | null = null;
  let bodyContent = "";
  let title: string;
  let sidebarContent = "";

  if (data.reviewType === "unit" && data.target) {
    const targetUnit = data.units.find(
      (u) => u.slug === data.target || u.title === data.target,
    );
    if (targetUnit) {
      const wireframeMockups = data.unitMockups.get(targetUnit.slug) ?? [];
      result = renderUnitReview(
        data.intent,
        targetUnit,
        data.criteria,
        data.sessionId,
        wireframeMockups,
      );
      title = `Review: ${targetUnit.title}`;
    } else {
      bodyContent = `<div class="p-8 text-center text-red-600 dark:text-red-400">
        <p class="text-lg font-semibold">Unit not found: ${data.target}</p>
      </div>`;
      title = `Review: ${data.intent.title}`;
    }
  } else {
    result = renderIntentReview(
      data.intent,
      data.units,
      data.criteria,
      data.sessionId,
      data.mermaid,
      data.intentMockups,
      data.unitMockups,
    );
    title = `Review: ${data.intent.title}`;
  }

  if (result) {
    // Sidebar script must come BEFORE the body content so window.addReviewComment
    // is available when inline-comments and annotation-canvas scripts run.
    bodyContent = result.sidebarScript + result.body + renderMockupInteractionScript();
    sidebarContent = result.sidebar;
  } else {
    bodyContent = (bodyContent ?? "") + renderMockupInteractionScript();
  }

  return renderLayout(title!, bodyContent, JSON.stringify(clientData), sidebarContent);
}
