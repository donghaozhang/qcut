import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for `makeFalRequestQueued` — the slow-model queue path that submits
 * to `queue.fal.run`, polls `/api/ai/status`, and fetches `/api/ai/result`
 * through the license-server proxy.
 *
 * Uses fake timers so the 3 s poll intervals don't stall the suite.
 */

const mockGetAuthToken = vi.fn();
vi.mock("@qcut/platform-core", () => ({
	platform: () => ({
		license: { getAuthToken: mockGetAuthToken },
		apiKeys: undefined,
	}),
}));

vi.mock("@/lib/debug/error-handler", () => ({
	handleAIServiceError: vi.fn(),
}));

const originalFetch = globalThis.fetch;
const mockFetch = vi.fn();

beforeEach(() => {
	vi.stubGlobal("fetch", mockFetch);
	mockFetch.mockReset();
	mockGetAuthToken.mockReset();
	vi.stubEnv("VITE_FAL_API_KEY", "");
	vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
	vi.useRealTimers();
	globalThis.fetch = originalFetch;
});

const { makeFalRequestQueued, clearFalApiKeyCache } = await import(
	"../fal-request"
);

function jsonResponse(body: object, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

describe("makeFalRequestQueued", () => {
	beforeEach(() => {
		clearFalApiKeyCache();
	});

	it("submits via queue.fal.run, polls status, then fetches result", async () => {
		mockGetAuthToken.mockResolvedValue("tok-abc");
		mockFetch
			// Step 1 — submit
			.mockResolvedValueOnce(
				jsonResponse({
					request_id: "req-1",
					status_url:
						"https://queue.fal.run/openai/gpt-image-2/requests/req-1/status",
					response_url:
						"https://queue.fal.run/openai/gpt-image-2/requests/req-1",
				})
			)
			// Step 2 — first status poll returns IN_QUEUE
			.mockResolvedValueOnce(jsonResponse({ status: "IN_QUEUE" }))
			// Step 3 — second poll returns COMPLETED
			.mockResolvedValueOnce(jsonResponse({ status: "COMPLETED" }))
			// Step 4 — result fetch
			.mockResolvedValueOnce(
				jsonResponse({ images: [{ url: "https://cdn/img.png" }] })
			);

		const promise = makeFalRequestQueued(
			"https://fal.run/openai/gpt-image-2",
			{ prompt: "x" },
			{ proxyFirst: true, modelKey: "gpt-image-2-fal" }
		);
		// Advance past both 3 s polls
		await vi.advanceTimersByTimeAsync(10_000);
		const result = await promise;

		expect(result.ok).toBe(true);
		const body = (await result.json()) as { images: { url: string }[] };
		expect(body.images[0].url).toBe("https://cdn/img.png");

		// Submit must have rewritten fal.run → queue.fal.run
		const submitBody = JSON.parse(mockFetch.mock.calls[0][1].body);
		expect(submitBody.endpoint).toBe(
			"https://queue.fal.run/openai/gpt-image-2"
		);

		// Status poll goes to /api/ai/status with the forwarded statusUrl
		const statusUrl: string = mockFetch.mock.calls[1][0];
		expect(statusUrl).toContain("/api/ai/status?");
		expect(statusUrl).toContain("requestId=req-1");
		expect(statusUrl).toContain(
			encodeURIComponent(
				"https://queue.fal.run/openai/gpt-image-2/requests/req-1/status"
			)
		);

		// Final result fetch goes to /api/ai/result
		const resultUrl: string = mockFetch.mock.calls[3][0];
		expect(resultUrl).toContain("/api/ai/result?");
		expect(resultUrl).toContain("requestId=req-1");
	});

	it("returns inline success payload when FAL skips the queue", async () => {
		mockGetAuthToken.mockResolvedValue("tok");
		// No request_id — images returned inline.
		mockFetch.mockResolvedValueOnce(
			jsonResponse({ images: [{ url: "https://cdn/inline.png" }] })
		);

		const response = await makeFalRequestQueued(
			"https://fal.run/openai/gpt-image-2",
			{ prompt: "x" },
			{ proxyFirst: true }
		);

		expect(response.ok).toBe(true);
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	it("surfaces a 502 when the queue job reports FAILED", async () => {
		mockGetAuthToken.mockResolvedValue("tok");
		mockFetch
			.mockResolvedValueOnce(
				jsonResponse({
					request_id: "req-fail",
					status_url:
						"https://queue.fal.run/openai/gpt-image-2/requests/req-fail/status",
					response_url:
						"https://queue.fal.run/openai/gpt-image-2/requests/req-fail",
				})
			)
			.mockResolvedValueOnce(
				jsonResponse({ status: "FAILED", error: "rate limited" })
			);

		const promise = makeFalRequestQueued(
			"https://fal.run/openai/gpt-image-2",
			{ prompt: "x" },
			{ proxyFirst: true }
		);
		await vi.advanceTimersByTimeAsync(5_000);
		const result = await promise;

		expect(result.status).toBe(502);
		const body = (await result.json()) as { detail: string };
		expect(body.detail).toContain("rate limited");
	});

	it("passes the submit response through unchanged on submit error", async () => {
		mockGetAuthToken.mockResolvedValue("tok");
		mockFetch.mockResolvedValueOnce(jsonResponse({ detail: "nope" }, 503));

		const response = await makeFalRequestQueued(
			"https://fal.run/openai/gpt-image-2",
			{ prompt: "x" },
			{ proxyFirst: true }
		);

		expect(response.status).toBe(503);
		expect(mockFetch).toHaveBeenCalledTimes(1); // no polls after a failed submit
	});

	it("rewrites a path-only endpoint into the full queue URL", async () => {
		mockGetAuthToken.mockResolvedValue("tok");
		mockFetch
			.mockResolvedValueOnce(
				jsonResponse({
					request_id: "req-path",
					status_url:
						"https://queue.fal.run/fal-ai/imagen4/preview/ultra/requests/req-path/status",
					response_url:
						"https://queue.fal.run/fal-ai/imagen4/preview/ultra/requests/req-path",
				})
			)
			.mockResolvedValueOnce(jsonResponse({ status: "COMPLETED" }))
			.mockResolvedValueOnce(jsonResponse({ images: [{ url: "u" }] }));

		const promise = makeFalRequestQueued(
			"fal-ai/imagen4/preview/ultra",
			{ prompt: "x" },
			{ proxyFirst: true }
		);
		await vi.advanceTimersByTimeAsync(6_000);
		await promise;

		const submitBody = JSON.parse(mockFetch.mock.calls[0][1].body);
		expect(submitBody.endpoint).toBe(
			"https://queue.fal.run/fal-ai/imagen4/preview/ultra"
		);
	});
});
