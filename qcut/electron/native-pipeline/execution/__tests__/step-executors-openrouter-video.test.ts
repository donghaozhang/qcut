import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../infra/api-caller.js", async () => {
	return {
		callModelApi: vi.fn(),
		downloadOutput: vi.fn(async (_url: string, dest: string) => dest),
		uploadToFalStorage: vi.fn(),
	};
});

import { callModelApi } from "../../infra/api-caller.js";
import { ModelRegistry } from "../../infra/registry.js";
import { registerImageUnderstandingModels } from "../../registry-data/image-understanding.js";
import { executeStep } from "../step-executors.js";

type ApiCall = {
	provider?: string;
	endpoint?: string;
	payload: Record<string, unknown>;
};

const mockedCallModelApi = callModelApi as unknown as {
	mockResolvedValue: (value: unknown) => void;
	mock: { calls: Array<[ApiCall]> };
};

function getContentItems({
	payload,
}: {
	payload: Record<string, unknown>;
}): Array<Record<string, unknown>> {
	const messages = payload.messages as Array<Record<string, unknown>>;
	return messages[0].content as Array<Record<string, unknown>>;
}

beforeEach(() => {
	if (!ModelRegistry.has("openrouter_gemini_3_5_flash_video")) {
		registerImageUnderstandingModels();
	}
	vi.clearAllMocks();
	mockedCallModelApi.mockResolvedValue({
		success: true,
		duration: 1,
		data: {
			choices: [{ message: { content: "short video description" } }],
		},
	});
});

describe("executeImageUnderstanding — OpenRouter video", () => {
	it("sends remote video input as OpenRouter chat-completions video content", async () => {
		const model = ModelRegistry.get("openrouter_gemini_3_5_flash_video");

		const result = await executeStep(
			model,
			{ videoUrl: "https://example.com/clip.mp4" },
			{ prompt: "Describe the clip" },
			{}
		);

		expect(result.text).toBe("short video description");
		const call = mockedCallModelApi.mock.calls[0][0];
		expect(call.provider).toBe("openrouter");
		expect(call.endpoint).toBe("chat/completions");
		expect(call.payload.model).toBe("google/gemini-3.5-flash");
		const content = getContentItems({ payload: call.payload });
		expect(content[0]).toEqual({ type: "text", text: "Describe the clip" });
		expect(content[1]).toEqual({
			type: "video_url",
			video_url: { url: "https://example.com/clip.mp4" },
		});
	});

	it("encodes local video input as a base64 data URL for OpenRouter", async () => {
		const dir = mkdtempSync(join(tmpdir(), "qcut-openrouter-video-"));
		const videoPath = join(dir, "clip.mp4");
		writeFileSync(videoPath, "fake-video");
		const model = ModelRegistry.get("openrouter_gemini_3_5_flash_video");

		await executeStep(
			model,
			{ videoUrl: videoPath },
			{ prompt: "Describe the local clip" },
			{}
		);

		const call = mockedCallModelApi.mock.calls[0][0];
		const content = getContentItems({ payload: call.payload });
		expect(content[1]).toEqual({
			type: "video_url",
			video_url: { url: "data:video/mp4;base64,ZmFrZS12aWRlbw==" },
		});
	});
});
