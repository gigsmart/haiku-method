/**
 * Session-ID generation + encoding helpers.
 *
 * Session IDs are UUID v7s (time-ordered, sortable) encoded as base58
 * without dashes so they're compact in URLs and dashless for easier
 * double-click selection. 128 bits → 22 characters of base58.
 *
 * The wire format is the base58 string. Callers that need the raw
 * bytes (e.g. metrics, rare legacy compat) can decode via
 * `decodeSessionId`.
 *
 * Accepting legacy IDs: `decodeSessionId` also accepts traditional
 * UUID-with-dashes strings so sessions already in flight when this
 * change lands keep working. The canonical form is base58.
 */

import { randomBytes } from "node:crypto"

// Bitcoin base58 alphabet — no 0, O, I, l to avoid ambiguous glyphs.
const BASE58_ALPHABET =
	"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

/**
 * Generate a new UUID v7 + return its base58 encoding. Time-ordered,
 * so IDs generated later sort after earlier ones — handy for any log
 * that wants chronological order without a separate timestamp column.
 */
export function newSessionId(): string {
	const bytes = uuidV7Bytes()
	return base58Encode(bytes)
}

/**
 * Decode a session ID back to its 16-byte buffer. Accepts:
 *   - Base58 (canonical)
 *   - UUID with dashes (8-4-4-4-12)
 *   - UUID without dashes (32 hex chars)
 * Throws for any other shape.
 */
export function decodeSessionId(id: string): Uint8Array {
	// UUID with dashes
	if (
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
	) {
		return hexToBytes(id.replace(/-/g, ""))
	}
	// UUID hex without dashes
	if (/^[0-9a-f]{32}$/i.test(id)) {
		return hexToBytes(id)
	}
	// Base58 — validate chars and decode
	if (/^[1-9A-HJ-NP-Za-km-z]+$/.test(id)) {
		return base58Decode(id)
	}
	throw new Error(`Invalid session id format: ${id}`)
}

/** Lightweight validator. True when the string parses as one of the
 *  accepted forms above. */
export function isValidSessionId(id: string): boolean {
	try {
		const bytes = decodeSessionId(id)
		return bytes.byteLength === 16
	} catch {
		return false
	}
}

/** 16-byte UUID v7. Built from 48 bits of ms timestamp + version
 *  marker + variant marker + 74 random bits. */
function uuidV7Bytes(): Uint8Array {
	const bytes = new Uint8Array(16)
	const ms = Date.now()
	// Write 48-bit big-endian timestamp into bytes[0..5].
	bytes[0] = (ms / 0x010000000000) & 0xff
	bytes[1] = (ms / 0x000100000000) & 0xff
	bytes[2] = (ms / 0x000001000000) & 0xff
	bytes[3] = (ms / 0x000000010000) & 0xff
	bytes[4] = (ms / 0x000000000100) & 0xff
	bytes[5] = ms & 0xff
	const rand = randomBytes(10)
	for (let i = 0; i < 10; i++) bytes[6 + i] = rand[i]
	// Version 7: top nibble of byte 6.
	bytes[6] = (bytes[6] & 0x0f) | 0x70
	// Variant 10xx: top two bits of byte 8.
	bytes[8] = (bytes[8] & 0x3f) | 0x80
	return bytes
}

function hexToBytes(hex: string): Uint8Array {
	const out = new Uint8Array(hex.length / 2)
	for (let i = 0; i < out.length; i++) {
		out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
	}
	return out
}

/** Encode a byte array as base58 (leading zero bytes are preserved as
 *  leading '1' chars — Bitcoin convention). */
export function base58Encode(bytes: Uint8Array): string {
	let zeros = 0
	while (zeros < bytes.length && bytes[zeros] === 0) zeros++
	// Treat bytes as a big integer; repeatedly divide by 58.
	let num = 0n
	for (const b of bytes) num = (num << 8n) + BigInt(b)
	let out = ""
	while (num > 0n) {
		const rem = Number(num % 58n)
		num = num / 58n
		out = BASE58_ALPHABET[rem] + out
	}
	return "1".repeat(zeros) + out
}

/** Decode a base58 string into bytes. */
export function base58Decode(s: string): Uint8Array {
	let zeros = 0
	while (zeros < s.length && s[zeros] === "1") zeros++
	let num = 0n
	for (const ch of s) {
		const idx = BASE58_ALPHABET.indexOf(ch)
		if (idx < 0) throw new Error(`Invalid base58 character: ${ch}`)
		num = num * 58n + BigInt(idx)
	}
	// Convert big integer to bytes (big-endian).
	const out: number[] = []
	while (num > 0n) {
		out.unshift(Number(num & 0xffn))
		num >>= 8n
	}
	const leading = new Array(zeros).fill(0) as number[]
	return new Uint8Array([...leading, ...out])
}
