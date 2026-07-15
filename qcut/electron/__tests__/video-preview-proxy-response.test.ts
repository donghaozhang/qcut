import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createVideoPreviewProxyResponse,
	videoPreviewProxyResponseTestUtils,
} from "../ffmpeg/video-preview-proxy-response";

let testDir = "";
let videoPath = "";

beforeEach(() => {
	testDir = fs.mkdtempSync(path.join(os.tmpdir(), "qcut-proxy-response-"));
	videoPath = path.join(testDir, "proxy.mp4");
	fs.writeFileSync(
		videoPath,
		Buffer.from(Array.from({ length: 100 }, (_, index) => index))
	);
});

afterEach(() => {
	fs.rmSync(testDir, { recursive: true, force: true });
});

describe("video preview proxy response", () => {
	it("streams valid byte ranges as partial MP4 responses", async () => {
		const response = createVideoPreviewProxyResponse({
			request: new Request("https://qcut.local/proxy.mp4", {
				headers: { Range: "bytes=10-19" },
			}),
			filePath: videoPath,
		});

		expect(response.status).toBe(206);
		expect(response.headers.get("accept-ranges")).toBe("bytes");
		expect(response.headers.get("content-range")).toBe("bytes 10-19/100");
		expect(response.headers.get("content-length")).toBe("10");
		expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([
			10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
		]);
	});

	it("supports suffix ranges and rejects unsatisfiable ranges", () => {
		expect(
			videoPreviewProxyResponseTestUtils.parseByteRange({
				header: "bytes=-8",
				fileSize: 100,
			})
		).toEqual({ start: 92, end: 99 });
		const response = createVideoPreviewProxyResponse({
			request: new Request("https://qcut.local/proxy.mp4", {
				headers: { Range: "bytes=100-120" },
			}),
			filePath: videoPath,
		});

		expect(response.status).toBe(416);
		expect(response.headers.get("content-range")).toBe("bytes */100");
	});

	it("answers HEAD without opening a stream", () => {
		const response = createVideoPreviewProxyResponse({
			request: new Request("https://qcut.local/proxy.mp4", {
				method: "HEAD",
			}),
			filePath: videoPath,
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("content-length")).toBe("100");
		expect(response.body).toBeNull();
	});
});
