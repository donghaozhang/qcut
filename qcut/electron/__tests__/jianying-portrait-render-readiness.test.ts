// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { renderUntilOutputChanges } from "../jianying-portrait-adjustment-runtime/render-readiness.js";

describe("Jianying portrait render readiness", () => {
	it("returns immediately when the first render produces pixels", async () => {
		const renderAttempt = vi.fn(async () => undefined);
		const isOutputChanged = vi.fn(async () => true);

		const attempts = await renderUntilOutputChanges({
			renderAttempt,
			isOutputChanged,
			maxAttempts: 8,
		});

		expect(attempts).toBe(1);
		expect(renderAttempt).toHaveBeenCalledTimes(1);
	});

	it("pumps passthrough frames until asynchronous output is ready", async () => {
		const renderAttempt = vi.fn(async () => undefined);
		const isOutputChanged = vi
			.fn<() => Promise<boolean>>()
			.mockResolvedValueOnce(false)
			.mockResolvedValueOnce(false)
			.mockResolvedValueOnce(true);

		const attempts = await renderUntilOutputChanges({
			renderAttempt,
			isOutputChanged,
			maxAttempts: 8,
		});

		expect(attempts).toBe(3);
		expect(renderAttempt).toHaveBeenNthCalledWith(1, { attempt: 1 });
		expect(renderAttempt).toHaveBeenNthCalledWith(3, { attempt: 3 });
	});

	it("stops at the cap when a source legitimately needs no correction", async () => {
		const renderAttempt = vi.fn(async () => undefined);
		const isOutputChanged = vi.fn(async () => false);

		const attempts = await renderUntilOutputChanges({
			renderAttempt,
			isOutputChanged,
			maxAttempts: 4,
		});

		expect(attempts).toBe(4);
		expect(renderAttempt).toHaveBeenCalledTimes(4);
		expect(isOutputChanged).toHaveBeenCalledTimes(4);
	});
});
