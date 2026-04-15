import { describe, it, expect, vi, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Stub window.parent to be distinct from window (gate 1: passes). */
function stubParentDistinct() {
  vi.stubGlobal("window", {
    ...globalThis.window,
    parent: {},
  });
}

/** Stub window.parent to equal window (gate 1: fails). */
function stubParentSelf() {
  const self = globalThis.window as typeof globalThis.window & { parent?: unknown };
  const w = { ...self };
  w.parent = w;
  vi.stubGlobal("window", w);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("host-bridge", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  // ── probe: both gates pass ───────────────────────────────────────────────

  it("probe: both gates pass returns true and logs", async () => {
    vi.resetModules();
    stubParentDistinct();

    vi.doMock("@modelcontextprotocol/ext-apps", () => ({
      App: class MockApp {
        constructor() {}
        callServerTool = vi.fn();
      },
    }));

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { isMcpAppsHost } = await import("./host-bridge");

    expect(isMcpAppsHost()).toBe(true);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith("isMcpAppsHost() == true");
  });

  // ── probe: window.parent equals window ──────────────────────────────────

  it("probe: window.parent equals window returns false and logs", async () => {
    vi.resetModules();
    stubParentSelf();

    vi.doMock("@modelcontextprotocol/ext-apps", () => ({
      App: class MockApp {
        constructor() {}
        callServerTool = vi.fn();
      },
    }));

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { isMcpAppsHost } = await import("./host-bridge");

    expect(isMcpAppsHost()).toBe(false);
    expect(logSpy).toHaveBeenCalledWith("isMcpAppsHost() == false");
  });

  // ── probe: App constructor throws ───────────────────────────────────────

  it("probe: App constructor throws returns false, no re-throw", async () => {
    vi.resetModules();
    stubParentDistinct();

    vi.doMock("@modelcontextprotocol/ext-apps", () => ({
      App: class MockApp {
        constructor() {
          throw new Error("App unavailable");
        }
        callServerTool = vi.fn();
      },
    }));

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { isMcpAppsHost } = await import("./host-bridge");

    expect(isMcpAppsHost()).toBe(false);
    expect(logSpy).toHaveBeenCalledWith("isMcpAppsHost() == false");
  });

  // ── probe: cached — 10 calls, 1 probe invocation ─────────────────────────

  it("probe: cached — 10 calls invoke probe exactly once", async () => {
    vi.resetModules();
    stubParentDistinct();

    let constructCount = 0;
    vi.doMock("@modelcontextprotocol/ext-apps", () => ({
      App: class MockApp {
        constructor() {
          constructCount++;
        }
        callServerTool = vi.fn();
      },
    }));

    vi.spyOn(console, "log").mockImplementation(() => {});
    const { isMcpAppsHost } = await import("./host-bridge");

    for (let i = 0; i < 10; i++) {
      isMcpAppsHost();
    }

    // The probe IIFE runs once at module load; App is constructed once in the probe
    expect(constructCount).toBe(1);
  });

  // ── probe: deferred DOM guard ────────────────────────────────────────────

  it("probe: deferred DOM — window undefined returns false safely", async () => {
    vi.resetModules();
    vi.stubGlobal("window", undefined);

    vi.doMock("@modelcontextprotocol/ext-apps", () => ({
      App: class MockApp {
        constructor() {}
        callServerTool = vi.fn();
      },
    }));

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { isMcpAppsHost } = await import("./host-bridge");

    expect(isMcpAppsHost()).toBe(false);
    expect(logSpy).toHaveBeenCalledWith("isMcpAppsHost() == false");
  });

  // ── MCP mode: submitDecision via callServerTool ──────────────────────────

  it("submitDecision: MCP mode calls callServerTool not fetch", async () => {
    vi.resetModules();
    stubParentDistinct();

    const mockCallServerTool = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: '{"ok":true}' }],
    });

    vi.doMock("@modelcontextprotocol/ext-apps", () => ({
      App: class MockApp {
        constructor() {}
        callServerTool = mockCallServerTool;
      },
    }));

    vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const { isMcpAppsHost, submitDecision } = await import("./host-bridge");
    expect(isMcpAppsHost()).toBe(true);

    await submitDecision("session-123", "approved", "LGTM", undefined, undefined);

    expect(mockCallServerTool).toHaveBeenCalledWith({
      name: "haiku_cowork_review_submit",
      arguments: {
        session_type: "review",
        session_id: "session-123",
        decision: "approved",
        feedback: "LGTM",
      },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // ── MCP mode: getSession avoids HTTP fetch ───────────────────────────────

  it("getSession: MCP mode calls callServerTool not HTTP fetch", async () => {
    vi.resetModules();
    stubParentDistinct();

    const sessionData = {
      session_id: "session-abc",
      session_type: "review",
      status: "pending",
    };

    const mockCallServerTool = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify(sessionData) }],
    });

    vi.doMock("@modelcontextprotocol/ext-apps", () => ({
      App: class MockApp {
        constructor() {}
        callServerTool = mockCallServerTool;
      },
    }));

    vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const { getSession } = await import("./host-bridge");
    const result = await getSession("session-abc");

    expect(result).toEqual(sessionData);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockCallServerTool).toHaveBeenCalledWith({
      name: "haiku_cowork_review_get_session",
      arguments: { session_id: "session-abc" },
    });
  });

  // ── Browser mode: WS open → sends via WebSocket ─────────────────────────

  it("submitDecision: browser mode uses WebSocket when open", async () => {
    vi.resetModules();
    stubParentSelf();

    vi.doMock("@modelcontextprotocol/ext-apps", () => ({
      App: class MockApp {
        constructor() {}
        callServerTool = vi.fn();
      },
    }));

    vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const { isMcpAppsHost, submitDecision } = await import("./host-bridge");
    expect(isMcpAppsHost()).toBe(false);

    const mockWsSend = vi.fn();
    const mockWs = {
      readyState: WebSocket.OPEN,
      send: mockWsSend,
    } as unknown as WebSocket;

    const wsRef = { current: mockWs } as React.RefObject<WebSocket | null>;
    await submitDecision("session-456", "changes_requested", "Needs work", undefined, wsRef);

    expect(mockWsSend).toHaveBeenCalledWith(
      JSON.stringify({
        type: "decide",
        decision: "changes_requested",
        feedback: "Needs work",
        annotations: undefined,
      }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // ── Browser mode: WS closed → HTTP POST fallback ─────────────────────────

  it("submitDecision: browser mode falls back to HTTP POST when WS closed", async () => {
    vi.resetModules();
    stubParentSelf();

    vi.doMock("@modelcontextprotocol/ext-apps", () => ({
      App: class MockApp {
        constructor() {}
        callServerTool = vi.fn();
      },
    }));

    vi.spyOn(console, "log").mockImplementation(() => {});

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { isMcpAppsHost, submitDecision } = await import("./host-bridge");
    expect(isMcpAppsHost()).toBe(false);

    const mockWs = {
      readyState: WebSocket.CLOSED,
      send: vi.fn(),
    } as unknown as WebSocket;

    const wsRef = { current: mockWs } as React.RefObject<WebSocket | null>;
    await submitDecision("session-789", "approved", "All good", undefined, wsRef);

    expect(mockFetch).toHaveBeenCalledWith(
      "/review/session-789/decide",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
        body: JSON.stringify({ decision: "approved", feedback: "All good" }),
      }),
    );
  });

  // ── MCP mode: callServerTool rejects → error propagates ─────────────────

  it("submitDecision: MCP mode error propagates to caller", async () => {
    vi.resetModules();
    stubParentDistinct();

    const networkError = new Error("Connection lost");
    const mockCallServerTool = vi.fn().mockRejectedValue(networkError);

    vi.doMock("@modelcontextprotocol/ext-apps", () => ({
      App: class MockApp {
        constructor() {}
        callServerTool = mockCallServerTool;
      },
    }));

    vi.spyOn(console, "log").mockImplementation(() => {});

    const { isMcpAppsHost, submitDecision } = await import("./host-bridge");
    expect(isMcpAppsHost()).toBe(true);

    await expect(
      submitDecision("session-err", "approved", "LGTM", undefined, undefined),
    ).rejects.toThrow("Connection lost");
  });
});
