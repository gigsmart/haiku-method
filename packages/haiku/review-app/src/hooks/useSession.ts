import { useEffect, useRef, useState } from "react";
import type { SessionData, QuestionAnswer, ReviewAnnotations } from "../types";

/**
 * Maintains a WebSocket connection to the server for the given session.
 * The submit functions below will try sending via WS first, falling back
 * to HTTP POST if the connection is unavailable.
 */
export function useSessionWebSocket(sessionId: string) {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    let ws: WebSocket;
    try {
      ws = new WebSocket(
        `${protocol}//${window.location.host}/ws/session/${sessionId}`,
      );
    } catch {
      // WebSocket not supported or URL invalid — no-op, HTTP fallback works
      return;
    }

    ws.onopen = () => {
      // connected
    };

    ws.onclose = () => {
      if (wsRef.current === ws) wsRef.current = null;
    };

    ws.onerror = () => {
      if (wsRef.current === ws) wsRef.current = null;
    };

    wsRef.current = ws;

    return () => {
      ws.close();
      if (wsRef.current === ws) wsRef.current = null;
    };
  }, [sessionId]);

  return wsRef;
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

export function useSession(sessionId: string) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchSession() {
      try {
        const res = await fetch(`/api/session/${sessionId}`);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data: SessionData = await res.json();
        if (!cancelled) {
          setSession(data);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load session");
          setLoading(false);
        }
      }
    }

    fetchSession();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return { session, loading, error };
}

/** Submit a review decision (approve / changes_requested).
 *  Tries WebSocket first if a wsRef is provided, falls back to HTTP POST. */
export async function submitDecision(
  sessionId: string,
  decision: "approved" | "changes_requested" | "external_review",
  feedback: string,
  annotations?: ReviewAnnotations,
  wsRef?: React.RefObject<WebSocket | null>,
): Promise<void> {
  // Try WebSocket first
  if (wsRef) {
    const sent = trySendViaWs(wsRef, {
      type: "decide",
      decision,
      feedback,
      annotations,
    });
    if (sent) return;
  }

  // Fall back to HTTP POST
  const payload: Record<string, unknown> = { decision, feedback };
  if (annotations) {
    payload.annotations = annotations;
  }

  const res = await fetch(`/review/${sessionId}/decide`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
}

/** Submit question answers.
 *  Tries WebSocket first if a wsRef is provided, falls back to HTTP POST. */
export async function submitAnswers(
  sessionId: string,
  answers: QuestionAnswer[],
  wsRef?: React.RefObject<WebSocket | null>,
  feedback?: string,
  annotations?: { comments?: Array<{ selectedText: string; comment: string; paragraph: number }> },
): Promise<void> {
  // Try WebSocket first
  if (wsRef) {
    const sent = trySendViaWs(wsRef, {
      type: "answer",
      answers,
      feedback,
      annotations,
    });
    if (sent) return;
  }

  // Fall back to HTTP POST
  const payload: Record<string, unknown> = { answers };
  if (feedback) payload.feedback = feedback;
  if (annotations) payload.annotations = annotations;

  const res = await fetch(`/question/${sessionId}/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
}

/** Submit a design direction selection.
 *  Tries WebSocket first if a wsRef is provided, falls back to HTTP POST. */
export async function submitDesignDirection(
  sessionId: string,
  archetype: string,
  parameters: Record<string, number>,
  wsRef?: React.RefObject<WebSocket | null>,
): Promise<void> {
  // Try WebSocket first
  if (wsRef) {
    const sent = trySendViaWs(wsRef, {
      type: "select",
      archetype,
      parameters,
    });
    if (sent) return;
  }

  // Fall back to HTTP POST
  const res = await fetch(`/direction/${sessionId}/select`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archetype, parameters }),
    keepalive: true,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
}

/** Try to close the tab, or show fallback message.
 *  Accepts an optional beacon payload so a last-ditch sendBeacon fires
 *  right before window.close() in case the earlier fetch was still in-flight. */
export function tryCloseTab(
  setShowClose: (show: boolean) => void,
  beacon?: { url: string; body: unknown },
) {
  setTimeout(() => {
    // Fire-and-forget beacon as a safety net — survives tab close
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon(
        beacon.url,
        new Blob([JSON.stringify(beacon.body)], { type: "application/json" }),
      );
    }
    window.close();
    // If still open after 500ms, show fallback
    setTimeout(() => {
      setShowClose(true);
    }, 500);
  }, 200);
}
