"use client"

import { useEffect, useState, useCallback } from "react"

/**
 * Decrypt an E2E-encrypted response using AES-256-GCM.
 * The encrypted payload is base64url-encoded: iv(12 bytes) + authTag(16 bytes) + ciphertext
 */
async function e2eDecrypt(encryptedBase64url: string, keyBase64url: string): Promise<ArrayBuffer> {
  // Decode the key
  const keyBytes = base64urlToBytes(keyBase64url)
  const keyBuffer = new ArrayBuffer(keyBytes.length)
  new Uint8Array(keyBuffer).set(keyBytes)
  const cryptoKey = await crypto.subtle.importKey("raw", keyBuffer, { name: "AES-GCM" }, false, ["decrypt"])

  // Decode the packed payload
  const packed = base64urlToBytes(encryptedBase64url)
  const iv = new ArrayBuffer(12)
  new Uint8Array(iv).set(packed.slice(0, 12))
  const authTag = packed.slice(12, 28)
  const ciphertext = packed.slice(28)

  // AES-GCM expects ciphertext + authTag concatenated
  const combined = new ArrayBuffer(ciphertext.length + authTag.length)
  const combinedView = new Uint8Array(combined)
  combinedView.set(ciphertext)
  combinedView.set(authTag, ciphertext.length)

  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, combined)
}

function base64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/")
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Fetch with E2E decryption support.
 * If response has X-E2E-Encrypted header, decrypts the body and returns
 * a new Response with the original Content-Type restored.
 */
async function e2eFetch(url: string, e2eKey: string | null, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  headers.set("bypass-tunnel-reminder", "1")
  const res = await fetch(url, { ...init, headers })
  if (!e2eKey || !res.headers.get("X-E2E-Encrypted")) return res

  const originalContentType = res.headers.get("X-Original-Content-Type") ?? "application/octet-stream"
  const encryptedText = await res.text()
  const decrypted = await e2eDecrypt(encryptedText, e2eKey)

  return new Response(decrypted, {
    status: res.status,
    statusText: res.statusText,
    headers: new Headers({ "Content-Type": originalContentType }),
  })
}

export interface SessionData {
  session_id: string
  session_type: "review" | "question" | "design_direction"
  status: string
  // Review fields
  intent_slug?: string
  review_type?: "intent" | "unit"
  target?: string
  intent?: Record<string, unknown>
  units?: Array<Record<string, unknown>>
  criteria?: Array<Record<string, unknown>>
  mermaid?: string
  intent_mockups?: Array<Record<string, unknown>>
  unit_mockups?: Record<string, unknown>
  stage_states?: Record<string, unknown>
  knowledge_files?: Array<{ name: string; content: string }>
  stage_artifacts?: Array<{ stage: string; name: string; content: string }>
  output_artifacts?: Array<Record<string, unknown>>
  // Question fields
  title?: string
  context?: string
  questions?: Array<Record<string, unknown>>
  image_urls?: string[]
  // Direction fields
  archetypes?: Array<Record<string, unknown>>
  parameters?: Array<Record<string, unknown>>
}

interface ReviewAnnotations {
  screenshot?: string
  pins?: Array<{ x: number; y: number; text: string }>
  comments?: Array<{ selectedText: string; comment: string; paragraph: number }>
}

const HEARTBEAT_INTERVAL_MS = 10_000
const HEARTBEAT_TIMEOUT_MS = 8_000

export function useReviewSession(baseUrl: string, sessionId: string, e2eKey?: string | null) {
  const [session, setSession] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // `null` = not yet checked, `true` = last heartbeat ok, `false` = last heartbeat failed.
  // Null suppresses the "Reconnecting…" banner on first render while the initial
  // beat() is in flight — it only shows once we've definitively seen a failure.
  const [isConnected, setIsConnected] = useState<boolean | null>(null)

  // Fetch session data
  useEffect(() => {
    let cancelled = false

    async function fetchSession() {
      try {
        const res = await e2eFetch(`${baseUrl}/api/session/${sessionId}`, e2eKey ?? null, {
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error("Session not found. It may have expired.")
          }
          throw new Error(`Connection failed (HTTP ${res.status})`)
        }
        const data: SessionData = await res.json()
        if (!cancelled) {
          setSession(data)
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to connect to review session")
          setLoading(false)
        }
      }
    }

    fetchSession()
    return () => { cancelled = true }
  }, [baseUrl, sessionId, e2eKey])

  // Heartbeat: tell the MCP server we're still here so it knows when
  // the user closes the tab and can reopen the review if needed.
  useEffect(() => {
    let cancelled = false

    async function beat() {
      if (cancelled) return
      try {
        const res = await fetch(`${baseUrl}/api/session/${sessionId}/heartbeat`, {
          method: "HEAD",
          headers: { "bypass-tunnel-reminder": "1" },
          signal: AbortSignal.timeout(HEARTBEAT_TIMEOUT_MS),
        })
        if (!cancelled) setIsConnected(res.ok)
      } catch {
        if (!cancelled) setIsConnected(false)
      }
    }

    beat()
    const timer = setInterval(beat, HEARTBEAT_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [baseUrl, sessionId])

  const submitDecision = useCallback(
    async (decision: "approved" | "changes_requested", feedback: string, annotations?: ReviewAnnotations) => {
      const data = { decision, feedback, annotations }
      try {
        const res = await fetch(`${baseUrl}/review/${sessionId}/decide`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "bypass-tunnel-reminder": "1" },
          body: JSON.stringify(data),
        })
        return res.ok
      } catch {
        return false
      }
    },
    [baseUrl, sessionId],
  )

  const submitAnswers = useCallback(
    async (answers: Array<{ question: string; selectedOptions: string[]; otherText?: string }>, feedback?: string) => {
      const data = { answers, feedback }
      try {
        const res = await fetch(`${baseUrl}/question/${sessionId}/answer`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "bypass-tunnel-reminder": "1" },
          body: JSON.stringify(data),
        })
        return res.ok
      } catch {
        return false
      }
    },
    [baseUrl, sessionId],
  )

  const submitDirection = useCallback(
    async (archetype: string, parameters: Record<string, number>, comments?: string) => {
      const data = { archetype, parameters, comments }
      try {
        const res = await fetch(`${baseUrl}/direction/${sessionId}/select`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "bypass-tunnel-reminder": "1" },
          body: JSON.stringify(data),
        })
        return res.ok
      } catch {
        return false
      }
    },
    [baseUrl, sessionId],
  )

  return { session, loading, error, isConnected, submitDecision, submitAnswers, submitDirection }
}
