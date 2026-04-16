/**
 * Minimal @modelcontextprotocol/ext-apps shim for the review SPA bundle.
 *
 * The full ext-apps package pulls in @modelcontextprotocol/sdk and zod (~280 KB
 * extra gzipped). In the SPA, we only need:
 *   1. App constructor (for the two-gate probe)
 *   2. app.connect() — sends ui/initialize via postMessage to handshake with host
 *   3. app.ontoolresult — callback for host-pushed tool results
 *   4. app.callServerTool(params) — sends JSON-RPC tools/call via postMessage
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

// Captured on the first inbound host message and reused for postMessage
// targetOrigin + subsequent origin checks.
let _hostOrigin: string | null = null;

// Global ontoolresult handler — set by the active App instance
let _ontoolresult: ((result: CallToolResult) => void) | null = null;

// Listen for postMessage messages from the host
if (typeof window !== "undefined") {
  window.addEventListener("message", (event) => {
    // Pin the host origin on first message; reject mismatched origins after.
    if (_hostOrigin === null) _hostOrigin = event.origin;
    if (event.origin !== _hostOrigin) return;

    const msg = event.data;
    if (!msg || msg.jsonrpc !== "2.0") return;

    // Response to a request we sent (has id + matches pending)
    if (msg.id !== undefined && _pendingRequests.has(msg.id)) {
      const pending = _pendingRequests.get(msg.id)!;
      _pendingRequests.delete(msg.id);
      if (msg.error) {
        pending.reject(new Error(msg.error.message ?? String(msg.error)));
      } else {
        pending.resolve(msg.result as CallToolResult);
      }
      return;
    }

    // Host-initiated notification: tool result push
    if (msg.method === "notifications/tools/result" && _ontoolresult) {
      _ontoolresult(msg.params as CallToolResult);
      return;
    }
  });
}

function getTargetOrigin(): string | null {
  if (_hostOrigin) return _hostOrigin;
  if (typeof document !== "undefined" && document.referrer) {
    try {
      return new URL(document.referrer).origin;
    } catch {
      // fall through
    }
  }
  // Last resort: use "*" for the initial handshake only — host will respond
  // and we'll pin the origin from that response.
  return "*";
}

/** Minimal App implementation for the bundled review SPA. */
export class App {
  private _info: AppInfo;

  constructor(info: AppInfo, _capabilities?: unknown) {
    this._info = info;
  }

  /** Callback fired when the host pushes a tool result to this app. */
  set ontoolresult(handler: ((result: CallToolResult) => void) | null) {
    _ontoolresult = handler;
  }

  get ontoolresult(): ((result: CallToolResult) => void) | null {
    return _ontoolresult;
  }

  /**
   * Establish communication with the host by sending ui/initialize.
   * Must be called once after construction.
   */
  connect(): void {
    const targetOrigin = getTargetOrigin();
    if (!targetOrigin || typeof window === "undefined") return;
    window.parent.postMessage(
      {
        jsonrpc: "2.0",
        method: "ui/initialize",
        params: {
          appInfo: this._info,
        },
      },
      targetOrigin,
    );
  }

  callServerTool(params: CallToolParams): Promise<CallToolResult> {
    return new Promise<CallToolResult>((resolve, reject) => {
      const id = ++_requestId;
      _pendingRequests.set(id, { resolve, reject });
      const targetOrigin = getTargetOrigin();
      if (!targetOrigin) {
        _pendingRequests.delete(id);
        reject(new Error("callServerTool: no trusted host origin available"));
        return;
      }
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
        targetOrigin,
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
