/**
 * Minimal @modelcontextprotocol/ext-apps shim for the review SPA bundle.
 *
 * The full ext-apps package pulls in @modelcontextprotocol/sdk and zod (~280 KB
 * extra gzipped). In the SPA, we only need:
 *   1. App constructor (for the two-gate probe)
 *   2. app.callServerTool(params) — sends JSON-RPC via postMessage
 *
 * This shim satisfies that interface without the full SDK dependency.
 * The real package is used for TypeScript types (via package.json dependency)
 * and in tests (vi.doMock replaces the import anyway).
 */

type ContentBlock = { type: "text"; text: string } | { type: string; [key: string]: unknown };

interface CallToolResult {
  content: ContentBlock[];
  isError?: boolean;
}

interface CallToolParams {
  name: string;
  arguments?: Record<string, unknown>;
}

interface AppInfo {
  name: string;
  version: string;
}

let _requestId = 0;
const _pendingRequests = new Map<number, {
  resolve: (value: CallToolResult) => void;
  reject: (reason: Error) => void;
}>();

// Listen for postMessage responses from the host
if (typeof window !== "undefined") {
  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (
      msg &&
      msg.jsonrpc === "2.0" &&
      msg.id !== undefined &&
      _pendingRequests.has(msg.id)
    ) {
      const pending = _pendingRequests.get(msg.id)!;
      _pendingRequests.delete(msg.id);
      if (msg.error) {
        pending.reject(new Error(msg.error.message ?? String(msg.error)));
      } else {
        pending.resolve(msg.result as CallToolResult);
      }
    }
  });
}

/** Minimal App implementation for the bundled review SPA. */
export class App {
  constructor(_info: AppInfo, _capabilities?: unknown) {
    // Construction succeeds — this is all the probe needs
  }

  callServerTool(params: CallToolParams): Promise<CallToolResult> {
    return new Promise<CallToolResult>((resolve, reject) => {
      const id = ++_requestId;
      _pendingRequests.set(id, { resolve, reject });
      window.parent.postMessage(
        {
          jsonrpc: "2.0",
          id,
          method: "tools/call",
          params: {
            name: params.name,
            arguments: params.arguments,
          },
        },
        "*",
      );
      // Timeout after 30 seconds
      setTimeout(() => {
        if (_pendingRequests.has(id)) {
          _pendingRequests.delete(id);
          reject(new Error(`callServerTool timeout: ${params.name}`));
        }
      }, 30000);
    });
  }
}
