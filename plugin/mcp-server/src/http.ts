import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { getSession, updateSession } from "./sessions.js";

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
  if (!session) {
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
  if (!session) {
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
