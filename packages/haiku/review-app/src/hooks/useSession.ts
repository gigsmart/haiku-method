import { useEffect, useState } from "react";
import type { SessionData, QuestionAnswer, ReviewAnnotations } from "../types";

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

/** Submit a review decision (approve / changes_requested) */
export async function submitDecision(
  sessionId: string,
  decision: "approved" | "changes_requested",
  feedback: string,
  annotations?: ReviewAnnotations,
): Promise<void> {
  const payload: Record<string, unknown> = { decision, feedback };
  if (annotations) {
    payload.annotations = annotations;
  }

  const res = await fetch(`/review/${sessionId}/decide`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
}

/** Submit question answers */
export async function submitAnswers(
  sessionId: string,
  answers: QuestionAnswer[],
): Promise<void> {
  const res = await fetch(`/question/${sessionId}/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
}

/** Submit a design direction selection */
export async function submitDesignDirection(
  sessionId: string,
  archetype: string,
  parameters: Record<string, number>,
): Promise<void> {
  const res = await fetch(`/direction/${sessionId}/select`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archetype, parameters }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
}

/** Try to close the tab, or show fallback message */
export function tryCloseTab(setShowClose: (show: boolean) => void) {
  setTimeout(() => {
    window.close();
    // If still open after 500ms, show fallback
    setTimeout(() => {
      setShowClose(true);
    }, 500);
  }, 200);
}
