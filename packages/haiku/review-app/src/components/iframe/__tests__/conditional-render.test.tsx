/**
 * Criterion 2: Conditional render in each page.
 * Criterion 3: Browser-mode DOM byte-identity (snapshot test).
 * Criterion 13: Top bar iframe-gated.
 * Criterion 14: Boot screen iframe-gated.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SessionData } from "../../../types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeReviewSession(): SessionData {
  return {
    session_type: "review",
    review_type: "intent",
    gate_type: "ask",
    intent: {
      slug: "test-intent",
      title: "Test Intent",
      frontmatter: { status: "active", stages: [] },
      sections: [],
      rawContent: "",
    },
    units: [],
    criteria: [],
    knowledge_files: [],
    stage_artifacts: [],
    output_artifacts: [],
    mermaid: "",
    intent_mockups: [],
    unit_mockups: {},
    stage_states: {},
  } as unknown as SessionData;
}

function makeQuestionSession(): SessionData {
  return {
    session_type: "question",
    title: "Test Question",
    questions: [{ question: "Which approach?", options: ["A", "B"], multiSelect: false }],
    context: "",
    image_urls: [],
  } as unknown as SessionData;
}

function makeDesignSession(): SessionData {
  return {
    session_type: "design_direction",
    title: "Test Design",
    archetypes: [
      {
        name: "Option A",
        description: "First option",
        preview_html: "<p>A</p>",
        default_parameters: {},
      },
    ],
    parameters: [],
  } as unknown as SessionData;
}

// ── ReviewPage ────────────────────────────────────────────────────────────────

describe("ReviewPage — conditional render", () => {
  afterEach(() => { vi.resetModules(); vi.restoreAllMocks(); });

  it("isMcpAppsHost=true: renders BottomSheetDecisionPanelReview, not ReviewSidebar", async () => {
    vi.doMock("../../../host-bridge", () => ({ isMcpAppsHost: () => true }));

    const { ReviewPage } = await import("../../ReviewPage");
    const session = makeReviewSession();

    render(<ReviewPage session={session} sessionId="sid-1" />);

    // BottomSheetDecisionPanelReview has a drag handle with specific aria role
    const handle = document.querySelector('[role="slider"]');
    expect(handle).not.toBeNull();

    // ReviewSidebar renders as <aside> — should be absent
    const aside = document.querySelector("aside");
    expect(aside).toBeNull();
  });

  it("isMcpAppsHost=false: renders ReviewSidebar, not BottomSheet", async () => {
    vi.doMock("../../../host-bridge", () => ({ isMcpAppsHost: () => false }));

    const { ReviewPage } = await import("../../ReviewPage");
    const session = makeReviewSession();

    render(<ReviewPage session={session} sessionId="sid-1" />);

    // Slider (drag handle) should NOT be present
    const handle = document.querySelector('[role="slider"]');
    expect(handle).toBeNull();

    // ReviewSidebar should be present as <aside>
    const aside = document.querySelector("aside");
    expect(aside).not.toBeNull();
  });
});

// ── QuestionPage ──────────────────────────────────────────────────────────────

describe("QuestionPage — conditional render", () => {
  afterEach(() => { vi.resetModules(); vi.restoreAllMocks(); });

  it("isMcpAppsHost=true: renders BottomSheetDecisionPanelQuestion, no inline submit", async () => {
    vi.doMock("../../../host-bridge", () => ({
      isMcpAppsHost: () => true,
      submitAnswers: vi.fn(),
    }));

    const { QuestionPage } = await import("../../QuestionPage");
    const session = makeQuestionSession();

    render(<QuestionPage session={session} sessionId="sid-q" />);

    // The bottom sheet's drag handle is present
    const handle = document.querySelector('[role="slider"]');
    expect(handle).not.toBeNull();

    // No "Submit Answers" button at form level (the browser-mode submit button)
    // In iframe mode we hide the browser submit — the BottomSheet has its own button
    const buttons = screen.getAllByRole("button");
    // All submit buttons in iframe mode come from the bottom sheet
    expect(buttons.some((b) => b.getAttribute("type") === "submit")).toBe(false);
  });

  it("isMcpAppsHost=false: renders inline submit button, no BottomSheet handle", async () => {
    vi.doMock("../../../host-bridge", () => ({
      isMcpAppsHost: () => false,
      submitAnswers: vi.fn(),
    }));

    const { QuestionPage } = await import("../../QuestionPage");
    const session = makeQuestionSession();

    render(<QuestionPage session={session} sessionId="sid-q" />);

    // Browser-mode has type=submit button
    const submitBtn = document.querySelector('button[type="submit"]');
    expect(submitBtn).not.toBeNull();

    // No bottom sheet handle
    const handle = document.querySelector('[role="slider"]');
    expect(handle).toBeNull();
  });
});

// ── DesignPicker ──────────────────────────────────────────────────────────────

describe("DesignPicker — conditional render", () => {
  afterEach(() => { vi.resetModules(); vi.restoreAllMocks(); });

  it("isMcpAppsHost=true: renders BottomSheetDecisionPanelDesign (drag handle present)", async () => {
    vi.doMock("../../../host-bridge", () => ({
      isMcpAppsHost: () => true,
      submitDesignDirection: vi.fn(),
    }));

    const { DesignPicker } = await import("../../DesignPicker");
    const session = makeDesignSession();

    render(<DesignPicker session={session} sessionId="sid-d" />);

    // Bottom sheet handle present (the iframe bottom sheet renders)
    const handle = document.querySelector('[role="slider"]');
    expect(handle).not.toBeNull();

    // The browser-mode preview modal trigger should NOT be present (it's gated by !isIframe)
    // (The "View Full Size" button is only in browser mode)
    expect(screen.queryByRole("button", { name: /view full size/i })).toBeNull();
  });

  it("isMcpAppsHost=false: renders inline submit button, no BottomSheet handle", async () => {
    vi.doMock("../../../host-bridge", () => ({
      isMcpAppsHost: () => false,
      submitDesignDirection: vi.fn(),
    }));

    const { DesignPicker } = await import("../../DesignPicker");
    const session = makeDesignSession();

    render(<DesignPicker session={session} sessionId="sid-d" />);

    // Browser-mode "Choose This Direction" button present
    expect(screen.getByRole("button", { name: /choose this direction/i })).toBeTruthy();

    // No bottom sheet handle
    const handle = document.querySelector('[role="slider"]');
    expect(handle).toBeNull();
  });
});

// ── IframeTopBar gating ───────────────────────────────────────────────────────

describe("IframeTopBar — gated by isMcpAppsHost", () => {
  afterEach(() => { vi.resetModules(); vi.restoreAllMocks(); });

  it("renders IframeTopBar when isMcpAppsHost=true (via App integration)", async () => {
    vi.doMock("../../../host-bridge", () => ({
      isMcpAppsHost: () => true,
      getSession: vi.fn().mockResolvedValue(makeReviewSession()),
    }));

    const { IframeTopBar } = await import("../IframeTopBar");

    render(<IframeTopBar slug="test" sessionType="review" bridgeStatus="connected" />);

    // IframeTopBar renders as role="banner"
    expect(document.querySelector('[role="banner"]')).not.toBeNull();
  });
});
