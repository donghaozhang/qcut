import {
	describe,
	it,
	expect,
	vi,
	beforeEach,
	afterEach,
	beforeAll,
} from "vitest";
import { initPlatform } from "@qcut/platform-core";
import { createWebAdapter } from "@qcut/platform-web";

beforeAll(() => {
	initPlatform(createWebAdapter());
});

const originalFetch = globalThis.fetch;

describe("Seeddream 4.5 Text-to-Image", () => {
	let generateSeeddream45Image: typeof import("@/lib/ai-clients/ai-video-client")["generateSeeddream45Image"];

	beforeEach(async () => {
		vi.restoreAllMocks();
		vi.clearAllMocks();

		// Set environment variable BEFORE importing the module
		(import.meta.env as any).VITE_FAL_API_KEY = "test-api-key";

		// Dynamically import the module AFTER setting the environment
		const aiVideoClient = await import("@/lib/ai-clients/ai-video-client");
		generateSeeddream45Image = aiVideoClient.generateSeeddream45Image;

		globalThis.fetch = originalFetch as typeof globalThis.fetch;
	});

	afterEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
		globalThis.fetch = originalFetch as typeof globalThis.fetch;
	});

	describe("Prompt Validation", () => {
		it("should reject empty prompts", async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: false,
				status: 400,
				text: async () => "Prompt is required",
			});
			globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

			// The function doesn't validate empty prompts before sending, API will reject
			await expect(generateSeeddream45Image({ prompt: "" })).rejects.toThrow();
		});

		it("should accept valid prompts", async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					images: [
						{
							url: "https://fal.ai/result.png",
							content_type: "image/png",
							file_name: "result.png",
							file_size: 1_024_000,
							width: 2048,
							height: 2048,
						},
					],
					seed: 12_345,
				}),
			});
			globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

			const result = await generateSeeddream45Image({
				prompt: "A serene mountain landscape at sunset",
			});

			expect(result.images).toHaveLength(1);
			expect(result.images[0].url).toBe("https://fal.ai/result.png");
			expect(result.seed).toBe(12_345);
		});
	});

	describe("Image Size Handling", () => {
		it("should use auto_2K as default image size", async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					images: [
						{ url: "https://fal.ai/result.png", width: 2048, height: 2048 },
					],
					seed: 12_345,
				}),
			});
			globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

			await generateSeeddream45Image({
				prompt: "Test prompt",
			});

			const [, options] = fetchMock.mock.calls[0];
			const callPayload = JSON.parse(
				(options as Record<string, unknown>).body as string
			);
			expect(callPayload.image_size).toBe("auto_2K");
		});

		it("should support auto_4K for high resolution output", async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					images: [
						{ url: "https://fal.ai/result.png", width: 4096, height: 4096 },
					],
					seed: 12_345,
				}),
			});
			globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

			await generateSeeddream45Image({
				prompt: "Test prompt",
				image_size: "auto_4K",
			});

			const [, options] = fetchMock.mock.calls[0];
			const callPayload = JSON.parse(
				(options as Record<string, unknown>).body as string
			);
			expect(callPayload.image_size).toBe("auto_4K");
		});

		it("should support preset aspect ratios", async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					images: [
						{ url: "https://fal.ai/result.png", width: 1920, height: 1080 },
					],
					seed: 12_345,
				}),
			});
			globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

			await generateSeeddream45Image({
				prompt: "Test prompt",
				image_size: "landscape_16_9",
			});

			const [, options] = fetchMock.mock.calls[0];
			const callPayload = JSON.parse(
				(options as Record<string, unknown>).body as string
			);
			expect(callPayload.image_size).toBe("landscape_16_9");
		});

		it("should support custom dimensions", async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					images: [
						{ url: "https://fal.ai/result.png", width: 1920, height: 1080 },
					],
					seed: 12_345,
				}),
			});
			globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

			await generateSeeddream45Image({
				prompt: "Test prompt",
				image_size: { width: 1920, height: 1080 },
			});

			const [, options] = fetchMock.mock.calls[0];
			const callPayload = JSON.parse(
				(options as Record<string, unknown>).body as string
			);
			expect(callPayload.image_size).toEqual({ width: 1920, height: 1080 });
		});
	});

	describe("Model Configuration", () => {
		it("should use correct endpoint for text-to-image", async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					images: [{ url: "https://fal.ai/result.png" }],
					seed: 12_345,
				}),
			});
			globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

			await generateSeeddream45Image({
				prompt: "Test prompt",
			});

			const [callUrl] = fetchMock.mock.calls[0];
			expect(callUrl).toContain("fal-ai/bytedance/seedream/v4.5/text-to-image");
		});

		it("should include seed in payload when specified", async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					images: [{ url: "https://fal.ai/result.png" }],
					seed: 42,
				}),
			});
			globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

			await generateSeeddream45Image({
				prompt: "Test prompt",
				seed: 42,
			});

			const [, options] = fetchMock.mock.calls[0];
			const callPayload = JSON.parse(
				(options as Record<string, unknown>).body as string
			);
			expect(callPayload.seed).toBe(42);
		});

		it("should include num_images when specified", async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					images: [
						{ url: "https://fal.ai/result1.png" },
						{ url: "https://fal.ai/result2.png" },
					],
					seed: 12_345,
				}),
			});
			globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

			await generateSeeddream45Image({
				prompt: "Test prompt",
				num_images: 2,
			});

			const [, options] = fetchMock.mock.calls[0];
			const callPayload = JSON.parse(
				(options as Record<string, unknown>).body as string
			);
			expect(callPayload.num_images).toBe(2);
		});

		it("should default safety checker to enabled", async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					images: [{ url: "https://fal.ai/result.png" }],
					seed: 12_345,
				}),
			});
			globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

			await generateSeeddream45Image({
				prompt: "Test prompt",
			});

			const [, options] = fetchMock.mock.calls[0];
			const callPayload = JSON.parse(
				(options as Record<string, unknown>).body as string
			);
			expect(callPayload.enable_safety_checker).toBe(true);
		});
	});

	describe("Error Handling", () => {
		it("should throw error when FAL API returns 401", async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: false,
				status: 401,
				text: async () => "Invalid API key",
			});
			globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

			await expect(
				generateSeeddream45Image({ prompt: "Test prompt" })
			).rejects.toThrow(/Seeddream 4.5 image generation failed: 401/);
		});

		it("should throw error when API key is not configured", async () => {
			// Clear the API key BEFORE resetting modules
			(import.meta.env as any).VITE_FAL_API_KEY = "";

			// Re-import to get the function with cleared key
			vi.resetModules();
			const { initPlatform: initP } = await import("@qcut/platform-core");
			const { createWebAdapter: createW } = await import("@qcut/platform-web");
			initP(createW());
			const aiVideoClient = await import("@/lib/ai-clients/ai-video-client");

			// Mock fetch to prevent real API calls
			const fetchMock = vi.fn();
			globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

			await expect(
				aiVideoClient.generateSeeddream45Image({ prompt: "Test" })
			).rejects.toThrow(/FAL API key not configured/);

			// Ensure fetch was never called
			expect(fetchMock).not.toHaveBeenCalled();
		});
	});
});

describe("Seeddream 4.5 Image Edit", () => {
	let editSeeddream45Image: typeof import("@/lib/ai-clients/ai-video-client")["editSeeddream45Image"];

	beforeEach(async () => {
		vi.restoreAllMocks();
		vi.clearAllMocks();

		(import.meta.env as any).VITE_FAL_API_KEY = "test-api-key";

		const aiVideoClient = await import("@/lib/ai-clients/ai-video-client");
		editSeeddream45Image = aiVideoClient.editSeeddream45Image;

		globalThis.fetch = originalFetch as typeof globalThis.fetch;
	});

	afterEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
		globalThis.fetch = originalFetch as typeof globalThis.fetch;
	});

	describe("Image URL Validation", () => {
		it("should reject empty image_urls array", async () => {
			await expect(
				editSeeddream45Image({
					prompt: "Edit this image",
					image_urls: [],
				})
			).rejects.toThrow(/Please select at least one image to edit/);
		});

		it("should reject more than 10 images", async () => {
			const tooManyUrls = Array.from(
				{ length: 11 },
				(_, i) => `https://fal.ai/image${i}.png`
			);

			await expect(
				editSeeddream45Image({
					prompt: "Edit these images",
					image_urls: tooManyUrls,
				})
			).rejects.toThrow(/Maximum 10 images allowed/);
		});

		it("should accept valid single image", async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					images: [
						{
							url: "https://fal.ai/edited.png",
							content_type: "image/png",
							file_name: "edited.png",
							file_size: 2_048_000,
							width: 2048,
							height: 2048,
						},
					],
				}),
			});
			globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

			const result = await editSeeddream45Image({
				prompt: "Replace the background with a beach sunset",
				image_urls: ["https://fal.ai/storage/input.png"],
			});

			expect(result.images).toHaveLength(1);
			expect(result.images[0].url).toBe("https://fal.ai/edited.png");
		});

		it("should accept multiple images for compositing", async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					images: [{ url: "https://fal.ai/composited.png" }],
				}),
			});
			globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

			await editSeeddream45Image({
				prompt:
					"Replace the product in Figure 1 with the product from Figure 2",
				image_urls: [
					"https://fal.ai/storage/scene.png",
					"https://fal.ai/storage/product.png",
				],
			});

			const [, options] = fetchMock.mock.calls[0];
			const callPayload = JSON.parse(
				(options as Record<string, unknown>).body as string
			);
			expect(callPayload.image_urls).toHaveLength(2);
		});
	});

	describe("Model Configuration", () => {
		it("should use correct endpoint for edit", async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					images: [{ url: "https://fal.ai/edited.png" }],
				}),
			});
			globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

			await editSeeddream45Image({
				prompt: "Edit this",
				image_urls: ["https://fal.ai/storage/input.png"],
			});

			const [callUrl] = fetchMock.mock.calls[0];
			expect(callUrl).toContain("fal-ai/bytedance/seedream/v4.5/edit");
		});

		it("should pass image_urls in payload", async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					images: [{ url: "https://fal.ai/edited.png" }],
				}),
			});
			globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

			await editSeeddream45Image({
				prompt: "Edit this",
				image_urls: ["https://fal.ai/storage/input.png"],
			});

			const [, options] = fetchMock.mock.calls[0];
			const callPayload = JSON.parse(
				(options as Record<string, unknown>).body as string
			);
			expect(callPayload.image_urls).toEqual([
				"https://fal.ai/storage/input.png",
			]);
		});
	});

	describe("Error Handling", () => {
		it("should throw error when FAL API returns error", async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				text: async () => "Internal server error",
			});
			globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

			await expect(
				editSeeddream45Image({
					prompt: "Edit this",
					image_urls: ["https://fal.ai/storage/input.png"],
				})
			).rejects.toThrow(/Seeddream 4.5 image generation failed: 500/);
		});
	});
});

describe("uploadImageForSeeddream45Edit", () => {
	let uploadImageForSeeddream45Edit: typeof import("@/lib/ai-clients/ai-video-client")["uploadImageForSeeddream45Edit"];

	// Helper to create a mock File with arrayBuffer method
	function createMockFile(content: string, name: string, type: string): File {
		const blob = new Blob([content], { type });
		const file = new File([blob], name, { type });
		// Ensure arrayBuffer is available
		if (!file.arrayBuffer) {
			(file as any).arrayBuffer = async () => {
				return new TextEncoder().encode(content).buffer;
			};
		}
		return file;
	}

	beforeEach(async () => {
		vi.restoreAllMocks();
		vi.clearAllMocks();

		(import.meta.env as any).VITE_FAL_API_KEY = "test-api-key";

		const aiVideoClient = await import("@/lib/ai-clients/ai-video-client");
		uploadImageForSeeddream45Edit = aiVideoClient.uploadImageForSeeddream45Edit;
	});

	afterEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
		// Restore web adapter as default for this file
		initPlatform(createWebAdapter());
	});

	it("should throw error when API key is not configured", async () => {
		(import.meta.env as any).VITE_FAL_API_KEY = "";

		vi.resetModules();
		const { initPlatform: initP } = await import("@qcut/platform-core");
		const { createWebAdapter: createW } = await import("@qcut/platform-web");
		initP(createW());
		const aiVideoClient = await import("@/lib/ai-clients/ai-video-client");

		const mockFile = createMockFile("test", "test.png", "image/png");

		await expect(
			aiVideoClient.uploadImageForSeeddream45Edit(mockFile)
		).rejects.toThrow(/FAL API key not configured/);
	});

	it("should throw error when Electron API is not available", async () => {
		// Web adapter's fal namespace returns graceful null instead of throwing
		initPlatform(createWebAdapter());

		const mockFile = createMockFile("test", "test.png", "image/png");

		await expect(uploadImageForSeeddream45Edit(mockFile)).rejects.toThrow();
	});

	it("should use Electron IPC when available", async () => {
		const mockUploadImage = vi.fn().mockResolvedValue({
			success: true,
			url: "https://fal.ai/storage/uploaded.png",
		});

		// Set up electronAPI and init desktop adapter so platform().fal delegates to it
		(window as any).electronAPI = {
			fal: {
				uploadImage: mockUploadImage,
			},
		};
		const { initPlatform: initP } = await import("@qcut/platform-core");
		const { createDesktopAdapter: createD } = await import(
			"@qcut/platform-desktop"
		);
		initP(createD());

		const mockFile = createMockFile("test image data", "test.png", "image/png");

		const result = await uploadImageForSeeddream45Edit(mockFile);

		expect(result).toBe("https://fal.ai/storage/uploaded.png");
		expect(mockUploadImage).toHaveBeenCalledWith(
			expect.any(Uint8Array),
			"test.png",
			"test-api-key"
		);
	});

	it("should throw error when upload fails", async () => {
		const mockUploadImage = vi.fn().mockResolvedValue({
			success: false,
			error: "Network error",
		});

		// Set up electronAPI and init desktop adapter
		(window as any).electronAPI = {
			fal: {
				uploadImage: mockUploadImage,
			},
		};
		const { initPlatform: initP } = await import("@qcut/platform-core");
		const { createDesktopAdapter: createD } = await import(
			"@qcut/platform-desktop"
		);
		initP(createD());

		const mockFile = createMockFile("test", "test.png", "image/png");

		await expect(uploadImageForSeeddream45Edit(mockFile)).rejects.toThrow(
			/Network error/
		);
	});
});
