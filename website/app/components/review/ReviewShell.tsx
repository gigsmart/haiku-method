"use client"

import { useState, useEffect } from "react"
import { useReviewSession } from "./hooks/useReviewSession"
import { ReviewSidebar } from "./ReviewSidebar"
import { ReviewRouter } from "./ReviewRouter"

interface TokenPayload {
  tun: string
  sid: string
  typ: string
  key?: string
  iat: number
  exp: number
}

function decodeJWT(token: string): TokenPayload {
  const payload = token.split(".")[1]
  if (!payload) throw new Error("Invalid token format")
  const base64 = payload.replace(/-/g, "+").replace(/_/g, "/")
  return JSON.parse(atob(base64))
}

type ShellState =
  | { status: "loading" }
  | { status: "error"; message: string; kind: "expired" | "malformed" | "connection" }
  | { status: "connected"; config: TokenPayload }

export function ReviewShell() {
  const [state, setState] = useState<ShellState>({ status: "loading" })

  useEffect(() => {
    const hash = window.location.hash.slice(1)
    if (!hash) {
      setState({ status: "error", message: "No review token found in URL.", kind: "malformed" })
      return
    }

    try {
      const payload = decodeJWT(hash)
      if (payload.exp && payload.exp < Date.now() / 1000) {
        setState({
          status: "error",
          message: "This review link has expired. Ask for a new link from Claude Code.",
          kind: "expired",
        })
        return
      }
      if (!payload.tun || !payload.sid || !payload.typ) {
        setState({ status: "error", message: "Invalid review token — missing required fields.", kind: "malformed" })
        return
      }
      setState({ status: "connected", config: payload })
    } catch {
      setState({ status: "error", message: "Invalid review token. Make sure you copied the full URL.", kind: "malformed" })
    }
  }, [])

  if (state.status === "loading") {
    return <LoadingState />
  }

  if (state.status === "error") {
    return <ErrorState message={state.message} kind={state.kind} />
  }

  return <ReviewContent config={state.config} />
}

function ReviewContent({ config }: { config: TokenPayload }) {
  const { session, loading, error, isConnected, submitDecision, submitAnswers, submitDirection } =
    useReviewSession(config.tun, config.sid, config.key)

  if (loading) {
    return <LoadingState message="Loading review session..." />
  }

  if (error) {
    return <ErrorState message={error} kind="connection" />
  }

  if (!session) {
    return <ErrorState message="Session not found. It may have expired." kind="connection" />
  }

  const accentColor = getAccentColor(config.typ)

  return (
    <div className="flex min-h-screen bg-stone-900">
      <ReviewSidebar
        sessionType={config.typ}
        accentColor={accentColor}
        isConnected={isConnected}
        session={session}
        onSubmitDecision={submitDecision}
      />
      <main className="flex-1 overflow-auto p-10">
        {!isConnected && <ReconnectingBanner />}
        <div className={!isConnected ? "opacity-60 pointer-events-none" : ""}>
          <ReviewRouter
            session={session}
            baseUrl={config.tun}
            onSubmitDecision={submitDecision}
            onSubmitAnswers={submitAnswers}
            onSubmitDirection={submitDirection}
          />
        </div>
      </main>
    </div>
  )
}

function LoadingState({ message = "Connecting to review session..." }: { message?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-900">
      <div className="text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-[3px] border-stone-700 border-t-teal-500" />
        <p className="text-stone-400 text-sm">{message}</p>
      </div>
    </div>
  )
}

function ErrorState({ message, kind }: { message: string; kind: "expired" | "malformed" | "connection" }) {
  const icons: Record<string, string> = { expired: "\u23F0", malformed: "\u26A0\uFE0F", connection: "\uD83D\uDD0C" }
  const titles: Record<string, string> = {
    expired: "Review Link Expired",
    malformed: "Invalid Review Link",
    connection: "Connection Failed",
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-900">
      <div className="max-w-md rounded-xl border border-stone-700 bg-stone-800 p-8 text-center">
        <div className="mb-3 text-3xl">{icons[kind]}</div>
        <h2 className="mb-2 text-lg font-semibold text-stone-200">{titles[kind]}</h2>
        <p className="text-sm leading-relaxed text-stone-400">{message}</p>
      </div>
    </div>
  )
}

function ReconnectingBanner() {
  return (
    <div className="mb-4 flex items-center justify-center gap-2 rounded-lg border border-yellow-800 bg-yellow-900/20 px-4 py-2 text-sm text-yellow-400">
      <div className="h-3 w-3 animate-spin rounded-full border-2 border-yellow-800 border-t-yellow-400" />
      Reconnecting to review session...
    </div>
  )
}

function getAccentColor(typ: string): string {
  switch (typ) {
    case "review": return "#14b8a6"
    case "question": return "#f59e0b"
    case "direction": return "#6366f1"
    default: return "#14b8a6"
  }
}

