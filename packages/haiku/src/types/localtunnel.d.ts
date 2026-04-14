// Minimal declaration for the localtunnel package — there's no @types/localtunnel
// on npm, so this captures the surface we actually use in src/tunnel.ts.
declare module "localtunnel" {
	interface TunnelOptions {
		port: number
		subdomain?: string
		host?: string
		local_host?: string
		local_https?: boolean
		local_cert?: string
		local_key?: string
		local_ca?: string
		allow_invalid_cert?: boolean
	}

	interface Tunnel {
		url: string
		clientId?: string
		close(): void
		on(
			event: "request",
			listener: (info: { method: string; path: string }) => void,
		): this
		on(event: "error", listener: (err: Error) => void): this
		on(event: "close", listener: () => void): this
		on(event: string, listener: (...args: unknown[]) => void): this
	}

	function localtunnel(opts: TunnelOptions): Promise<Tunnel>
	function localtunnel(
		port: number,
		opts?: Omit<TunnelOptions, "port">,
	): Promise<Tunnel>

	export = localtunnel
}
