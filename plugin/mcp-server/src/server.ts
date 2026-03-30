import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  parseIntent,
  parseAllUnits,
  parseCriteria,
  buildDAG,
  toMermaidDefinition,
} from "@ai-dlc/shared";
import { createSession, getSession } from "./sessions.js";
import { startHttpServer, setMcpServer, getActualPort } from "./http.js";
import { renderReviewPage, type MockupInfo } from "./templates/index.js";

const OpenReviewInput = z.object({
  intent_dir: z.string().describe("Path to the intent directory (e.g., .ai-dlc/my-intent)"),
  review_type: z.enum(["intent", "unit"]).describe("Type of review: intent-level or unit-level"),
  target: z.string().optional().describe("Unit slug to review (required for unit reviews)"),
});

const GetReviewStatusInput = z.object({
  session_id: z.string().describe("The review session ID"),
});

const server = new Server(
  { name: "ai-dlc-review", version: "0.1.0" },
  {
    capabilities: {
      tools: {},
      experimental: {
        "claude/channel": {},
      } as any,
    },
  }
);

// Inject MCP server into HTTP module for channel notifications
setMcpServer(server);

// List tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "open_review",
      description:
        "Open a visual review page in the browser for an AI-DLC intent or unit. " +
        "Parses intent/unit data and serves an interactive HTML review page.",
      inputSchema: {
        type: "object" as const,
        properties: {
          intent_dir: {
            type: "string",
            description: "Path to the intent directory (e.g., .ai-dlc/my-intent)",
          },
          review_type: {
            type: "string",
            enum: ["intent", "unit"],
            description: "Type of review: intent-level or unit-level",
          },
          target: {
            type: "string",
            description: "Unit slug to review (required for unit reviews)",
          },
        },
        required: ["intent_dir", "review_type"],
      },
    },
    {
      name: "get_review_status",
      description:
        "Check the status of a review session. Returns the current decision and feedback.",
      inputSchema: {
        type: "object" as const,
        properties: {
          session_id: {
            type: "string",
            description: "The review session ID",
          },
        },
        required: ["session_id"],
      },
    },
  ],
}));

// Call tools
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "open_review") {
    const input = OpenReviewInput.parse(args);

    // Parse intent data
    const intent = await parseIntent(input.intent_dir);
    if (!intent) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: Could not parse intent at ${input.intent_dir}`,
          },
        ],
        isError: true,
      };
    }

    // Parse units
    const units = await parseAllUnits(input.intent_dir);

    // Build DAG and mermaid
    const dag = buildDAG(units);
    const mermaid = toMermaidDefinition(dag, units);

    // Find completion criteria from intent sections
    const criteriaSection = intent.sections.find(
      (s) =>
        s.heading.toLowerCase().includes("completion criteria") ||
        s.heading.toLowerCase().includes("success criteria")
    );
    const criteria = criteriaSection
      ? parseCriteria(criteriaSection.content)
      : [];

    // Create session first so we have the session ID for mockup URLs
    const session = createSession({
      intent_dir: input.intent_dir,
      intent_slug: intent.slug,
      review_type: input.review_type,
      target: input.target ?? "",
      html: "",
    });

    // Scan intent mockups/ directory for HTML wireframes
    const intentMockups: MockupInfo[] = [];
    try {
      const mockupsDir = join(input.intent_dir, "mockups");
      const entries = await readdir(mockupsDir);
      for (const entry of entries.sort()) {
        if (entry.endsWith(".html") || entry.endsWith(".htm")) {
          intentMockups.push({
            label: entry.replace(/\.html?$/, ""),
            url: `/mockups/${session.session_id}/${entry}`,
          });
        }
      }
    } catch {
      // No mockups directory — that's fine
    }

    // Collect unit wireframe mockups
    const unitMockups = new Map<string, MockupInfo[]>();
    for (const unit of units) {
      const wireframe = unit.frontmatter.wireframe;
      if (wireframe && typeof wireframe === "string") {
        unitMockups.set(unit.slug, [
          {
            label: `Wireframe: ${wireframe}`,
            url: `/wireframe/${session.session_id}/${wireframe}`,
          },
        ]);
      }
    }

    // Generate HTML with session ID, mockups, and wireframes
    session.html = renderReviewPage({
      intent,
      units,
      criteria,
      reviewType: input.review_type,
      target: input.target ?? "",
      sessionId: session.session_id,
      mermaid,
      intentMockups,
      unitMockups,
    });

    // Start HTTP server (idempotent)
    const port = startHttpServer();
    const reviewUrl = `http://127.0.0.1:${port}/review/${session.session_id}`;

    // Open browser
    try {
      const cmd =
        process.platform === "darwin"
          ? ["open", reviewUrl]
          : ["xdg-open", reviewUrl];
      Bun.spawn(cmd, { stdio: ["ignore", "ignore", "ignore"] });
    } catch (err) {
      console.error("Failed to open browser:", err);
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `Review opened: ${reviewUrl}\nSession ID: ${session.session_id}\nReview type: ${input.review_type}${input.target ? `\nTarget: ${input.target}` : ""}`,
        },
      ],
    };
  }

  if (name === "get_review_status") {
    const input = GetReviewStatusInput.parse(args);
    const session = getSession(input.session_id);

    if (!session) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: Session ${input.session_id} not found`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              session_id: session.session_id,
              status: session.status,
              decision: session.decision,
              feedback: session.feedback,
              review_type: session.review_type,
              target: session.target,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  return {
    content: [
      { type: "text" as const, text: `Unknown tool: ${name}` },
    ],
    isError: true,
  };
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("AI-DLC Review MCP server running on stdio");
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.error("Shutting down...");
  await server.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.error("Shutting down...");
  await server.close();
  process.exit(0);
});

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
