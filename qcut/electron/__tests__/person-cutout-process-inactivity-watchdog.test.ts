import { afterEach, describe, expect, it, vi } from "vitest";
import { createProcessInactivityWatchdog } from "../jianying-person-cutout/process-inactivity-watchdog.js";

describe("person cutout process inactivity watchdog", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("fires only after a complete inactive interval", () => {
		vi.useFakeTimers();
		const onTimeout = vi.fn();
		const watchdog = createProcessInactivityWatchdog({
			onTimeout,
			timeoutMs: 1000,
		});

		watchdog.reset();
		vi.advanceTimersByTime(900);
		watchdog.reset();
		vi.advanceTimersByTime(900);
		expect(onTimeout).not.toHaveBeenCalled();
		vi.advanceTimersByTime(100);
		expect(onTimeout).toHaveBeenCalledOnce();
	});

	it("cancels a pending timeout after process completion", () => {
		vi.useFakeTimers();
		const onTimeout = vi.fn();
		const watchdog = createProcessInactivityWatchdog({
			onTimeout,
			timeoutMs: 1000,
		});

		watchdog.reset();
		watchdog.clear();
		vi.runAllTimers();
		expect(onTimeout).not.toHaveBeenCalled();
	});

	it("rejects invalid timeout values", () => {
		expect(() =>
			createProcessInactivityWatchdog({ onTimeout: vi.fn(), timeoutMs: 0 })
		).toThrow("进程无响应超时时间无效");
	});
});
