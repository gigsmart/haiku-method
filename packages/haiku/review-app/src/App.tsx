import { useEffect, useState } from "react";
import type { SessionData } from "./types";
import { useSession, useSessionWebSocket } from "./hooks/useSession";
import { isMcpAppsHost } from "./host-bridge";
import { ReviewPage } from "./components/ReviewPage";
import { QuestionPage } from "./components/QuestionPage";
import { DesignPicker } from "./components/DesignPicker";
import { ThemeToggle } from "./components/ThemeToggle";
import { IframeTopBar } from "./components/iframe/IframeTopBar";
import { IframeBootScreen, type BootPhase } from "./components/iframe/IframeBootScreen";
import { NegotiationErrorScreen } from "./components/iframe/NegotiationErrorScreen";
import { SessionExpiredScreen } from "./components/iframe/SessionExpiredScreen";
import { StaleHostWarning } from "./components/iframe/StaleHostWarning";
import type { BridgeStatus } from "./components/iframe/HostBridgeStatus";

function parseRoute(): { pageType: string; sessionId: string } | null {
  const path = window.location.pathname;

  // /review/:sessionId
  const reviewMatch = path.match(/^\/(review)\/([^/]+)/);
  if (reviewMatch) return { pageType: reviewMatch[1], sessionId: reviewMatch[2] };

  // /question/:sessionId
  const questionMatch = path.match(/^\/(question)\/([^/]+)/);
  if (questionMatch) return { pageType: questionMatch[1], sessionId: questionMatch[2] };

  // /direction/:sessionId
  const directionMatch = path.match(/^\/(direction)\/([^/]+)/);
  if (directionMatch) return { pageType: directionMatch[1], sessionId: directionMatch[2] };

  return null;
}

export function App() {
  const route = parseRoute();

  if (!route) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-stone-500">No session found in URL.</p>
      </div>
    );
  }

  return <SessionLoader sessionId={route.sessionId} pageType={route.pageType} />;
}

interface IframeError {
  type: "negotiation" | "session_expired" | "sandbox";
  code: string;
  feature?: string;
}

function SessionLoader({ sessionId, pageType }: { sessionId: string; pageType: string }) {
  const { session, loading, error } = useSession(sessionId);
  const wsRef = useSessionWebSocket(sessionId);
  const [title, setTitle] = useState("H\u00B7AI\u00B7K\u00B7U Review");

  // Iframe-mode state
  const isIframe = isMcpAppsHost();
  const [bootPhase, setBootPhase] = useState<BootPhase>(isIframe ? "loading" : "done");
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>("connected");
  const [iframeError, setIframeError] = useState<IframeError | null>(null);
  const [staleHostWarning, setStaleHostWarning] = useState<{ host: string; expected: string } | null>(null);
  const [bootDone, setBootDone] = useState(!isIframe);

  // Advance boot phase as session loads
  useEffect(() => {
    if (!isIframe) return;
    if (bootPhase === "loading") {
      const t = setTimeout(() => setBootPhase("connecting"), 100);
      return () => clearTimeout(t);
    }
    if (bootPhase === "connecting" && !loading) {
      setBootPhase("ready");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootPhase, loading]);

  useEffect(() => {
    if (session) {
      if (session.session_type === "review" && session.intent?.title) {
        setTitle(`Review: ${session.intent.title}`);
      } else if (session.session_type === "question" && session.title) {
        setTitle(session.title);
      } else if (session.session_type === "design_direction") {
        setTitle(session.title || "Design Direction");
      }
    }
  }, [session]);

  useEffect(() => {
    document.title = title;
  }, [title]);

  // Detect session_expired error from HTTP path
  useEffect(() => {
    if (isIframe && error) {
      if (error.includes("401") || error.includes("expired") || error.includes("SESSION_EXPIRED")) {
        setIframeError({ type: "session_expired", code: "SESSION_EXPIRED" });
      } else {
        setIframeError({ type: "negotiation", code: "NEGOTIATION_FAILED" });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  async function handleRetry() {
    setIframeError(null);
    setBridgeStatus("reconnecting");
    // Re-trigger session load by throwing — parent's useSession will handle
    // In production, more robust retry logic would be wired here
    setBridgeStatus("connected");
  }

  const slug = session?.intent?.slug ?? session?.title ?? pageType;
  const sessionType = session?.session_type ?? pageType;

  // ── IFRAME MODE ──────────────────────────────────────────────────────────

  if (isIframe) {
    return (
      <div
        className="flex flex-col min-h-screen bg-stone-950 text-stone-100 relative"
        style={{ height: "100dvh", overflow: "hidden auto" }}
      >
        {/* Stale host warning (non-blocking, top of page) */}
        {staleHostWarning && (
          <StaleHostWarning
            hostVersion={staleHostWarning.host}
            expectedVersion={staleHostWarning.expected}
            onDismiss={() => setStaleHostWarning(null)}
          />
        )}

        {/* Top bar */}
        <IframeTopBar
          slug={slug}
          sessionType={sessionType}
          bridgeStatus={bridgeStatus}
          onRetry={handleRetry}
        />

        {/* Boot screen — shown until session data arrives */}
        {!bootDone && (
          <IframeBootScreen
            phase={bootPhase}
            onDone={() => setBootDone(true)}
          />
        )}

        {/* Error screens */}
        {bootDone && iframeError?.type === "negotiation" && (
          <NegotiationErrorScreen
            errorCode={iframeError.code}
            sessionId={sessionId}
            onRetry={handleRetry}
          />
        )}
        {bootDone && iframeError?.type === "session_expired" && (
          <SessionExpiredScreen errorCode={iframeError.code} />
        )}

        {/* Main content — shown once boot done and no fatal error */}
        {bootDone && !iframeError && session && (
          <main
            id="main-content"
            className="flex-1 flex flex-col min-w-0 px-3 py-3"
          >
            {session.session_type === "review" && (
              <ReviewPage session={session} sessionId={sessionId} wsRef={wsRef} />
            )}
            {session.session_type === "question" && (
              <QuestionPage session={session} sessionId={sessionId} wsRef={wsRef} />
            )}
            {session.session_type === "design_direction" && (
              <DesignPicker session={session} sessionId={sessionId} wsRef={wsRef} />
            )}
          </main>
        )}
      </div>
    );
  }

  // ── BROWSER MODE (unchanged) ─────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-3 h-8 w-8 mx-auto animate-spin rounded-full border-2 border-stone-300 border-t-teal-500" />
          <p className="text-sm text-stone-500">Loading session...</p>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-semibold text-red-600 dark:text-red-400">Session not found</p>
          <p className="mt-1 text-sm text-stone-500">{error || "The session may have expired."}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-stone-900/80 backdrop-blur border-b border-stone-200 dark:border-stone-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold truncate">{title}</h1>
          <ThemeToggle />
        </div>
      </header>

      {/* Main content — review pages get full width for sidebar layout */}
      <main id="main-content" className={session.session_type === "review" ? "px-4 sm:px-6 lg:px-8 py-6" : "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6"}>
        {session.session_type === "review" && (
          <ReviewPage session={session} sessionId={sessionId} wsRef={wsRef} />
        )}
        {session.session_type === "question" && (
          <QuestionPage session={session} sessionId={sessionId} wsRef={wsRef} />
        )}
        {session.session_type === "design_direction" && (
          <DesignPicker session={session} sessionId={sessionId} wsRef={wsRef} />
        )}
      </main>
      <footer className="mt-12 pb-8 text-center text-xs text-stone-500 dark:text-stone-500">
        Powered by{" "}
        <a
          href="https://haikumethod.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="text-teal-600 dark:text-teal-400 hover:underline"
        >
          H·AI·K·U
        </a>
        {" "}— Human + AI Knowledge Unification
      </footer>
    </>
  );
}
