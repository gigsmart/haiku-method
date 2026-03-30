import type { ParsedIntent, ParsedUnit, CriterionItem } from "@ai-dlc/shared";
import { renderLayout } from "./layout.js";
import { renderIntentReview } from "./intent-review.js";
import { renderUnitReview } from "./unit-review.js";

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

  let bodyContent: string;
  let title: string;

  if (data.reviewType === "unit" && data.target) {
    const targetUnit = data.units.find(
      (u) => u.slug === data.target || u.title === data.target,
    );
    if (targetUnit) {
      const wireframeMockups = data.unitMockups.get(targetUnit.slug) ?? [];
      bodyContent = renderUnitReview(
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
    bodyContent = renderIntentReview(
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

  return renderLayout(title, bodyContent, JSON.stringify(clientData));
}
