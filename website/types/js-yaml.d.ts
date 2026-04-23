declare module "js-yaml" {
	interface LoadOptions {
		json?: boolean
		filename?: string
		schema?: unknown
	}
	export function load(input: string, options?: LoadOptions): unknown
	export function dump(obj: unknown, options?: unknown): string
	const _default: {
		load: typeof load
		dump: typeof dump
	}
	export default _default
}
