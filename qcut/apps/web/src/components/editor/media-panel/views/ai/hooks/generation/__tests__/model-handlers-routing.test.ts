import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initPlatform } from "@qcut/platform-core";
import { createWebAdapter } from "@qcut/platform-web";
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
import * as imageToVideoHandlers from "../handlers/image-to-video-handlers";
import * as imageToVideoHandlersGmi from "../handlers/image-to-video-handlers-gmi";

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
	handleGmiVeoLiteT2V: vi.fn().mockResolvedValue({ response: undefined }),
	handleSkyreelsV4T2V: vi.fn().mockResolvedValue({ response: undefined }),
	handleGmiKlingV3T2V: vi.fn().mockResolvedValue({ response: undefined }),
	handleGmiKlingOmniT2V: vi.fn().mockResolvedValue({ response: undefined }),
}));

vi.mock("../handlers/image-to-video-handlers", () => ({
	handleVeo31FastI2V: vi.fn().mockResolvedValue({ response: undefined }),
	handleVeo31I2V: vi.fn().mockResolvedValue({ response: undefined }),
	handleVeo31FastF2V: vi.fn().mockResolvedValue({
		response: undefined,
		shouldSkip: true,
		skipReason: "frame-to-video requires selected first and last frames",
	}),
	handleVeo31F2V: vi.fn().mockResolvedValue({
		response: undefined,
		shouldSkip: true,
		skipReason: "frame-to-video requires selected first and last frames",
	}),
	handleVeo31LiteI2V: vi.fn().mockResolvedValue({ response: undefined }),
	handleVeo31LiteF2V: vi.fn().mockResolvedValue({ response: undefined }),
	handleViduQ2I2V: vi.fn().mockResolvedValue({ response: undefined }),
	handleLTXV2I2V: vi.fn().mockResolvedValue({ response: undefined }),
	handleLTXV2FastI2V: vi.fn().mockResolvedValue({ response: undefined }),
	handleLTX23FastI2V: vi.fn().mockResolvedValue({ response: undefined }),
	handleSeedanceProFastI2V: vi.fn().mockResolvedValue({ response: undefined }),
	handleSeedanceProI2V: vi.fn().mockResolvedValue({ response: undefined }),
	handleKlingV25I2V: vi.fn().mockResolvedValue({ response: undefined }),
	handleKlingV26I2V: vi.fn().mockResolvedValue({ response: undefined }),
}));

vi.mock("../handlers/image-to-video-handlers-gmi", () => ({
	handleGmiVeoLiteI2V: vi.fn().mockResolvedValue({ response: undefined }),
	handleSkyreelsV4I2V: vi.fn().mockResolvedValue({ response: undefined }),
	handleGmiKlingV3I2V: vi.fn().mockResolvedValue({ response: undefined }),
	handleGmiKlingOmniI2V: vi.fn().mockResolvedValue({ response: undefined }),
	handleGmiKlingMotionControl: vi
		.fn()
		.mockResolvedValue({ response: undefined }),
}));

vi.mock("@/lib/license/credit-guard", () => ({
	enforceCreditRequirement: vi
		.fn()
		.mockResolvedValue({ allowed: true, requiredCredits: 0 }),
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

beforeAll(() => {
	initPlatform(createWebAdapter());
});

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

	// GMI T2V routing
	it.each([
		["gmi_veo31_lite_t2v", "handleGmiVeoLiteT2V"],
		["gmi_skyreels_v4_t2v", "handleSkyreelsV4T2V"],
		["gmi_kling_v3_t2v", "handleGmiKlingV3T2V"],
		["gmi_kling_v3_omni_t2v", "handleGmiKlingOmniT2V"],
	] as const)("routeTextToVideoHandler maps %s to %s", async (modelId, handlerName) => {
		const mock = vi.mocked(
			textToVideoHandlers[
				handlerName as keyof typeof textToVideoHandlers
			] as ReturnType<typeof vi.fn>
		);
		await routeTextToVideoHandler(
			createContext({ modelId }),
			{} as TextToVideoSettings
		);
		expect(mock).toHaveBeenCalledTimes(1);
	});

	// GMI I2V routing
	it.each([
		["gmi_veo31_lite_i2v", "handleGmiVeoLiteI2V"],
		["gmi_skyreels_v4_i2v", "handleSkyreelsV4I2V"],
		["gmi_kling_v3_i2v", "handleGmiKlingV3I2V"],
		["gmi_kling_v3_omni_i2v", "handleGmiKlingOmniI2V"],
		["gmi_kling_motion_control", "handleGmiKlingMotionControl"],
	] as const)("routeImageToVideoHandler maps %s to %s", async (modelId, handlerName) => {
		const mock = vi.mocked(
			imageToVideoHandlersGmi[
				handlerName as keyof typeof imageToVideoHandlersGmi
			] as ReturnType<typeof vi.fn>
		);
		await routeImageToVideoHandler(createContext({ modelId }), {
			selectedImage: new File(["test"], "test.jpg"),
			uploadImageToFal: vi.fn().mockResolvedValue("https://fal.ai/img"),
		} as unknown as ImageToVideoSettings);
		expect(mock).toHaveBeenCalledTimes(1);
	});
});
