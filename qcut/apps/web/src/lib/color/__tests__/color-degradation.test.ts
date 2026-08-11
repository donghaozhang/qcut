import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	type ColorDegradationEvent,
	reportColorDegradation,
	resetColorDegradationForTests,
	subscribeColorDegradation,
} from "../color-degradation";

describe("color-degradation", () => {
	beforeEach(() => {
		resetColorDegradationForTests();
	});

	it("fires listeners once per distinct reason (dedupe)", () => {
		const listener = vi.fn();
		subscribeColorDegradation(listener);
		reportColorDegradation({ reason: "css-fallback", detail: "first" });
		reportColorDegradation({ reason: "css-fallback", detail: "second" });
		expect(listener).toHaveBeenCalledTimes(1);
		expect(listener).toHaveBeenCalledWith({
			reason: "css-fallback",
			detail: "first",
		});
	});

	it("fires listeners for each distinct reason", () => {
		const events: ColorDegradationEvent[] = [];
		subscribeColorDegradation((event) => events.push(event));
		reportColorDegradation({ reason: "css-fallback" });
		reportColorDegradation({ reason: "gpu-fallback" });
		expect(events.map((event) => event.reason)).toEqual([
			"css-fallback",
			"gpu-fallback",
		]);
	});

	it("reset clears dedupe state and listeners", () => {
		const listener = vi.fn();
		subscribeColorDegradation(listener);
		reportColorDegradation({ reason: "css-fallback" });
		expect(listener).toHaveBeenCalledTimes(1);

		resetColorDegradationForTests();
		reportColorDegradation({ reason: "css-fallback" });
		expect(listener).toHaveBeenCalledTimes(1);

		resetColorDegradationForTests();
		subscribeColorDegradation(listener);
		reportColorDegradation({ reason: "css-fallback" });
		expect(listener).toHaveBeenCalledTimes(2);
	});

	it("does not consume a reason reported while nothing is subscribed", () => {
		reportColorDegradation({ reason: "css-fallback", detail: "pre-mount" });
		const listener = vi.fn();
		subscribeColorDegradation(listener);
		reportColorDegradation({ reason: "css-fallback", detail: "post-mount" });
		expect(listener).toHaveBeenCalledTimes(1);
		expect(listener).toHaveBeenCalledWith({
			reason: "css-fallback",
			detail: "post-mount",
		});
	});

	it("unsubscribe stops future events", () => {
		const listener = vi.fn();
		const unsubscribe = subscribeColorDegradation(listener);
		unsubscribe();
		reportColorDegradation({ reason: "css-fallback" });
		expect(listener).not.toHaveBeenCalled();
	});
});
