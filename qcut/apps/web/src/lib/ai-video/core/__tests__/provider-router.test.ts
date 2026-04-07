import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../fal-provider", () => ({
	falProvider: {
		name: "fal" as const,
		isAvailable: vi.fn(),
		submit: vi.fn(),
		poll: vi.fn(),
	},
}));

vi.mock("../../../ai-clients/gmi-client", () => ({
	gmiClient: {
		name: "gmi" as const,
		isAvailable: vi.fn(),
		submit: vi.fn(),
		poll: vi.fn(),
	},
}));

import { providerRouter } from "../provider-router";
import { falProvider } from "../fal-provider";
import { gmiClient } from "../../../ai-clients/gmi-client";

const falMock = falProvider as {
	isAvailable: ReturnType<typeof vi.fn>;
	submit: ReturnType<typeof vi.fn>;
	poll: ReturnType<typeof vi.fn>;
};

const gmiMock = gmiClient as {
	isAvailable: ReturnType<typeof vi.fn>;
	submit: ReturnType<typeof vi.fn>;
	poll: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
	vi.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/*  submit                                                            */
/* ------------------------------------------------------------------ */

describe("providerRouter.submit", () => {
	it("routes to FAL by default when available", async () => {
		falMock.isAvailable.mockResolvedValue(true);
		falMock.submit.mockResolvedValue({
			requestId: "fal-123",
			provider: "fal",
		});

		const result = await providerRouter.submit("model-a", { prompt: "hi" });

		expect(falMock.submit).toHaveBeenCalledWith(
			"model-a",
			{ prompt: "hi" },
			undefined
		);
		expect(result).toEqual({ requestId: "fal-123", provider: "fal" });
	});

	it("routes to GMI when backend is specified", async () => {
		gmiMock.isAvailable.mockResolvedValue(true);
		gmiMock.submit.mockResolvedValue({
			requestId: "gmi-456",
			provider: "gmi",
		});

		const result = await providerRouter.submit(
			"model-b",
			{ prompt: "hello" },
			"gmi"
		);

		expect(gmiMock.submit).toHaveBeenCalledWith(
			"model-b",
			{ prompt: "hello" },
			undefined
		);
		expect(result).toEqual({ requestId: "gmi-456", provider: "gmi" });
	});

	it("passes options through to the provider", async () => {
		falMock.isAvailable.mockResolvedValue(true);
		falMock.submit.mockResolvedValue({
			requestId: "fal-789",
			provider: "fal",
		});

		const opts = { timeout: 5000 };
		await providerRouter.submit("model-a", { prompt: "hi" }, "fal", opts);

		expect(falMock.submit).toHaveBeenCalledWith(
			"model-a",
			{ prompt: "hi" },
			opts
		);
	});

	it("throws when provider is unavailable", async () => {
		falMock.isAvailable.mockResolvedValue(false);

		await expect(
			providerRouter.submit("model-a", { prompt: "hi" }, "fal")
		).rejects.toThrow(/Provider "fal" is not available/);
	});

	it("throws with GMI key hint when GMI is unavailable", async () => {
		gmiMock.isAvailable.mockResolvedValue(false);

		await expect(providerRouter.submit("model-b", {}, "gmi")).rejects.toThrow(
			/GMI_API_KEY/
		);
	});
});

/* ------------------------------------------------------------------ */
/*  poll                                                              */
/* ------------------------------------------------------------------ */

describe("providerRouter.poll", () => {
	it("delegates to the correct provider", async () => {
		const pollResult = {
			status: "completed" as const,
			videoUrl: "https://example.com/video.mp4",
		};
		gmiMock.poll.mockResolvedValue(pollResult);

		const result = await providerRouter.poll("req-1", "gmi");

		expect(gmiMock.poll).toHaveBeenCalledWith("req-1", undefined);
		expect(result).toEqual(pollResult);
	});

	it("passes options through to the provider", async () => {
		falMock.poll.mockResolvedValue({ status: "processing" as const });

		const opts = { maxAttempts: 10, pollIntervalMs: 2000 };
		await providerRouter.poll("req-2", "fal", opts);

		expect(falMock.poll).toHaveBeenCalledWith("req-2", opts);
	});

	it("throws on unknown provider", async () => {
		await expect(
			providerRouter.poll("req-3", "unknown" as never)
		).rejects.toThrow(/Unknown provider backend: unknown/);
	});
});

/* ------------------------------------------------------------------ */
/*  isAvailable                                                       */
/* ------------------------------------------------------------------ */

describe("providerRouter.isAvailable", () => {
	it("returns true when provider is available", async () => {
		falMock.isAvailable.mockResolvedValue(true);

		expect(await providerRouter.isAvailable("fal")).toBe(true);
	});

	it("returns false when provider is unavailable", async () => {
		gmiMock.isAvailable.mockResolvedValue(false);

		expect(await providerRouter.isAvailable("gmi")).toBe(false);
	});

	it("returns false for unknown provider", async () => {
		expect(await providerRouter.isAvailable("nope" as never)).toBe(false);
	});
});

/* ------------------------------------------------------------------ */
/*  register                                                          */
/* ------------------------------------------------------------------ */

describe("providerRouter.register", () => {
	it("registers a custom provider and routes to it", async () => {
		const custom = {
			name: "custom" as const,
			isAvailable: vi.fn().mockResolvedValue(true),
			submit: vi.fn().mockResolvedValue({
				requestId: "custom-1",
				provider: "custom",
			}),
			poll: vi.fn().mockResolvedValue({ status: "completed" }),
		};

		providerRouter.register(custom as never);

		const result = await providerRouter.submit(
			"model-c",
			{},
			"custom" as never
		);
		expect(result).toEqual({ requestId: "custom-1", provider: "custom" });

		expect(await providerRouter.isAvailable("custom" as never)).toBe(true);
	});
});
