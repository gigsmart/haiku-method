import { createContext, type ReactNode, useContext } from "react"
import { type ApiClient, defaultApiClient } from "./client"

const ApiClientContext = createContext<ApiClient>(defaultApiClient)

export function ApiClientProvider({
	client,
	children,
}: {
	client?: ApiClient
	children: ReactNode
}) {
	return (
		<ApiClientContext.Provider value={client ?? defaultApiClient}>
			{children}
		</ApiClientContext.Provider>
	)
}

export function useApiClient(): ApiClient {
	return useContext(ApiClientContext)
}
