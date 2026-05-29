import { DoneClient } from "./DoneClient"

// Terminal page of the CLI OAuth flow. The proxy's server-side callback has
// already exchanged the code and flipped the broker session to ready (or
// redirected here with ?error on failure). Client-only so it can read the
// error param under static export.
export default function CliDonePage() {
	return <DoneClient />
}
