import type { Page } from "@playwright/test";
import type { ReviewPackage } from "@qcut/editor-core/collaboration";

const REVIEW_API_STATE_KEY = "qcut-e2e-review-api-state";

export interface ReviewApiMockState {
	package: ReviewPackage | null;
	revision: number;
}

export async function installReviewApiMock({
	page,
	reviewToken,
	shareUrl,
}: {
	page: Page;
	reviewToken: string;
	shareUrl: string;
}) {
	await page.addInitScript(
		({ stateKey, token, url }) => {
			const nativeFetch = window.fetch.bind(window);
			const apiPath = "/api/reviews";

			const readState = () => {
				const raw = localStorage.getItem(stateKey);
				if (!raw) return { package: null, revision: 0 };
				return JSON.parse(raw) as ReviewApiMockState;
			};
			const writeState = ({ state }: { state: ReviewApiMockState }) => {
				localStorage.setItem(stateKey, JSON.stringify(state));
			};
			const jsonResponse = ({
				body,
				status = 200,
			}: {
				body: unknown;
				status?: number;
			}) =>
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
				const method = request.method.toUpperCase();
				const isCollection = requestUrl.pathname === apiPath;
				if (method === "GET") {
					if (!state.package) {
						return jsonResponse({
							body: { error: "Not found" },
							status: 404,
						});
					}
					return jsonResponse({
						body: {
							package: state.package,
							revision: state.revision,
							updatedAt: new Date().toISOString(),
						},
					});
				}

				if (method === "DELETE") {
					writeState({ state: { package: null, revision: 0 } });
					return new Response(null, { status: 204 });
				}

				if (method !== "POST") {
					return jsonResponse({
						body: { error: "Method not allowed" },
						status: 405,
					});
				}

				const body = (await request.json()) as {
					baseRevision?: number;
					package?: ReviewPackage;
				};
				if (!body.package) {
					return jsonResponse({
						body: { error: "Missing review package" },
						status: 400,
					});
				}

				if (isCollection) {
					const nextState = { package: body.package, revision: 1 };
					writeState({ state: nextState });
					return jsonResponse({
						body: {
							...nextState,
							token,
							updatedAt: new Date().toISOString(),
							url,
						},
					});
				}

				if (!state.package) {
					return jsonResponse({
						body: { error: "Not found" },
						status: 404,
					});
				}
				if (body.baseRevision !== state.revision) {
					return jsonResponse({
						body: {
							conflict: true,
							current: {
								package: state.package,
								revision: state.revision,
								updatedAt: new Date().toISOString(),
							},
						},
						status: 409,
					});
				}

				const nextState = {
					package: body.package,
					revision: state.revision + 1,
				};
				writeState({ state: nextState });
				return jsonResponse({
					body: {
						...nextState,
						updatedAt: new Date().toISOString(),
					},
				});
			};
		},
		{ stateKey: REVIEW_API_STATE_KEY, token: reviewToken, url: shareUrl }
	);
}

export async function readReviewApiMockState({ page }: { page: Page }) {
	return page.evaluate((stateKey) => {
		const raw = localStorage.getItem(stateKey);
		if (!raw) return { package: null, revision: 0 };
		return JSON.parse(raw) as ReviewApiMockState;
	}, REVIEW_API_STATE_KEY);
}

export async function seedReviewApiMock({
	page,
	state,
}: {
	page: Page;
	state: ReviewApiMockState;
}) {
	await page.evaluate(
		({ stateKey, value }) => {
			localStorage.setItem(stateKey, JSON.stringify(value));
		},
		{ stateKey: REVIEW_API_STATE_KEY, value: state }
	);
}
