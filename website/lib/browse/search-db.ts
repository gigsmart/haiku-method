import { type IDBPDatabase, openDB } from "idb"
import type { SearchDocument } from "./search"

const DB_NAME = "haiku-browse-search"
const DB_VERSION = 1
const STORE_NAME = "documents"
const META_STORE = "meta"
const CACHE_TTL = 30 * 60 * 1000 // 30 minutes

export interface CachedDocument extends SearchDocument {
	repoKey: string
	updatedAt: number
}

interface CacheMeta {
	repoKey: string
	indexedAt: number
	deepIndexComplete: boolean
}

async function getDb(): Promise<IDBPDatabase> {
	return openDB(DB_NAME, DB_VERSION, {
		upgrade(db) {
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				const store = db.createObjectStore(STORE_NAME, { keyPath: "id" })
				store.createIndex("repoKey", "repoKey")
				store.createIndex("type", "type")
			}
			if (!db.objectStoreNames.contains(META_STORE)) {
				db.createObjectStore(META_STORE, { keyPath: "repoKey" })
			}
		},
	})
}

/** Get all cached documents for a repo */
export async function getCachedDocuments(
	repoKey: string,
): Promise<CachedDocument[]> {
	const db = await getDb()
	return db.getAllFromIndex(STORE_NAME, "repoKey", repoKey)
}

/** Store documents (upsert) */
export async function cacheDocuments(docs: CachedDocument[]): Promise<void> {
	if (docs.length === 0) return
	const db = await getDb()
	const tx = db.transaction(STORE_NAME, "readwrite")
	for (const doc of docs) {
		await tx.store.put(doc)
	}
	await tx.done
}

/** Remove a single document by id */
export async function removeCachedDocument(id: string): Promise<void> {
	const db = await getDb()
	await db.delete(STORE_NAME, id)
}

/** Check if cache is fresh (< 30 minutes old) */
export async function isCacheFresh(repoKey: string): Promise<boolean> {
	const db = await getDb()
	const meta = (await db.get(META_STORE, repoKey)) as CacheMeta | undefined
	if (!meta) return false
	return Date.now() - meta.indexedAt < CACHE_TTL
}

/** Check if deep indexing was completed for this repo */
export async function isDeepIndexComplete(repoKey: string): Promise<boolean> {
	const db = await getDb()
	const meta = (await db.get(META_STORE, repoKey)) as CacheMeta | undefined
	return meta?.deepIndexComplete ?? false
}

/** Mark the cache as indexed (update timestamp) */
export async function markCacheIndexed(
	repoKey: string,
	deepComplete: boolean,
): Promise<void> {
	const db = await getDb()
	await db.put(META_STORE, {
		repoKey,
		indexedAt: Date.now(),
		deepIndexComplete: deepComplete,
	} satisfies CacheMeta)
}

/** Clear all cached data for a repo */
export async function clearCache(repoKey: string): Promise<void> {
	const db = await getDb()
	const tx = db.transaction([STORE_NAME, META_STORE], "readwrite")
	const index = tx.objectStore(STORE_NAME).index("repoKey")
	let cursor = await index.openCursor(repoKey)
	while (cursor) {
		await cursor.delete()
		cursor = await cursor.continue()
	}
	await tx.objectStore(META_STORE).delete(repoKey)
	await tx.done
}

/** Remove all documents for a specific intent within a repo */
export async function clearIntentCache(
	repoKey: string,
	intentSlug: string,
): Promise<void> {
	const db = await getDb()
	const tx = db.transaction(STORE_NAME, "readwrite")
	const index = tx.store.index("repoKey")
	let cursor = await index.openCursor(repoKey)
	while (cursor) {
		const doc = cursor.value as CachedDocument
		// Match any document whose id starts with a type prefix and references this intent slug
		if (
			doc.id === `intent:${intentSlug}` ||
			doc.id.startsWith(`unit:${intentSlug}:`) ||
			doc.id.startsWith(`knowledge:${intentSlug}:`) ||
			doc.id.startsWith(`asset:${intentSlug}:`)
		) {
			await cursor.delete()
		}
		cursor = await cursor.continue()
	}
	await tx.done
}
