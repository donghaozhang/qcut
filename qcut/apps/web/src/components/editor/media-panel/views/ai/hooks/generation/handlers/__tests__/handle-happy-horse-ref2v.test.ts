import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai-clients/fal-ai-client", () => ({
	falAIClient: {
		uploadImageToFal: vi.fn(),
	},
}));

vi.mock("@/lib/ai-video", () => ({
	generateAvatarVideo: vi.fn(),
	generateKlingO1Video: vi.fn(),
	generateWAN26RefVideo: vi.fn(),
}));

vi.mock("@/lib/ai-video/generators/happy-horse-generators", () => ({
	generateHappyHorseRef2V: vi.fn(),
}));

import { generateHappyHorseRef2V } from "@/lib/ai-video/generators/happy-horse-generators";
import { handleHappyHorseRef2V } from "../avatar-handlers";
import type {
	AvatarSettings,
	ModelHandlerContext,
} from "../../model-handler-types";

const mockedGenerate = vi.mocked(generateHappyHorseRef2V);

interface ProgressCall {
	status?: string;
	progress?: number;
	message?: string;
}

function makeCtx(): ModelHandlerContext & { progressCalls: ProgressCall[] } {
	const progressCalls: ProgressCall[] = [];
	return {
		prompt: "two characters dance",
		modelId: "happy_horse_ref2v",
		modelName: "Alibaba Happy Horse Ref2V",
		progressCallback: (status) => {
			progressCalls.push({
				status: status.status,
				progress: status.progress,
				message: status.message,
			});
		},
		progressCalls,
	};
}

function makeSettings(
	overrides: Partial<AvatarSettings> = {}
): AvatarSettings {
	const uploadImageToFal = vi.fn(
		async (file: File) => `https://fal.storage/${file.name}`
	);
	const uploadAudioToFal = vi.fn(async () => "https://fal.storage/audio");
	return {
		avatarImage: null,
		audioFile: null,
		sourceVideo: null,
		referenceImages: [],
		klingAvatarV2Prompt: "",
		audioDuration: null,
		uploadImageToFal,
		uploadAudioToFal,
		...overrides,
	};
}

function imageFile(name: string): File {
	return new File(["x"], name, { type: "image/png" });
}

beforeEach(() => {
	vi.clearAllMocks();
	mockedGenerate.mockResolvedValue({
		job_id: "j1",
		status: "completed",
		message: "ok",
		estimated_time: 0,
		video_url: "https://fal.example/out.mp4",
		video_data: {},
	} as Awaited<ReturnType<typeof generateHappyHorseRef2V>>);
});

describe("handleHappyHorseRef2V", () => {
	it("skips when no reference images are provided", async () => {
		const ctx = makeCtx();
		const result = await handleHappyHorseRef2V(ctx, makeSettings());

		expect(result.shouldSkip).toBe(true);
		expect(result.skipReason).toMatch(/at least one reference image/);
		expect(mockedGenerate).not.toHaveBeenCalled();
	});

	it("skips when referenceImages is all-null (filtered to empty)", async () => {
		const ctx = makeCtx();
		const result = await handleHappyHorseRef2V(
			ctx,
			makeSettings({ referenceImages: [null, null] })
		);
		expect(result.shouldSkip).toBe(true);
		expect(mockedGenerate).not.toHaveBeenCalled();
	});

	it("uploads images in parallel and forwards image_urls + prompt to the generator", async () => {
		const settings = makeSettings({
			referenceImages: [imageFile("a.png"), imageFile("b.png")],
		});

		const ctx = makeCtx();
		const result = await handleHappyHorseRef2V(ctx, settings);

		expect(settings.uploadImageToFal).toHaveBeenCalledTimes(2);
		expect(mockedGenerate).toHaveBeenCalledWith(
			expect.objectContaining({
				model: "happy_horse_ref2v",
				prompt: "two characters dance",
				image_urls: [
					"https://fal.storage/a.png",
					"https://fal.storage/b.png",
				],
			})
		);
		expect(result.shouldSkip).toBeFalsy();
		expect(result.response?.video_url).toBe("https://fal.example/out.mp4");
	});

	it("forwards user-selected duration / resolution / aspect_ratio", async () => {
		const settings = makeSettings({
			referenceImages: [imageFile("a.png")],
			happyHorseRef2vDuration: 10,
			happyHorseRef2vResolution: "720p",
			happyHorseRef2vAspectRatio: "9:16",
		});

		await handleHappyHorseRef2V(makeCtx(), settings);

		expect(mockedGenerate).toHaveBeenCalledWith(
			expect.objectContaining({
				duration: 10,
				resolution: "720p",
				aspect_ratio: "9:16",
			})
		);
	});

	it("leaves duration/resolution/aspect_ratio undefined when settings omit them (generator applies defaults)", async () => {
		const settings = makeSettings({
			referenceImages: [imageFile("a.png")],
		});

		await handleHappyHorseRef2V(makeCtx(), settings);

		const call = mockedGenerate.mock.calls[0][0];
		expect(call.duration).toBeUndefined();
		expect(call.resolution).toBeUndefined();
		expect(call.aspect_ratio).toBeUndefined();
	});

	it("caps reference images at 9 when more are supplied", async () => {
		const settings = makeSettings({
			referenceImages: Array.from({ length: 12 }, (_, i) =>
				imageFile(`img${i}.png`)
			),
		});

		await handleHappyHorseRef2V(makeCtx(), settings);

		expect(settings.uploadImageToFal).toHaveBeenCalledTimes(9);
		const call = mockedGenerate.mock.calls[0][0];
		expect(call.image_urls).toHaveLength(9);
	});

	it("fires progress callbacks at 5 (upload), 25 (submit), 100 (done)", async () => {
		const ctx = makeCtx();
		await handleHappyHorseRef2V(
			ctx,
			makeSettings({ referenceImages: [imageFile("a.png")] })
		);

		const progressValues = ctx.progressCalls.map((c) => c.progress);
		expect(progressValues).toEqual([5, 25, 100]);
		expect(ctx.progressCalls.at(-1)?.status).toBe("completed");
	});

	it("captures generator errors as shouldSkip with descriptive reason", async () => {
		mockedGenerate.mockRejectedValue(new Error("FAL went boom"));

		const ctx = makeCtx();
		const result = await handleHappyHorseRef2V(
			ctx,
			makeSettings({ referenceImages: [imageFile("a.png")] })
		);

		expect(result.shouldSkip).toBe(true);
		expect(result.skipReason).toMatch(
			/Alibaba Happy Horse Ref2V failed: FAL went boom/
		);
	});

	it("captures upload errors as shouldSkip — never bubbles", async () => {
		const settings = makeSettings({
			referenceImages: [imageFile("a.png")],
		});
		(settings.uploadImageToFal as ReturnType<typeof vi.fn>).mockRejectedValue(
			new Error("upload network error")
		);

		const ctx = makeCtx();
		const result = await handleHappyHorseRef2V(ctx, settings);

		expect(result.shouldSkip).toBe(true);
		expect(result.skipReason).toMatch(/upload network error/);
		expect(mockedGenerate).not.toHaveBeenCalled();
	});

	it("captures non-Error throws with 'Unknown error' fallback", async () => {
		mockedGenerate.mockRejectedValue("string-thrown");

		const ctx = makeCtx();
		const result = await handleHappyHorseRef2V(
			ctx,
			makeSettings({ referenceImages: [imageFile("a.png")] })
		);

		expect(result.shouldSkip).toBe(true);
		expect(result.skipReason).toMatch(/Unknown error/);
	});
});
