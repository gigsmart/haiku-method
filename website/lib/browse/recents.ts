const RECENTS_KEY = "haiku-browse:recents"
const MAX_RECENTS = 10

export interface RecentRepo {
	host: string
	project: string
	branch: string
	label: string
	lastVisited: number
}

export function getRecents(): RecentRepo[] {
	if (typeof window === "undefined") return []
	try {
		return JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]")
	} catch { return [] }
}

export function addRecent(host: string, project: string, branch?: string) {
	const b = branch || ""
	const recents = getRecents().filter(r => !(r.host === host && r.project === project && r.branch === b))
	recents.unshift({
		host,
		project,
		branch: b,
		label: `${host}/${project}${b ? ` (${b})` : ""}`,
		lastVisited: Date.now(),
	})
	if (recents.length > MAX_RECENTS) recents.length = MAX_RECENTS
	localStorage.setItem(RECENTS_KEY, JSON.stringify(recents))
}
