"use client"

import { useEffect, useRef, useState, useCallback } from "react"

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
  const res = await fetch(url, init)
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

const RECONNECT_INTERVAL = 3000
const MAX_RECONNECTS = 5

export function useReviewSession(baseUrl: string, sessionId: string, e2eKey?: string | null) {
  const [session, setSession] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectCount = useRef(0)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  }, [baseUrl, sessionId])

  // WebSocket connection with auto-reconnect
  useEffect(() => {
    function connect() {
      try {
        const wsUrl = baseUrl.replace(/^http/, "ws")
        const ws = new WebSocket(`${wsUrl}/ws/session/${sessionId}`)

        ws.onopen = () => {
          wsRef.current = ws
          setIsConnected(true)
          reconnectCount.current = 0
        }

        ws.onclose = () => {
          if (wsRef.current === ws) {
            wsRef.current = null
            setIsConnected(false)
            attemptReconnect()
          }
        }

        ws.onerror = () => {
          if (wsRef.current === ws) {
            wsRef.current = null
            setIsConnected(false)
            attemptReconnect()
          }
        }
      } catch {
        setIsConnected(false)
        attemptReconnect()
      }
    }

    function attemptReconnect() {
      if (reconnectCount.current >= MAX_RECONNECTS) {
        setError("Connection lost. Please request a new review link from Claude Code.")
        return
      }
      reconnectCount.current++
      reconnectTimer.current = setTimeout(connect, RECONNECT_INTERVAL)
    }

    connect()

    return () => {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current)
      }
    }
  }, [baseUrl, sessionId])

  const submitDecision = useCallback(
    async (decision: "approved" | "changes_requested", feedback: string, annotations?: ReviewAnnotations) => {
      const data = { decision, feedback, annotations }

      // Try WebSocket first
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "decide", ...data }))
        return true
      }

      // Fallback to HTTP POST
      try {
        const res = await fetch(`${baseUrl}/review/${sessionId}/decide`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "answer", ...data }))
        return true
      }

      try {
        const res = await fetch(`${baseUrl}/question/${sessionId}/answer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "select", ...data }))
        return true
      }

      try {
        const res = await fetch(`${baseUrl}/direction/${sessionId}/select`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
