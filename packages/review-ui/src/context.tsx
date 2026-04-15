import { type ReactNode, createContext, useContext } from "react"
import type { ReviewTransport } from "./transport"

const TransportContext = createContext<ReviewTransport | null>(null)

export function ReviewTransportProvider({
	transport,
	children,
}: {
	transport: ReviewTransport
	children: ReactNode
}) {
	return (
		<TransportContext.Provider value={transport}>
			{children}
		</TransportContext.Provider>
	)
}

export function useReviewTransport(): ReviewTransport {
	const t = useContext(TransportContext)
	if (!t) {
		throw new Error(
			"useReviewTransport() must be called inside <ReviewTransportProvider>",
		)
	}
	return t
}
