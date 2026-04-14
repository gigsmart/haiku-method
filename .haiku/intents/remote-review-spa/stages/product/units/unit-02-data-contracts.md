---
title: Data contracts — API schemas and WebSocket protocol
status: completed
quality_gates:
  - >-
    Request/response schemas for all HTTP endpoints with field types and
    required/optional
  - WebSocket message protocol defined for all message types
  - JWT payload schema defined with field types and validation
  - CORS policy specified per environment
  - File serving route contract with path resolution and security rules
---

# Data Contracts

## JWT Payload
```typescript
interface ReviewJWT {
  tun: string;   // required — tunnel URL (e.g., "https://abc123.loca.lt")
  sid: string;   // required — session UUID
  typ: "review" | "question" | "direction"; // required — session type
  iat: number;   // required — issued at (unix seconds)
  exp: number;   // required — expires at (unix seconds, iat + 3600)
}
```
Signed with HS256 using ephemeral per-server-lifetime secret.

## HTTP Endpoints

### GET /api/session/:sessionId
Response 200:
```typescript
interface SessionResponse {
  session_type: "review" | "question" | "direction";
  session_id: string;
  intent_slug: string;
  review_type?: "intent" | "unit"; // only for review sessions
  target?: string;
  status: "pending" | "approved" | "changes_requested";
  parsedIntent?: ParsedIntent;
  parsedUnits?: ParsedUnit[];
  parsedCriteria?: CriterionItem[];
  parsedMermaid?: string;
  intentMockups?: MockupInfo[];
  unitMockups?: Record<string, MockupInfo[]>;
  stageStates?: Record<string, StageStateInfo>;
  knowledgeFiles?: Array<{ name: string; content: string }>;
  stageArtifacts?: Array<{ stage: string; name: string; content: string }>;
  outputArtifacts?: OutputArtifact[];
  // Question session fields
  questions?: Question[];
  context?: string;
  imagePaths?: string[];
  // Direction session fields
  archetypes?: Archetype[];
  parameters?: Parameter[];
}
```
Response 404: `{ error: "Session not found" }`

### POST /review/:sessionId/decide
Request:
```typescript
interface DecideRequest {
  decision: "approved" | "changes_requested"; // required
  feedback?: string;
  annotations?: {
    pins?: Array<{ x: number; y: number; text: string }>;
    comments?: Array<{ selectedText: string; comment: string; paragraph: number }>;
    screenshot?: string; // base64 PNG
  };
}
```
Response 200: `{ ok: true, decision: string, feedback: string }`

### POST /question/:sessionId/answer
Request:
```typescript
interface AnswerRequest {
  answers: Array<{ question: string; selectedOptions: string[]; otherText?: string }>; // required
  feedback?: string;
  annotations?: { comments?: Array<{ selectedText: string; comment: string; paragraph: number }> };
}
```
Response 200: `{ ok: true }`

### POST /direction/:sessionId/select
Request:
```typescript
interface SelectRequest {
  archetype: string; // required
  parameters: Record<string, number>; // required
  comments?: string;
}
```
Response 200: `{ ok: true }`

### GET /files/:sessionId/*path
- Resolves path relative to intent directory or global .haiku/knowledge/ directory
- Path traversal guard: `realpath(resolved)` must start with allowed base directory
- Response: raw file with Content-Type from extension
- Response 403: path traversal attempt
- Response 404: file not found or session not found

## WebSocket Protocol

### Endpoint: wss://{host}/ws/session/:sessionId

### Client → Server
```typescript
// Review decision
{ type: "decide", decision: "approved" | "changes_requested", feedback?: string, annotations?: Annotations }

// Question answer
{ type: "answer", answers: Answer[], feedback?: string, annotations?: Annotations }

// Direction selection
{ type: "select", archetype: string, parameters: Record<string, number> }
```

### Server → Client
```typescript
// Success
{ ok: true, decision?: string, feedback?: string }

// Error
{ error: string }
```

### Connection lifecycle
- Client sends masked frames (RFC 6455)
- Server sends ping frames for keep-alive
- Client responds with pong
- On close: graceful close frame exchange

## CORS Policy
```
Access-Control-Allow-Origin: * (dev) | https://haikumethod.ai (prod)
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```
Preflight: respond to OPTIONS with 204 + above headers.
