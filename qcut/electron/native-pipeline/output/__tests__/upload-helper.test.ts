/**
 * @vitest-environment node
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	inferContentType,
	uploadFileForReference,
	UploadError,
} from "../upload-helper.js";

// Work in a throwaway tmp dir per suite so tests don't leak files.
const tmpRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "qcut-upload-helper-test-")
);

function writeFixture(name: string, bytes: Uint8Array | string): string {
	const p = path.join(tmpRoot, name);
	fs.writeFileSync(p, bytes);
	return p;
}

function mockResponse(
	status: number,
	body: unknown,
	opts: { ok?: boolean } = {}
): Response {
	const text =
		typeof body === "string" ? body : body == null ? "" : JSON.stringify(body);
	return {
		ok: opts.ok ?? (status >= 200 && status < 300),
		status,
		statusText: String(status),
		text: async () => text,
	} as unknown as Response;
}

const ORIGINAL_FAL_KEY = process.env.FAL_KEY;
const ORIGINAL_FAL_API_KEY = process.env.FAL_API_KEY;

beforeEach(() => {
	process.env.QCUT_AUTH_TOKEN = "test-token";
	delete process.env.FAL_KEY;
	delete process.env.FAL_API_KEY;
});

afterEach(() => {
	vi.restoreAllMocks();
	if (ORIGINAL_FAL_KEY === undefined) delete process.env.FAL_KEY;
	else process.env.FAL_KEY = ORIGINAL_FAL_KEY;
	if (ORIGINAL_FAL_API_KEY === undefined) delete process.env.FAL_API_KEY;
	else process.env.FAL_API_KEY = ORIGINAL_FAL_API_KEY;
});

describe("inferContentType", () => {
	it("maps known extensions", () => {
		expect(inferContentType("a.png")).toBe("image/png");
		expect(inferContentType("a.JPG")).toBe("image/jpeg");
		expect(inferContentType("a.mp4")).toBe("video/mp4");
		expect(inferContentType("a.wav")).toBe("audio/wav");
	});

	it("falls back to octet-stream for unknown extensions", () => {
		expect(inferContentType("a.unknown")).toBe("application/octet-stream");
		expect(inferContentType("no-extension")).toBe("application/octet-stream");
	});
});

describe("uploadFileForReference", () => {
	it("uploads via two-step vend + PUT and returns fileUrl", async () => {
		const file = writeFixture("portrait.png", new Uint8Array([1, 2, 3, 4, 5]));
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(
				mockResponse(200, {
					uploadUrl: "https://fal.storage/put/abc",
					fileUrl: "https://fal.storage/files/abc.png",
				})
			)
			.mockResolvedValueOnce(mockResponse(200, ""));

		const res = await uploadFileForReference({
			filePath: file,
			fetchImpl: fetchImpl as unknown as typeof fetch,
			authToken: "explicit-token",
		});

		expect(res.url).toBe("https://fal.storage/files/abc.png");
		expect(res.contentType).toBe("image/png");
		expect(res.bytes).toBe(5);

		expect(fetchImpl).toHaveBeenCalledTimes(2);
		const [vendUrl, vendInit] = fetchImpl.mock.calls[0];
		expect(vendUrl).toMatch(/\/api\/ai\/upload-url$/);
		expect(vendInit.method).toBe("POST");
		expect(vendInit.headers["Authorization"]).toBe("Bearer explicit-token");
		const vendBody = JSON.parse(vendInit.body);
		expect(vendBody).toEqual({
			provider: "fal",
			fileName: "portrait.png",
			contentType: "image/png",
			fileSize: 5,
		});

		const [putUrl, putInit] = fetchImpl.mock.calls[1];
		expect(putUrl).toBe("https://fal.storage/put/abc");
		expect(putInit.method).toBe("PUT");
		expect(putInit.headers["Content-Type"]).toBe("image/png");
	});

	it("respects explicit contentType override", async () => {
		const file = writeFixture("x.bin", new Uint8Array([1, 2]));
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(
				mockResponse(200, {
					uploadUrl: "https://fal.storage/put/x",
					fileUrl: "https://fal.storage/files/x",
				})
			)
			.mockResolvedValueOnce(mockResponse(200, ""));

		await uploadFileForReference({
			filePath: file,
			fetchImpl: fetchImpl as unknown as typeof fetch,
			authToken: "t",
			contentType: "image/webp",
		});
		const [, vendInit] = fetchImpl.mock.calls[0];
		expect(JSON.parse(vendInit.body).contentType).toBe("image/webp");
		const [, putInit] = fetchImpl.mock.calls[1];
		expect(putInit.headers["Content-Type"]).toBe("image/webp");
	});

	it("retries vend on 5xx and succeeds on second attempt", async () => {
		const file = writeFixture("retry.png", new Uint8Array([7, 8]));
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(mockResponse(502, { error: "upstream" }))
			.mockResolvedValueOnce(
				mockResponse(200, {
					uploadUrl: "https://fal.storage/put/r",
					fileUrl: "https://fal.storage/files/r.png",
				})
			)
			.mockResolvedValueOnce(mockResponse(200, ""));

		const res = await uploadFileForReference({
			filePath: file,
			fetchImpl: fetchImpl as unknown as typeof fetch,
			authToken: "t",
		});
		expect(res.url).toBe("https://fal.storage/files/r.png");
		expect(fetchImpl).toHaveBeenCalledTimes(3);
	});

	it("fails after two vend 5xx attempts", async () => {
		const file = writeFixture("retry2.png", new Uint8Array([1]));
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(mockResponse(503, { error: "down" }));

		await expect(
			uploadFileForReference({
				filePath: file,
				fetchImpl: fetchImpl as unknown as typeof fetch,
				authToken: "t",
			})
		).rejects.toMatchObject({
			name: "UploadError",
			stage: "vend-url",
		});
		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});

	it("fails fast on 4xx (no retry)", async () => {
		const file = writeFixture("bad.png", new Uint8Array([1]));
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(mockResponse(413, { error: "too big" }));

		await expect(
			uploadFileForReference({
				filePath: file,
				fetchImpl: fetchImpl as unknown as typeof fetch,
				authToken: "t",
			})
		).rejects.toMatchObject({
			name: "UploadError",
			stage: "vend-url",
			status: 413,
		});
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it("throws before any fetch when file does not exist", async () => {
		const fetchImpl = vi.fn();
		await expect(
			uploadFileForReference({
				filePath: path.join(tmpRoot, "does-not-exist.png"),
				fetchImpl: fetchImpl as unknown as typeof fetch,
				authToken: "t",
			})
		).rejects.toMatchObject({
			name: "UploadError",
			stage: "preflight",
		});
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("throws before any fetch when file is empty", async () => {
		const file = writeFixture("empty.png", "");
		const fetchImpl = vi.fn();
		await expect(
			uploadFileForReference({
				filePath: file,
				fetchImpl: fetchImpl as unknown as typeof fetch,
				authToken: "t",
			})
		).rejects.toMatchObject({
			name: "UploadError",
			stage: "preflight",
		});
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("throws when no auth token is available", async () => {
		const file = writeFixture("no-auth.png", new Uint8Array([1]));
		const fetchImpl = vi.fn();
		await expect(
			uploadFileForReference({
				filePath: file,
				fetchImpl: fetchImpl as unknown as typeof fetch,
				authToken: "",
			})
		).rejects.toMatchObject({
			name: "UploadError",
			stage: "preflight",
		});
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("surfaces PUT failures with status", async () => {
		const file = writeFixture("put-fail.png", new Uint8Array([1, 2]));
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(
				mockResponse(200, {
					uploadUrl: "https://fal.storage/put/p",
					fileUrl: "https://fal.storage/files/p.png",
				})
			)
			.mockResolvedValueOnce(mockResponse(500, "internal"));

		await expect(
			uploadFileForReference({
				filePath: file,
				fetchImpl: fetchImpl as unknown as typeof fetch,
				authToken: "t",
			})
		).rejects.toMatchObject({
			name: "UploadError",
			stage: "put",
			status: 500,
		});
	});

	it("falls back to direct FAL when proxy vend returns 4xx and FAL_KEY is set", async () => {
		process.env.FAL_KEY = "fal-direct-key";
		const file = writeFixture("fallback.png", new Uint8Array([1, 2, 3]));
		const fetchImpl = vi
			.fn()
			// Proxy vend → fails fast on 4xx
			.mockResolvedValueOnce(
				mockResponse(500, { error: "FAL API key not configured on server" })
			)
			.mockResolvedValueOnce(
				mockResponse(500, { error: "FAL API key not configured on server" })
			)
			// Direct FAL initiate
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				statusText: "200",
				json: async () => ({
					upload_url: "https://fal.direct/put/x",
					file_url: "https://fal.direct/files/x.png",
				}),
				text: async () =>
					JSON.stringify({
						upload_url: "https://fal.direct/put/x",
						file_url: "https://fal.direct/files/x.png",
					}),
			} as unknown as Response)
			// PUT bytes
			.mockResolvedValueOnce(mockResponse(200, ""));

		const res = await uploadFileForReference({
			filePath: file,
			fetchImpl: fetchImpl as unknown as typeof fetch,
			authToken: "t",
		});

		expect(res.url).toBe("https://fal.direct/files/x.png");
		expect(fetchImpl).toHaveBeenCalledTimes(4);

		const [initUrl, initInit] = fetchImpl.mock.calls[2];
		expect(String(initUrl)).toContain(
			"rest.alpha.fal.ai/storage/upload/initiate"
		);
		expect((initInit as RequestInit).method).toBe("POST");
		const headers = (initInit as RequestInit).headers as Record<string, string>;
		expect(headers.Authorization).toBe("Key fal-direct-key");
	});

	it("does NOT fall back when proxy vend fails and no FAL_KEY in env", async () => {
		const file = writeFixture("nofallback.png", new Uint8Array([1, 2]));
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(
				mockResponse(500, { error: "FAL API key not configured on server" })
			);

		await expect(
			uploadFileForReference({
				filePath: file,
				fetchImpl: fetchImpl as unknown as typeof fetch,
				authToken: "t",
			})
		).rejects.toMatchObject({
			name: "UploadError",
			stage: "vend-url",
		});
		// 2 vend attempts, no direct FAL attempt
		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});

	it("is an instance of UploadError when it throws", async () => {
		const file = writeFixture("err.png", new Uint8Array([1]));
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(mockResponse(400, { error: "bad" }));
		await expect(
			uploadFileForReference({
				filePath: file,
				fetchImpl: fetchImpl as unknown as typeof fetch,
				authToken: "t",
			})
		).rejects.toBeInstanceOf(UploadError);
	});
});
