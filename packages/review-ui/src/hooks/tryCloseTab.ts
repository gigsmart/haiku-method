/**
 * Try to close the tab after a short delay, or surface a manual-close
 * message via `setShowClose(true)` if the browser refuses. An optional
 * beacon is fired right before close() as a safety net in case an
 * earlier submit fetch was still in-flight.
 */
export function tryCloseTab(
	setShowClose: (show: boolean) => void,
	beacon?: { url: string; body: unknown },
) {
	setTimeout(() => {
		if (beacon && navigator.sendBeacon) {
			navigator.sendBeacon(
				beacon.url,
				new Blob([JSON.stringify(beacon.body)], { type: "application/json" }),
			)
		}
		window.close()
		setTimeout(() => {
			setShowClose(true)
		}, 500)
	}, 200)
}
