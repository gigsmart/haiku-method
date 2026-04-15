export function isFlowchartSource(_chart: string): boolean {
	// React Flow rendering is disabled — all diagrams route to the mermaid
	// CDN renderer. Re-enable once the flow pipeline is more robust.
	return false
}

export function canRenderAsFlow(_chart: string): boolean {
	return false
}
