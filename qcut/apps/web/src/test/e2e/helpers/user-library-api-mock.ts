import type { Page } from "@playwright/test";

const USER_LIBRARY_API_STATE_KEY = "qcut-e2e-user-library-api-state";

export interface UserLibraryApiMockDocument {
	documentKey: string;
	namespace: string;
	payload: unknown;
	updatedAt: string;
	version: number;
}

interface UserLibraryApiMockState {
	documents: Record<string, UserLibraryApiMockDocument>;
}

function installMock({ stateKey }: { stateKey: string }): void {
	const mockWindow = window as Window & {
		__qcutUserLibraryFetchMockInstalled?: boolean;
	};
	if (mockWindow.__qcutUserLibraryFetchMockInstalled) return;
	mockWindow.__qcutUserLibraryFetchMockInstalled = true;

	const nativeFetch = window.fetch.bind(window);
	const apiPath = "/api/library";
	const readState = (): UserLibraryApiMockState => {
		const raw = localStorage.getItem(stateKey);
		return raw
			? (JSON.parse(raw) as UserLibraryApiMockState)
			: { documents: {} };
	};
	const writeState = ({ state }: { state: UserLibraryApiMockState }): void => {
		localStorage.setItem(stateKey, JSON.stringify(state));
	};
	const jsonResponse = ({
		body,
		status = 200,
	}: {
		body: unknown;
		status?: number;
	}): Response =>
		new Response(JSON.stringify(body), {
			status,
			headers: { "Content-Type": "application/json" },
		});

	window.fetch = async (input, init) => {
		const request =
			input instanceof Request ? input.clone() : new Request(input, init);
		const requestUrl = new URL(request.url);
		if (!requestUrl.pathname.startsWith(apiPath)) {
			return nativeFetch(input, init);
		}

		const state = readState();
		if (request.method === "GET") {
			const namespace = requestUrl.searchParams.get("namespace");
			return jsonResponse({
				body: {
					documents: Object.values(state.documents).filter(
						(document) => document.namespace === namespace
					),
				},
			});
		}
		if (request.method !== "POST") {
			return jsonResponse({
				body: { error: "Method not allowed" },
				status: 405,
			});
		}

		const body = (await request.json()) as {
			baseVersion?: number;
			documentKey?: string;
			namespace?: string;
			payload?: unknown;
		};
		if (!body.namespace || !body.documentKey) {
			return jsonResponse({ body: { error: "Invalid document" }, status: 400 });
		}
		const key = `${body.namespace}:${body.documentKey}`;
		const current = state.documents[key] ?? null;
		if ((body.baseVersion ?? 0) !== (current?.version ?? 0)) {
			return jsonResponse({
				body: { conflict: true, current },
				status: 409,
			});
		}
		const document: UserLibraryApiMockDocument = {
			documentKey: body.documentKey,
			namespace: body.namespace,
			payload: body.payload,
			updatedAt: new Date().toISOString(),
			version: (current?.version ?? 0) + 1,
		};
		writeState({
			state: {
				documents: { ...state.documents, [key]: document },
			},
		});
		return jsonResponse({ body: { document } });
	};
}

export async function installUserLibraryApiMock({ page }: { page: Page }) {
	await page.addInitScript(installMock, {
		stateKey: USER_LIBRARY_API_STATE_KEY,
	});
	await page.evaluate(installMock, { stateKey: USER_LIBRARY_API_STATE_KEY });
}

export async function readUserLibraryApiMockDocument({
	page,
	namespace,
	documentKey = "default",
}: {
	page: Page;
	namespace: string;
	documentKey?: string;
}): Promise<UserLibraryApiMockDocument | null> {
	return page.evaluate(
		({ stateKey, key }) => {
			const raw = localStorage.getItem(stateKey);
			if (!raw) return null;
			const state = JSON.parse(raw) as UserLibraryApiMockState;
			return state.documents[key] ?? null;
		},
		{
			stateKey: USER_LIBRARY_API_STATE_KEY,
			key: `${namespace}:${documentKey}`,
		}
	);
}
