import { useEffect, useState } from "react";
import type { SessionData, ReviewCurrentResponse } from "./types";
import { useSession, useSessionWebSocket } from "./hooks/useSession";
import { ReviewPage } from "./components/ReviewPage";
import { ReviewCurrentPage } from "./components/ReviewCurrentPage";
import { QuestionPage } from "./components/QuestionPage";
import { DesignPicker } from "./components/DesignPicker";
import { ThemeToggle } from "./components/ThemeToggle";

function parseRoute(): { pageType: string; sessionId: string } | null {
  const path = window.location.pathname;

  // /review/current — always-available review pane
  if (path === "/review/current") {
    return { pageType: "review-current", sessionId: "current" };
  }

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

  if (route.pageType === "review-current") {
    return <ReviewCurrentLoader />;
  }

  return <SessionLoader sessionId={route.sessionId} pageType={route.pageType} />;
}

function SessionLoader({ sessionId, pageType }: { sessionId: string; pageType: string }) {
  const { session, loading, error } = useSession(sessionId);
  const wsRef = useSessionWebSocket(sessionId);
  const [title, setTitle] = useState("H\u00B7AI\u00B7K\u00B7U Review");

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

function ReviewCurrentLoader() {
  const [data, setData] = useState<ReviewCurrentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchCurrent() {
      try {
        const res = await fetch("/api/review/current", {
          headers: { "bypass-tunnel-reminder": "1" },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const d: ReviewCurrentResponse = await res.json();
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load review state");
          setLoading(false);
        }
      }
    }
    fetchCurrent();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    document.title = data ? `Review: ${data.intent}` : "H\u00B7AI\u00B7K\u00B7U Review";
  }, [data]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-3 h-8 w-8 mx-auto animate-spin rounded-full border-2 border-stone-300 border-t-teal-500" />
          <p className="text-sm text-stone-500">Loading review state...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-semibold text-red-600 dark:text-red-400">Review state unavailable</p>
          <p className="mt-1 text-sm text-stone-500">{error || "No active intent found."}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-stone-900/80 backdrop-blur border-b border-stone-200 dark:border-stone-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold truncate">Review: {data.intent}</h1>
          <ThemeToggle />
        </div>
      </header>
      <main id="main-content" className="px-4 sm:px-6 lg:px-8 py-6">
        <ReviewCurrentPage data={data} />
      </main>
      <footer className="mt-12 pb-8 text-center text-xs text-stone-500 dark:text-stone-500">
        Powered by{" "}
        <a href="https://haikumethod.ai" target="_blank" rel="noopener noreferrer" className="text-teal-600 dark:text-teal-400 hover:underline">
          H·AI·K·U
        </a>
        {" "}— Human + AI Knowledge Unification
      </footer>
    </>
  );
}
