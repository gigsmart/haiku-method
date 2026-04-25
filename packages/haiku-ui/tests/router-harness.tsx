/**
 * Test-only router harness.
 *
 * Builds a TanStack Router instance against the generated `routeTree`
 * with an in-memory history so tests can seed the initial URL without
 * touching `window.location`. Each test-file import creates its own
 * router so suites stay isolated.
 *
 * Production entry (`src/main.tsx`) uses browser history via the
 * default `createRouter`; this harness is the parallel for tests.
 */

import {
	createMemoryHistory,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router"
import type { ReactElement } from "react"
import { routeTree } from "../src/routeTree.gen"

export interface HarnessOptions {
	/** Initial path the memory history opens on. Defaults to "/". */
	initialPath?: string
}

export function createTestRouter(options: HarnessOptions = {}) {
	const history = createMemoryHistory({
		initialEntries: [options.initialPath ?? "/"],
	})
	return createRouter({ routeTree, history })
}

export function RouterHarness(options: HarnessOptions = {}): ReactElement {
	const router = createTestRouter(options)
	return <RouterProvider router={router} />
}
