import { describe, expect, it, vi } from "vitest";
import {
	throwIfPersonCutoutAborted,
	waitForPersonCutoutPromise,
} from "../jianying-person-cutout/abort.js";

function deferred<Result>() {
	let resolve!: (value: Result) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<Result>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, reject, resolve };
}

describe("person cutout cancellation", () => {
	it("stops one subscriber without cancelling a shared build", async () => {
		const shared = deferred<string>();
		const firstController = new AbortController();
		const secondController = new AbortController();
		const first = waitForPersonCutoutPromise({
			promise: shared.promise,
			signal: firstController.signal,
		});
		const second = waitForPersonCutoutPromise({
			promise: shared.promise,
			signal: secondController.signal,
		});

		firstController.abort();
		await expect(first).rejects.toMatchObject({ name: "AbortError" });
		shared.resolve("cached-alpha");
		await expect(second).resolves.toBe("cached-alpha");
	});

	it("does not attach to a build after cancellation", async () => {
		const then = vi.fn();
		const controller = new AbortController();
		controller.abort();

		await expect(
			waitForPersonCutoutPromise({
				promise: { then } as unknown as Promise<string>,
				signal: controller.signal,
			})
		).rejects.toMatchObject({ name: "AbortError" });
		expect(then).not.toHaveBeenCalled();
		expect(() =>
			throwIfPersonCutoutAborted({ signal: controller.signal })
		).toThrow(expect.objectContaining({ name: "AbortError" }));
	});
});
