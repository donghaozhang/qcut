import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initPlatform } from "@qcut/platform-core";
import { createDesktopAdapter } from "@qcut/platform-desktop";
import { searchSounds } from "@/lib/api-adapter";
import { setRuntimeFlags, isFeatureEnabled } from "@/lib/feature-flags";

// Mock the error handler to prevent interference during tests
vi.mock("@/lib/debug/error-handler", () => ({
	handleError: vi.fn(),
	ErrorCategory: {
		NETWORK: "network",
		VALIDATION: "validation",
		STORAGE: "storage",
		MEDIA_PROCESSING: "media_processing",
		AI_SERVICE: "ai_service",
		EXPORT: "export",
		AUTH: "auth",
		UI: "ui",
		SYSTEM: "system",
		UNKNOWN: "unknown",
	},
	ErrorSeverity: {
		LOW: "low",
		MEDIUM: "medium",
		HIGH: "high",
		CRITICAL: "critical",
	},
}));

// Mock the global fetch function
const mockFetch = vi.fn();
(global as any).fetch = mockFetch;

// Mock window.electronAPI
const mockElectronAPI = {
	sounds: {
		search: vi.fn(),
	},
};

// Mock window object
Object.defineProperty(global, "window", {
	value: {
		electronAPI: mockElectronAPI,
	},
	writable: true,
});

initPlatform(createDesktopAdapter());

describe("Sounds API Migration", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset runtime flags
		setRuntimeFlags({});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("Feature Flag Testing", () => {
		it("should use Electron API when USE_ELECTRON_API is true", async () => {
			setRuntimeFlags({ USE_ELECTRON_API: true });

			const mockResult = {
				success: true,
				count: 10,
				results: [
					{
						id: 1,
						name: "Test Sound",
						description: "A test sound effect",
						url: "https://freesound.org/people/test/sounds/1/",
						previewUrl: "https://freesound.org/data/previews/1/1_preview.mp3",
						duration: 2.5,
						filesize: 45_678,
						type: "wav",
						channels: 1,
						bitrate: 128,
						bitdepth: 16,
						samplerate: 44_100,
						username: "testuser",
						tags: ["test", "sound"],
						license: "Attribution",
						created: "2023-01-01T00:00:00Z",
						downloads: 100,
						rating: 4.5,
						ratingCount: 10,
					},
				],
				page: 1,
				pageSize: 20,
			};

			mockElectronAPI.sounds.search.mockResolvedValue(mockResult);

			const result = await searchSounds("rain", { type: "effects" });

			expect(mockElectronAPI.sounds.search).toHaveBeenCalledWith({
				q: "rain",
				type: "effects",
			});
			expect(result).toEqual(mockResult);
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it("should fall back to Next.js API when Electron API fails", async () => {
			setRuntimeFlags({ USE_ELECTRON_API: true });

			// Mock Electron API failure
			mockElectronAPI.sounds.search.mockRejectedValue(new Error("IPC failed"));

			// Mock successful Next.js API response
			const mockApiResponse = {
				count: 5,
				results: [
					{
						id: 2,
						name: "Fallback Sound",
						description: "A fallback sound",
						url: "https://freesound.org/people/test/sounds/2/",
						previewUrl: "https://freesound.org/data/previews/2/2_preview.mp3",
						duration: 1.8,
						filesize: 32_145,
						type: "wav",
						channels: 2,
						bitrate: 192,
						bitdepth: 24,
						samplerate: 48_000,
						username: "fallbackuser",
						tags: ["fallback"],
						license: "Creative Commons 0",
						created: "2023-02-01T00:00:00Z",
						downloads: 50,
						rating: 3.8,
						ratingCount: 5,
					},
				],
			};

			mockFetch.mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(mockApiResponse),
			});

			const result = await searchSounds("thunder", {
				type: "effects",
				fallbackToOld: true,
			});

			expect(mockElectronAPI.sounds.search).toHaveBeenCalled();
			expect(mockFetch).toHaveBeenCalledWith(
				"/api/sounds/search?q=thunder&type=effects"
			);
			expect(result).toEqual(mockApiResponse);
		});

		it("should use Next.js API when USE_ELECTRON_API is false", async () => {
			setRuntimeFlags({ USE_ELECTRON_API: false });

			const mockApiResponse = {
				count: 3,
				results: [],
			};

			mockFetch.mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(mockApiResponse),
			});

			const result = await searchSounds("music", {
				type: "effects",
				page: 2,
				page_size: 10,
			});

			expect(mockElectronAPI.sounds.search).not.toHaveBeenCalled();
			expect(mockFetch).toHaveBeenCalledWith(
				"/api/sounds/search?q=music&type=effects&page=2&page_size=10"
			);
			expect(result).toEqual(mockApiResponse);
		});
	});

	describe("Parameter Handling", () => {
		it("should handle all search parameters correctly", async () => {
			setRuntimeFlags({ USE_ELECTRON_API: true });

			mockElectronAPI.sounds.search.mockResolvedValue({
				success: true,
				results: [],
			});

			await searchSounds("ambient", {
				type: "effects",
				page: 3,
				page_size: 15,
				sort: "rating",
				min_rating: 4,
				commercial_only: false,
			});

			expect(mockElectronAPI.sounds.search).toHaveBeenCalledWith({
				q: "ambient",
				type: "effects",
				page: 3,
				page_size: 15,
				sort: "rating",
				min_rating: 4,
				commercial_only: false,
			});
		});

		it("should handle empty query correctly", async () => {
			setRuntimeFlags({ USE_ELECTRON_API: true });

			mockElectronAPI.sounds.search.mockResolvedValue({
				success: true,
				results: [],
			});

			await searchSounds("");

			expect(mockElectronAPI.sounds.search).toHaveBeenCalledWith({
				q: "",
			});
		});
	});

	describe("Error Handling", () => {
		it("should handle Electron API errors gracefully", async () => {
			setRuntimeFlags({ USE_ELECTRON_API: true });

			const errorResult = {
				success: false,
				error: "API key not configured",
			};

			mockElectronAPI.sounds.search.mockResolvedValue(errorResult);

			const result = await searchSounds("test", { fallbackToOld: false });

			expect(result).toEqual(errorResult);
		});

		it("should handle fetch errors with retries", async () => {
			setRuntimeFlags({ USE_ELECTRON_API: false });

			// Create a fresh mock for this test only
			const localMockFetch = vi.fn() as any;
			const originalFetch = global.fetch;
			global.fetch = localMockFetch;

			try {
				// Mock fetch to fail twice then succeed
				let callCount = 0;
				localMockFetch.mockImplementation(() => {
					callCount++;
					if (callCount === 1) {
						return Promise.reject(new Error("Network error"));
					}
					if (callCount === 2) {
						return Promise.reject(new Error("Network error"));
					}
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({ results: [] }),
					});
				});

				const result = await searchSounds("retry-test", {
					retryCount: 3,
				});

				expect(localMockFetch).toHaveBeenCalledTimes(3);
				expect(result).toEqual({ results: [] });
			} finally {
				// Restore original fetch
				global.fetch = originalFetch;
			}
		});
	});

	describe("Response Format Compatibility", () => {
		it("should return consistent response format from both implementations", async () => {
			const electronResult = {
				success: true,
				count: 1,
				next: null,
				previous: null,
				results: [
					{
						id: 1,
						name: "Test",
						description: "Test sound",
						url: "http://test.com",
						duration: 1.0,
						filesize: 1000,
						type: "wav",
						channels: 1,
						bitrate: 128,
						bitdepth: 16,
						samplerate: 44_100,
						username: "test",
						tags: [],
						license: "CC",
						created: "2023-01-01",
						downloads: 0,
						rating: 0,
						ratingCount: 0,
					},
				],
				query: "test",
				type: "effects",
				page: 1,
				pageSize: 20,
			};

			// Test Electron API
			setRuntimeFlags({ USE_ELECTRON_API: true });
			mockElectronAPI.sounds.search.mockResolvedValue(electronResult);

			const electronResponse = await searchSounds("test");

			// Test Next.js API
			setRuntimeFlags({ USE_ELECTRON_API: false });
			mockFetch.mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						count: electronResult.count,
						next: electronResult.next,
						previous: electronResult.previous,
						results: electronResult.results,
						query: electronResult.query,
						type: electronResult.type,
						page: electronResult.page,
						pageSize: electronResult.pageSize,
					}),
			});

			const nextjsResponse = await searchSounds("test");

			// Both should have the same structure (excluding success property)
			expect(electronResponse.count).toBe(nextjsResponse.count);
			expect(electronResponse.results).toEqual(nextjsResponse.results);
			expect(electronResponse.query).toBe(nextjsResponse.query);
		});
	});
});
