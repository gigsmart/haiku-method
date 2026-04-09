# Conversation Context

User wants to externalize the review experience from the local MCP to the public website. Key decisions made:
- The review SPA currently lives in and is served by the local MCP server
- Transport: WebSocket through the localtunnel for real-time bidirectional communication
- Token: JWT signed with an ephemeral secret generated per session, payload contains the tunnel URL
- The website route will be haikumethod.ai/review/:token
- Studio: software (spans plugin MCP changes + Next.js website changes)
