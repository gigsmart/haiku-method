/**
 * Minimal Relay Environment factory for GraphQL browse providers.
 *
 * Creates lightweight Relay environments suitable for `fetchQuery` usage
 * in class-based providers (not React components). Each provider gets its
 * own environment with a fetch function pointed at the appropriate endpoint.
 */
import {
	Environment,
	type FetchFunction,
	Network,
	RecordSource,
	Store,
} from "relay-runtime"

export interface GraphQLEndpointConfig {
	/** The GraphQL endpoint URL */
	url: string
	/** Headers to send with each request (e.g., Authorization) */
	headers: () => HeadersInit
}

/**
 * Creates a Relay Environment for a GraphQL endpoint.
 * The environment uses a simple fetch-based network layer and an in-memory store.
 */
export function createRelayEnvironment(
	config: GraphQLEndpointConfig,
): Environment {
	const fetchFn: FetchFunction = async (request, variables) => {
		const response = await fetch(config.url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...config.headers(),
			},
			body: JSON.stringify({
				query: request.text,
				variables,
			}),
		})

		if (!response.ok) {
			throw new Error(
				`GraphQL request failed: ${response.status} ${response.statusText}`,
			)
		}

		return await response.json()
	}

	return new Environment({
		network: Network.create(fetchFn),
		store: new Store(new RecordSource()),
	})
}
