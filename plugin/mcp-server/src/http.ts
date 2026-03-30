import { join, resolve, extname } from "node:path";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { getSession, updateSession, updateQuestionSession } from "./sessions.js";
import type { QuestionAnswer } from "./sessions.js";

let httpServer: ReturnType<typeof Bun.serve> | null = null;
let actualPort: number | null = null;

/** Dependency-injected MCP server reference */
let mcpServer: Server | null = null;

export function setMcpServer(server: Server): void {
  mcpServer = server;
}

export function getActualPort(): number | null {
  return actualPort;
}

function handleReviewGet(sessionId: string): Response {
  const session = getSession(sessionId);
  if (!session || session.session_type !== "review") {
    return new Response("Session not found", { status: 404 });
  }
  return new Response(session.html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function handleDecidePost(
  sessionId: string,
  req: Request
): Promise<Response> {
  const session = getSession(sessionId);
  if (!session || session.session_type !== "review") {
    return new Response("Session not found", { status: 404 });
  }

  const body = (await req.json()) as {
    decision: string;
    feedback?: string;
  };

  const decision =
    body.decision === "approved" ? "approved" : "changes_requested";
  const feedback = body.feedback ?? "";

  updateSession(sessionId, {
    status: decision,
    decision,
    feedback,
  });

  // Push channel notification to Claude Code
  if (mcpServer) {
    try {
      await mcpServer.notification({
        method: "notifications/claude/channel" as any,
        params: {
          content: feedback,
          meta: {
            decision,
            review_type: session.review_type,
            target: session.target || "",
            session_id: sessionId,
          },
        },
      } as any);
    } catch (err) {
      console.error("Failed to push channel notification:", err);
    }
  }

  return Response.json({ ok: true, decision, feedback });
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

async function handleMockupGet(
  sessionId: string,
  filePath: string
): Promise<Response> {
  const session = getSession(sessionId);
  if (!session || session.session_type !== "review") {
    return new Response("Session not found", { status: 404 });
  }

  // Resolve and validate path stays within intent dir
  const mockupsDir = join(session.intent_dir, "mockups");
  const resolved = resolve(mockupsDir, filePath);
  if (!resolved.startsWith(resolve(mockupsDir))) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const file = Bun.file(resolved);
    if (!(await file.exists())) {
      return new Response("Not found", { status: 404 });
    }
    const ext = extname(resolved).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
    return new Response(file, {
      headers: { "Content-Type": contentType },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

async function handleWireframeGet(
  sessionId: string,
  filePath: string
): Promise<Response> {
  const session = getSession(sessionId);
  if (!session || session.session_type !== "review") {
    return new Response("Session not found", { status: 404 });
  }

  // Wireframe paths are relative to the intent dir
  const resolved = resolve(session.intent_dir, filePath);
  if (!resolved.startsWith(resolve(session.intent_dir))) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const file = Bun.file(resolved);
    if (!(await file.exists())) {
      return new Response("Not found", { status: 404 });
    }
    const ext = extname(resolved).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
    return new Response(file, {
      headers: { "Content-Type": contentType },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

function handleQuestionGet(sessionId: string): Response {
  const session = getSession(sessionId);
  if (!session || session.session_type !== "question") {
    return new Response("Session not found", { status: 404 });
  }
  return new Response(session.html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function handleQuestionAnswerPost(
  sessionId: string,
  req: Request
): Promise<Response> {
  const session = getSession(sessionId);
  if (!session || session.session_type !== "question") {
    return new Response("Session not found", { status: 404 });
  }

  const body = (await req.json()) as { answers: QuestionAnswer[] };

  updateQuestionSession(sessionId, {
    status: "answered",
    answers: body.answers,
  });

  // Push channel notification to Claude Code
  if (mcpServer) {
    try {
      await mcpServer.notification({
        method: "notifications/claude/channel" as any,
        params: {
          content: JSON.stringify(body.answers),
          meta: {
            response_type: "question_answers",
            session_id: sessionId,
            question_count: body.answers.length,
          },
        },
      } as any);
    } catch (err) {
      console.error("Failed to push channel notification:", err);
    }
  }

  return Response.json({ ok: true });
}

function handleRequest(req: Request): Response | Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  // GET /review/:sessionId
  const reviewMatch = path.match(/^\/review\/([^/]+)$/);
  if (reviewMatch && req.method === "GET") {
    return handleReviewGet(reviewMatch[1]);
  }

  // POST /review/:sessionId/decide
  const decideMatch = path.match(/^\/review\/([^/]+)\/decide$/);
  if (decideMatch && req.method === "POST") {
    return handleDecidePost(decideMatch[1], req);
  }

  // GET /mockups/:sessionId/:path — serve files from intent mockups/ dir
  const mockupMatch = path.match(/^\/mockups\/([^/]+)\/(.+)$/);
  if (mockupMatch && req.method === "GET") {
    return handleMockupGet(mockupMatch[1], mockupMatch[2]);
  }

  // GET /wireframe/:sessionId/:path — serve wireframe files from intent dir
  const wireframeMatch = path.match(/^\/wireframe\/([^/]+)\/(.+)$/);
  if (wireframeMatch && req.method === "GET") {
    return handleWireframeGet(wireframeMatch[1], wireframeMatch[2]);
  }

  // GET /question/:sessionId
  const questionMatch = path.match(/^\/question\/([^/]+)$/);
  if (questionMatch && req.method === "GET") {
    return handleQuestionGet(questionMatch[1]);
  }

  // POST /question/:sessionId/answer
  const questionAnswerMatch = path.match(/^\/question\/([^/]+)\/answer$/);
  if (questionAnswerMatch && req.method === "POST") {
    return handleQuestionAnswerPost(questionAnswerMatch[1], req);
  }

  return new Response("Not Found", { status: 404 });
}

export function startHttpServer(): number {
  if (httpServer && actualPort !== null) {
    return actualPort;
  }

  const basePort = parseInt(process.env.AI_DLC_REVIEW_PORT ?? "8789", 10);
  let port = basePort;
  const maxAttempts = 10;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      httpServer = Bun.serve({
        port,
        hostname: "127.0.0.1",
        fetch: handleRequest,
      });
      actualPort = port;
      console.error(`Review HTTP server listening on http://127.0.0.1:${port}`);
      return port;
    } catch (err: any) {
      if (err?.code === "EADDRINUSE" || err?.message?.includes("address")) {
        port++;
        continue;
      }
      throw err;
    }
  }

  throw new Error(
    `Could not find available port (tried ${basePort}-${basePort + maxAttempts - 1})`
  );
}
