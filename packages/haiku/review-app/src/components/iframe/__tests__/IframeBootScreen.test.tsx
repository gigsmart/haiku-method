import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { IframeBootScreen } from "../IframeBootScreen";

describe("IframeBootScreen", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders with phase=loading and shows spinner", () => {
    // Normal motion
    vi.stubGlobal("window", {
      ...globalThis.window,
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    });

    render(<IframeBootScreen phase="loading" />);

    // The role=status element should be present
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByRole("status").getAttribute("aria-label")).toBe("Loading\u2026");
  });

  it("renders with phase=connecting", () => {
    vi.stubGlobal("window", {
      ...globalThis.window,
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    });

    render(<IframeBootScreen phase="connecting" />);
    expect(screen.getByRole("status").getAttribute("aria-label")).toBe("Connecting\u2026");
  });

  it("renders with phase=ready", () => {
    vi.stubGlobal("window", {
      ...globalThis.window,
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    });

    render(<IframeBootScreen phase="ready" />);
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("returns null for phase=done", () => {
    const { container } = render(<IframeBootScreen phase="done" />);
    expect(container.firstChild).toBeNull();
  });

  it("calls onDone after timeout when phase=ready (no reduced motion)", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {
      ...globalThis.window,
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    });

    const onDone = vi.fn();
    render(<IframeBootScreen phase="ready" onDone={onDone} />);

    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    expect(onDone).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("calls onDone immediately with reduced motion", async () => {
    vi.stubGlobal("window", {
      ...globalThis.window,
      matchMedia: vi.fn().mockReturnValue({ matches: true }),
    });

    const onDone = vi.fn();
    render(<IframeBootScreen phase="ready" onDone={onDone} />);

    // Should call synchronously via useEffect
    await act(async () => {});
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("shows static text when prefers-reduced-motion is set and no spinner", () => {
    // Must mock matchMedia BEFORE import so the useRef captures it on render
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });

    render(<IframeBootScreen phase="loading" />);

    // Component in reduced-motion mode shows static "Loading…"
    const status = screen.getByRole("status");
    // In reduced-motion mode the spinner div should not be present
    const spinners = status.querySelectorAll(".animate-spin");
    expect(spinners.length).toBe(0);
    // The static label should appear
    expect(status.textContent).toContain("Loading");
  });
});
