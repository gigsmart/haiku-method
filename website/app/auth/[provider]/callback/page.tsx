import { CallbackClient } from "./CallbackClient"

export function generateStaticParams() {
	return [{ provider: "github" }, { provider: "gitlab" }]
}

export default async function OAuthCallbackPage({ params }: { params: Promise<{ provider: string }> }) {
	const { provider } = await params
	return <CallbackClient provider={provider} />
}
