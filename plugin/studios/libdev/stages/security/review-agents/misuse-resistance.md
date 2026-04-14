---
name: misuse-resistance
stage: security
studio: libdev
---

**Mandate:** The agent **MUST** verify the library's public API is resistant to unsafe use by consumers. Libraries that are easy to misuse are effectively insecure regardless of the internal code quality.

**Check:**
- The agent **MUST** verify unsafe defaults are flagged and either fixed or documented with consumer guidance
- The agent **MUST** verify injection-prone entry points have explicit documentation on safe usage
- The agent **MUST** verify error messages and serialization do not leak sensitive data to downstream code
- The agent **MUST** verify the library does not silently trust inputs that consumers would naturally pass from untrusted sources
