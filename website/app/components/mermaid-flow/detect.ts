export function isFlowchartSource(_chart: string): boolean {
	// React Flow rendering is disabled — all diagrams route to the mermaid
	// CDN renderer. Re-enable once the flow pipeline is more robust.
	return false
}

export function canRenderAsFlow(_chart: string): boolean {
	// Keep returning false until React Flow is re-enabled. When re-enabled,
	// FlowExpandableDiagram in ExpandableDiagram.tsx will automatically be
	// used for flowchart/graph diagrams.
	return false
}
