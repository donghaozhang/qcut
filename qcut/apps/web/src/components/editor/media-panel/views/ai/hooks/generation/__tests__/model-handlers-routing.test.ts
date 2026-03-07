import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
	AvatarSettings,
	ImageToVideoSettings,
	ModelHandlerContext,
	TextToVideoSettings,
} from "../model-handler-types";
import {
	routeAvatarHandler,
	routeImageToVideoHandler,
	routeTextToVideoHandler,
} from "../model-handlers";
import * as avatarHandlers from "../handlers/avatar-handlers";
import * as textToVideoHandlers from "../handlers/text-to-video-handlers";

vi.mock("../handlers/text-to-video-handlers", () => ({
	handleVeo31FastT2V: vi.fn().mockResolvedValue({ response: undefined }),
	handleVeo31T2V: vi.fn().mockResolvedValue({ response: undefined }),
	handleHailuo23T2V: vi.fn().mockResolvedValue({ response: undefined }),
	handleLTXV2ProT2V: vi.fn().mockResolvedValue({ response: undefined }),
	handleLTXV2FastT2V: vi.fn().mockResolvedValue({ response: undefined }),
	handleLTX23ProT2V: vi.fn().mockResolvedValue({ response: undefined }),
	handleLTX23FastT2V: vi.fn().mockResolvedValue({ response: undefined }),
	handleViduQ3T2V: vi.fn().mockResolvedValue({ response: undefined }),
	handleWAN26T2V: vi.fn().mockResolvedValue({ response: undefined }),
	handleGenericT2V: vi.fn().mockResolvedValue({ response: undefined }),
}));

vi.mock("../handlers/avatar-handlers", () => ({
	handleKlingO1Ref2Video: vi.fn().mockResolvedValue({ response: undefined }),
	handleWAN26Ref2Video: vi.fn().mockResolvedValue({ response: undefined }),
	handleKlingO1V2V: vi.fn().mockResolvedValue({ response: undefined }),
	handleKlingAvatarV2: vi.fn().mockResolvedValue({ response: undefined }),
	handleGenericAvatar: vi.fn().mockResolvedValue({ response: undefined }),
	handleSyncLipsyncReact1: vi.fn().mockResolvedValue({ response: undefined }),
	handleVeo31FastExtendVideo: vi
		.fn()
		.mockResolvedValue({ response: undefined }),
	handleVeo31ExtendVideo: vi.fn().mockResolvedValue({ response: undefined }),
}));

function createContext({ modelId }: { modelId: string }): ModelHandlerContext {
	return {
		prompt: "test prompt",
		modelId,
		modelName: "test model",
		progressCallback: vi.fn(),
	};
}

describe("model handler routing regression", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("routeTextToVideoHandler maps wan_26_t2v to WAN handler", async () => {
		const handleWAN26T2VMock = vi.mocked(textToVideoHandlers.handleWAN26T2V);
		await routeTextToVideoHandler(
			createContext({ modelId: "wan_26_t2v" }),
			{} as TextToVideoSettings
		);

		expect(handleWAN26T2VMock).toHaveBeenCalledTimes(1);
	});

	it("routeImageToVideoHandler returns skip for frame model when frames are missing", async () => {
		const result = await routeImageToVideoHandler(
			createContext({ modelId: "veo31_fast_frame_to_video" }),
			{
				firstFrame: null,
				lastFrame: null,
			} as ImageToVideoSettings
		);

		expect(result.shouldSkip).toBe(true);
		expect(result.skipReason).toBe(
			"frame-to-video requires selected first and last frames"
		);
	});

	it("routeTextToVideoHandler maps ltx23_pro_t2v to LTX 2.3 Pro handler", async () => {
		const mock = vi.mocked(textToVideoHandlers.handleLTX23ProT2V);
		await routeTextToVideoHandler(
			createContext({ modelId: "ltx23_pro_t2v" }),
			{} as TextToVideoSettings
		);
		expect(mock).toHaveBeenCalledTimes(1);
	});

	it("routeTextToVideoHandler maps ltx23_fast_t2v to LTX 2.3 Fast handler", async () => {
		const mock = vi.mocked(textToVideoHandlers.handleLTX23FastT2V);
		await routeTextToVideoHandler(
			createContext({ modelId: "ltx23_fast_t2v" }),
			{} as TextToVideoSettings
		);
		expect(mock).toHaveBeenCalledTimes(1);
	});

	it("routeAvatarHandler unknown model falls back to generic", async () => {
		const handleGenericAvatarMock = vi.mocked(
			avatarHandlers.handleGenericAvatar
		);
		await routeAvatarHandler(
			createContext({ modelId: "unknown_avatar_model" }),
			{} as AvatarSettings
		);

		expect(handleGenericAvatarMock).toHaveBeenCalledTimes(1);
	});
});
