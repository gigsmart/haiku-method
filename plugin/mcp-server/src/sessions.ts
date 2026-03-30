export interface ReviewSession {
  session_id: string;
  intent_dir: string;
  intent_slug: string;
  review_type: "intent" | "unit";
  target: string;
  status: "pending" | "approved" | "changes_requested";
  decision: string;
  feedback: string;
  html: string;
}

const sessions = new Map<string, ReviewSession>();

let nextId = 1;

export function createSession(
  params: Omit<ReviewSession, "session_id" | "status" | "decision" | "feedback">
): ReviewSession {
  const session_id = `review-${nextId++}`;
  const session: ReviewSession = {
    ...params,
    session_id,
    status: "pending",
    decision: "",
    feedback: "",
  };
  sessions.set(session_id, session);
  return session;
}

export function getSession(sessionId: string): ReviewSession | undefined {
  return sessions.get(sessionId);
}

export function updateSession(
  sessionId: string,
  updates: Partial<Pick<ReviewSession, "status" | "decision" | "feedback">>
): ReviewSession | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;
  Object.assign(session, updates);
  return session;
}
