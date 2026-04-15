import { App } from "@modelcontextprotocol/ext-apps";
import type { SessionData, QuestionAnswer, ReviewAnnotations } from "./types";

// ---------------------------------------------------------------------------
// Module-level probe — runs exactly once at import time.
// Two-gate check: (1) window.parent !== window, (2) new App() succeeds.
// Result is cached in _isMcpAppsHost for the connection lifetime.
// ---------------------------------------------------------------------------

const _isMcpAppsHost: boolean = (() => {
  if (typeof window === "undefined" || window.parent === window) return false;
  try {
    new App({ name: "haiku-review-probe", version: "1.0.0" }, {});
    return true;
  } catch {
    return false;
  }
})();

console.log(`isMcpAppsHost() == ${_isMcpAppsHost}`);

// Singleton App instance for MCP Apps mode — lazily created on first use.
let _appInstance: App | null = null;

function getApp(): App {
  if (!_appInstance) {
    _appInstance = new App({ name: "haiku-review", version: "1.0.0" }, {});
  }
  return _appInstance;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/** Returns true if the SPA is running inside an MCP Apps host iframe. Cached. */
export function isMcpAppsHost(): boolean {
  return _isMcpAppsHost;
}

/**
 * Fetch session data.
 *
 * MCP Apps mode: calls haiku_cowork_review_get_session via App.callServerTool —
 * no HTTP request is made.
 *
 * Browser mode: fetches from /api/session/:id (byte-identical to the previous
 * fetchSession implementation in hooks/useSession.ts).
 */
export async function getSession(id: string): Promise<SessionData> {
  if (_isMcpAppsHost) {
    const app = getApp();
    const result = await app.callServerTool({
      name: "haiku_cowork_review_get_session",
      arguments: { session_id: id },
    });
    const text = result.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { type: "text"; text: string }).text)
      .join("");
    return JSON.parse(text) as SessionData;
  }

  // Browser mode — byte-identical to previous fetchSession implementation
  const res = await fetch(`/api/session/${id}`, {
    headers: { "bypass-tunnel-reminder": "1" },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json() as Promise<SessionData>;
}

/** Try to send data via WebSocket. Returns true if sent, false otherwise. */
function trySendViaWs(
  wsRef: React.RefObject<WebSocket | null>,
  data: unknown,
): boolean {
  const ws = wsRef.current;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
    return true;
  }
  return false;
}

/** Submit a review decision (approve / changes_requested / external_review).
 *  MCP Apps mode: routes through App.callServerTool.
 *  Browser mode: tries WebSocket first, falls back to HTTP POST. */
export async function submitDecision(
  sessionId: string,
  decision: "approved" | "changes_requested" | "external_review",
  feedback: string,
  annotations?: ReviewAnnotations,
  wsRef?: React.RefObject<WebSocket | null>,
): Promise<void> {
  if (_isMcpAppsHost) {
    const app = getApp();
    const args: Record<string, unknown> = {
      session_type: "review",
      session_id: sessionId,
      decision,
      feedback,
    };
    if (annotations) {
      args.annotations = annotations;
    }
    await app.callServerTool({
      name: "haiku_cowork_review_submit",
      arguments: args,
    });
    return;
  }

  // Browser mode — byte-identical to previous implementation
  if (wsRef) {
    const sent = trySendViaWs(wsRef, {
      type: "decide",
      decision,
      feedback,
      annotations,
    });
    if (sent) return;
  }

  const payload: Record<string, unknown> = { decision, feedback };
  if (annotations) {
    payload.annotations = annotations;
  }

  const res = await fetch(`/review/${sessionId}/decide`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "bypass-tunnel-reminder": "1" },
    body: JSON.stringify(payload),
    keepalive: true,
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
}

/** Submit question answers.
 *  MCP Apps mode: routes through App.callServerTool.
 *  Browser mode: tries WebSocket first, falls back to HTTP POST. */
export async function submitAnswers(
  sessionId: string,
  answers: QuestionAnswer[],
  wsRef?: React.RefObject<WebSocket | null>,
  feedback?: string,
  annotations?: { comments?: Array<{ selectedText: string; comment: string; paragraph: number }> },
): Promise<void> {
  if (_isMcpAppsHost) {
    const app = getApp();
    const args: Record<string, unknown> = {
      session_type: "question",
      session_id: sessionId,
      answers,
    };
    if (feedback) args.feedback = feedback;
    if (annotations) args.annotations = annotations;
    await app.callServerTool({
      name: "haiku_cowork_review_submit",
      arguments: args,
    });
    return;
  }

  // Browser mode — byte-identical to previous implementation
  if (wsRef) {
    const sent = trySendViaWs(wsRef, {
      type: "answer",
      answers,
      feedback,
      annotations,
    });
    if (sent) return;
  }

  const payload: Record<string, unknown> = { answers };
  if (feedback) payload.feedback = feedback;
  if (annotations) payload.annotations = annotations;

  const res = await fetch(`/question/${sessionId}/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "bypass-tunnel-reminder": "1" },
    body: JSON.stringify(payload),
    keepalive: true,
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
}

/** Submit a design direction selection.
 *  MCP Apps mode: routes through App.callServerTool.
 *  Browser mode: tries WebSocket first, falls back to HTTP POST. */
export async function submitDesignDirection(
  sessionId: string,
  archetype: string,
  parameters: Record<string, number>,
  wsRef?: React.RefObject<WebSocket | null>,
): Promise<void> {
  if (_isMcpAppsHost) {
    const app = getApp();
    await app.callServerTool({
      name: "haiku_cowork_review_submit",
      arguments: {
        session_type: "design_direction",
        session_id: sessionId,
        archetype,
        parameters,
      },
    });
    return;
  }

  // Browser mode — byte-identical to previous implementation
  if (wsRef) {
    const sent = trySendViaWs(wsRef, {
      type: "select",
      archetype,
      parameters,
    });
    if (sent) return;
  }

  const res = await fetch(`/direction/${sessionId}/select`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "bypass-tunnel-reminder": "1" },
    body: JSON.stringify({ archetype, parameters }),
    keepalive: true,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }
}
