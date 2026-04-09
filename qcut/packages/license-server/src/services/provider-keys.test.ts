import { afterEach, describe, expect, it } from "vitest";
import {
	buildProviderAuthHeaders,
	getProviderKey,
	isEndpointAllowed,
	isValidProvider,
} from "./provider-keys";

const ORIGINAL_ENV = { ...process.env };

function resetEnv(): void {
	for (const key of Object.keys(process.env)) {
		if (!(key in ORIGINAL_ENV)) {
			delete process.env[key];
		}
	}
	for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
		process.env[key] = value;
	}
}

afterEach(() => {
	resetEnv();
});

describe("isValidProvider", () => {
	it("accepts known providers", () => {
		expect(isValidProvider("fal")).toBe(true);
		expect(isValidProvider("gemini")).toBe(true);
		expect(isValidProvider("openrouter")).toBe(true);
		expect(isValidProvider("elevenlabs")).toBe(true);
		expect(isValidProvider("gmi")).toBe(true);
		expect(isValidProvider("runway")).toBe(true);
		expect(isValidProvider("freesound")).toBe(true);
	});

	it("rejects unknown providers", () => {
		expect(isValidProvider("openai")).toBe(false);
		expect(isValidProvider("")).toBe(false);
		expect(isValidProvider("FAL")).toBe(false);
	});
});

describe("getProviderKey", () => {
	it("reads key from env var", () => {
		process.env.FAL_API_KEY = "fal-key-123";
		expect(getProviderKey("fal")).toBe("fal-key-123");
	});

	it("returns undefined when env var is missing", () => {
		delete process.env.GEMINI_API_KEY;
		expect(getProviderKey("gemini")).toBeUndefined();
	});

	it("returns undefined for empty string", () => {
		process.env.FAL_API_KEY = "  ";
		expect(getProviderKey("fal")).toBeUndefined();
	});
});

describe("buildProviderAuthHeaders", () => {
	it("builds FAL headers with Key prefix", () => {
		process.env.FAL_API_KEY = "fal-key";
		const headers = buildProviderAuthHeaders("fal");
		expect(headers).toEqual({ Authorization: "Key fal-key" });
	});

	it("builds Gemini headers with x-goog-api-key", () => {
		process.env.GEMINI_API_KEY = "gem-key";
		const headers = buildProviderAuthHeaders("gemini");
		expect(headers).toEqual({ "x-goog-api-key": "gem-key" });
	});

	it("builds Runway headers with Bearer and version", () => {
		process.env.RUNWAY_API_KEY = "rw-key";
		const headers = buildProviderAuthHeaders("runway");
		expect(headers).toEqual({
			Authorization: "Bearer rw-key",
			"X-Runway-Version": "2024-11-06",
		});
	});

	it("builds ElevenLabs headers with xi-api-key", () => {
		process.env.ELEVENLABS_API_KEY = "el-key";
		const headers = buildProviderAuthHeaders("elevenlabs");
		expect(headers).toEqual({ "xi-api-key": "el-key" });
	});

	it("returns null when key is not set", () => {
		delete process.env.FAL_API_KEY;
		expect(buildProviderAuthHeaders("fal")).toBeNull();
	});
});

describe("isEndpointAllowed", () => {
	it("allows FAL queue URLs", () => {
		expect(
			isEndpointAllowed({
				provider: "fal",
				url: "https://queue.fal.run/fal-ai/kling-video/v2",
			})
		).toBe(true);
	});

	it("allows FAL storage URLs", () => {
		expect(
			isEndpointAllowed({
				provider: "fal",
				url: "https://rest.alpha.fal.ai/storage/upload/initiate",
			})
		).toBe(true);
	});

	it("rejects cross-provider URLs", () => {
		expect(
			isEndpointAllowed({
				provider: "fal",
				url: "https://api.openai.com/v1/chat",
			})
		).toBe(false);
	});

	it("rejects path traversal attempts", () => {
		expect(
			isEndpointAllowed({
				provider: "fal",
				url: "https://evil.com/?redirect=https://queue.fal.run/",
			})
		).toBe(false);
	});

	it("allows Gemini URLs", () => {
		expect(
			isEndpointAllowed({
				provider: "gemini",
				url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent",
			})
		).toBe(true);
	});
});
