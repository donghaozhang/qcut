import { beforeEach, describe, expect, it, vi } from "vitest";
import { initPlatform } from "@qcut/platform-core";
import { createDesktopAdapter } from "@qcut/platform-desktop";
import { createWebAdapter } from "@qcut/platform-web";

const {
	mockGetFalApiKeyAsync,
	mockEstimateCreditCost,
	mockCheckLicense,
	mockHasCredits,
	mockDeductCredits,
} = vi.hoisted(() => ({
	mockGetFalApiKeyAsync: vi.fn<() => Promise<string | undefined>>(),
	mockEstimateCreditCost:
		vi.fn<
			(modelKey: string, params?: { durationSeconds?: number }) => number
		>(),
	mockCheckLicense: vi.fn<() => Promise<void>>(),
	mockHasCredits: vi.fn<(amount: number) => boolean>(),
	mockDeductCredits:
		vi.fn<
			(
				amount: number,
				modelKey: string,
				description: string
			) => Promise<boolean>
		>(),
}));

const mockStoreState = {
	license: null as unknown,
	checkLicense: mockCheckLicense,
	hasCredits: mockHasCredits,
	deductCredits: mockDeductCredits,
};

vi.mock("@/lib/ai-video/core/fal-request", () => ({
	getFalApiKeyAsync: mockGetFalApiKeyAsync,
}));

vi.mock("@/lib/credit-costs", () => ({
	estimateCreditCost: mockEstimateCreditCost,
}));

vi.mock("@/stores/license-store", () => ({
	useLicenseStore: {
		getState: () => mockStoreState,
	},
}));

import { enforceCreditRequirement } from "../credit-guard";

describe("credit-guard", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockStoreState.license = { plan: "free" };
		(window as any).electronAPI = { license: {} };
		initPlatform(createDesktopAdapter());
		mockGetFalApiKeyAsync.mockResolvedValue(undefined);
		mockEstimateCreditCost.mockReturnValue(3.7);
		mockHasCredits.mockReturnValue(true);
		mockDeductCredits.mockResolvedValue(true);
	});

	it("allows when electron license API is unavailable", async () => {
		(window as any).electronAPI = undefined;
		initPlatform(createWebAdapter());

		const result = await enforceCreditRequirement({
			modelId: "wan_26_t2v",
			durationSeconds: 5,
			description: "WAN generation",
		});

		expect(result.allowed).toBe(true);
		expect(result.requiredCredits).toBe(0);
		expect(mockEstimateCreditCost).not.toHaveBeenCalled();
	});

	it("skips deduction when BYOK key is configured", async () => {
		mockGetFalApiKeyAsync.mockResolvedValue("user-api-key");

		const result = await enforceCreditRequirement({
			modelId: "wan_26_t2v",
			durationSeconds: 5,
			description: "WAN generation",
		});

		expect(result.allowed).toBe(true);
		expect(result.requiredCredits).toBe(0);
		expect(mockEstimateCreditCost).not.toHaveBeenCalled();
		expect(mockDeductCredits).not.toHaveBeenCalled();
	});

	it("returns failure when credits are insufficient", async () => {
		mockHasCredits.mockReturnValue(false);

		const result = await enforceCreditRequirement({
			modelId: "wan_26_t2v",
			durationSeconds: 5,
			description: "WAN generation",
		});

		expect(result.allowed).toBe(false);
		expect(result.requiredCredits).toBe(3.7);
		expect(result.reason).toContain("Not enough credits");
		expect(mockDeductCredits).not.toHaveBeenCalled();
	});

	it("returns failure when deduction call fails", async () => {
		mockDeductCredits.mockResolvedValue(false);

		const result = await enforceCreditRequirement({
			modelId: "wan_26_t2v",
			durationSeconds: 5,
			description: "WAN generation",
		});

		expect(result.allowed).toBe(false);
		expect(result.requiredCredits).toBe(3.7);
		expect(result.reason).toContain("Unable to deduct credits");
	});

	it("deducts rounded credits with mapped model key on success", async () => {
		mockEstimateCreditCost.mockReturnValue(4.04);

		const result = await enforceCreditRequirement({
			modelId: "wan_26_t2v",
			durationSeconds: 5,
			description: "WAN generation",
		});

		expect(result.allowed).toBe(true);
		expect(result.requiredCredits).toBe(4);
		expect(mockEstimateCreditCost).toHaveBeenCalledWith("wan-v2.6-1080p", {
			durationSeconds: 5,
		});
		expect(mockDeductCredits).toHaveBeenCalledWith(
			4,
			"wan-v2.6-1080p",
			"WAN generation"
		);
	});

	it("refreshes license before checking credits when missing in store", async () => {
		mockStoreState.license = null;

		await enforceCreditRequirement({
			modelId: "wan_26_t2v",
			durationSeconds: 5,
			description: "WAN generation",
		});

		expect(mockCheckLicense).toHaveBeenCalledTimes(1);
	});
});
