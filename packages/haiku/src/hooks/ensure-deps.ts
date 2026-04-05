// ensure-deps — SessionStart hook that checks Node.js is available
//
// Since we're already running in Node, this is largely a no-op in the
// TypeScript binary. The shell version checked for jq and yq — those
// are no longer needed when hooks run as TypeScript.

export async function ensureDeps(_input: Record<string, unknown>, _pluginRoot: string): Promise<void> {
	// The TypeScript binary runs in Node.js, so Node is inherently available.
	// jq/yq are not needed for TypeScript hooks — we use native JSON/YAML parsing.
	// This hook exists for forward-compatibility: if additional system deps are
	// needed in the future, check them here.
}
