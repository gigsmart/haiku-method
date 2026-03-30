export interface ReviewSession {
  session_type: "review";
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

export interface QuestionDef {
  question: string;
  header?: string;
  options: string[];
  multiSelect?: boolean;
}

export interface QuestionAnswer {
  question: string;
  selectedOptions: string[];
  otherText?: string;
}

export interface QuestionSession {
  session_type: "question";
  session_id: string;
  title: string;
  questions: QuestionDef[];
  context: string;
  status: "pending" | "answered";
  answers: QuestionAnswer[];
  html: string;
}

const sessions = new Map<string, ReviewSession | QuestionSession>();

let nextReviewId = 1;
let nextQuestionId = 1;

export function createSession(
  params: Omit<ReviewSession, "session_type" | "session_id" | "status" | "decision" | "feedback">
): ReviewSession {
  const session_id = `review-${nextReviewId++}`;
  const session: ReviewSession = {
    ...params,
    session_type: "review",
    session_id,
    status: "pending",
    decision: "",
    feedback: "",
  };
  sessions.set(session_id, session);
  return session;
}

export function createQuestionSession(
  params: Omit<QuestionSession, "session_type" | "session_id" | "status" | "answers">
): QuestionSession {
  const session_id = `question-${nextQuestionId++}`;
  const session: QuestionSession = {
    ...params,
    session_type: "question",
    session_id,
    status: "pending",
    answers: [],
  };
  sessions.set(session_id, session);
  return session;
}

export function getSession(sessionId: string): ReviewSession | QuestionSession | undefined {
  return sessions.get(sessionId);
}

export function updateSession(
  sessionId: string,
  updates: Partial<Pick<ReviewSession, "status" | "decision" | "feedback">>
): ReviewSession | undefined {
  const session = sessions.get(sessionId);
  if (!session || session.session_type !== "review") return undefined;
  Object.assign(session, updates);
  return session;
}

export function updateQuestionSession(
  sessionId: string,
  updates: Partial<Pick<QuestionSession, "status" | "answers">>
): QuestionSession | undefined {
  const session = sessions.get(sessionId);
  if (!session || session.session_type !== "question") return undefined;
  Object.assign(session, updates);
  return session;
}
