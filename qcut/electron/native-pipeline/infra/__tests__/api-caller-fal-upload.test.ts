import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	fetch: vi.fn(),
	isProxyAvailable: vi.fn(),
	proxyUploadUrl: vi.fn(),
}));
const originalFetch = globalThis.fetch;
const originalFalKey = process.env.FAL_KEY;
const originalFalApiKey = process.env.FAL_API_KEY;

vi.mock("../proxy-client.js", async () => {
	const actual =
		await vi.importActual<typeof import("../proxy-client.js")>(
			"../proxy-client.js"
		);
	return {
		...actual,
		isProxyAvailable: mocks.isProxyAvailable,
		proxyUploadUrl: mocks.proxyUploadUrl,
	};
});

vi.mock("../../api-key-handler.js", () => ({
	getDecryptedApiKeys: vi.fn().mockResolvedValue({}),
}));

import {
	envApiKeyProvider,
	setApiKeyProvider,
	uploadToFalStorage,
} from "../api-caller.js";

function mockResponse({
	ok,
	status,
	json,
	text = "",
}: {
	ok: boolean;
	status: number;
	json?: unknown;
	text?: string;
}): Response {
	return {
		ok,
		status,
		json: async () => json,
		text: async () => text,
	} as Response;
}

function writeFixture(): { dir: string; path: string } {
	const dir = mkdtempSync(join(tmpdir(), "qcut-fal-upload-"));
	const path = join(dir, "reference.png");
	writeFileSync(path, Buffer.from([1, 2, 3]));
	return { dir, path };
}

describe("uploadToFalStorage", () => {
	beforeEach(() => {
		globalThis.fetch = mocks.fetch as unknown as typeof fetch;
		vi.clearAllMocks();
		setApiKeyProvider(envApiKeyProvider);
		delete process.env.FAL_KEY;
		delete process.env.FAL_API_KEY;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		if (originalFalKey === undefined) delete process.env.FAL_KEY;
		else process.env.FAL_KEY = originalFalKey;
		if (originalFalApiKey === undefined) delete process.env.FAL_API_KEY;
		else process.env.FAL_API_KEY = originalFalApiKey;
	});

	it("falls back to direct FAL upload when proxy URL vending fails and FAL_KEY is available", async () => {
		process.env.FAL_KEY = "sandbox-fal-key";
		mocks.isProxyAvailable.mockResolvedValue(true);
		mocks.proxyUploadUrl.mockRejectedValue(
			new Error("Upload URL request failed (401): invalid token")
		);
		mocks.fetch
			.mockResolvedValueOnce(
				mockResponse({
					ok: true,
					status: 200,
					json: {
						upload_url: "https://fal.direct/upload/reference.png",
						file_url: "https://fal.direct/files/reference.png",
					},
				})
			)
			.mockResolvedValueOnce(mockResponse({ ok: true, status: 200 }));
		const fixture = writeFixture();

		try {
			const result = await uploadToFalStorage(fixture.path);

			expect(result).toEqual({
				success: true,
				url: "https://fal.direct/files/reference.png",
			});
			expect(mocks.proxyUploadUrl).toHaveBeenCalledWith({
				fileName: "reference.png",
				contentType: "image/png",
			});
			const [initUrl, init] = mocks.fetch.mock.calls[0];
			expect(String(initUrl)).toContain(
				"rest.alpha.fal.ai/storage/upload/initiate"
			);
			expect((init as RequestInit).method).toBe("POST");
			const headers = (init as RequestInit).headers as Record<string, string>;
			expect(headers.Authorization).toBe("Key sandbox-fal-key");
			const [, put] = mocks.fetch.mock.calls[1];
			expect((put as RequestInit).method).toBe("PUT");
		} finally {
			rmSync(fixture.dir, { recursive: true, force: true });
		}
	});

	it("does not attempt direct FAL upload after proxy failure when no local FAL key exists", async () => {
		mocks.isProxyAvailable.mockResolvedValue(true);
		mocks.proxyUploadUrl.mockRejectedValue(
			new Error("Upload URL request failed (401): invalid token")
		);
		const fixture = writeFixture();

		try {
			const result = await uploadToFalStorage(fixture.path);

			expect(result.success).toBe(false);
			expect(result.error).toContain("Upload URL request failed (401)");
			expect(mocks.fetch).not.toHaveBeenCalled();
		} finally {
			rmSync(fixture.dir, { recursive: true, force: true });
		}
	});
});
