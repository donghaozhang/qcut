import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	attachConsoleCapture,
	clearConsoleEntries,
	getConsoleEntries,
	recordConsoleEntry,
	resetConsoleCaptureForTests,
} from "../handlers/claude-console-handler.js";

class MockWebContents extends EventEmitter {
	executeJavaScript = vi.fn(async () => true);
}

describe("claude-console-handler", () => {
	beforeEach(() => {
		resetConsoleCaptureForTests();
	});

	it("filters console entries by level, since, and limit", () => {
		recordConsoleEntry({
			level: "log",
			message: "boot",
			timestamp: 1_000,
		});
		recordConsoleEntry({
			level: "error",
			message: "first failure",
			timestamp: 2_000,
		});
		recordConsoleEntry({
			level: "error",
			message: "second failure",
			timestamp: 3_000,
		});

		const filtered = getConsoleEntries({
			level: "error",
			since: "1970-01-01T00:00:02.500Z",
			limit: 10,
		});

		expect(filtered).toHaveLength(1);
		expect(filtered[0]?.message).toBe("second failure");
	});

	it("clears the console buffer", () => {
		recordConsoleEntry({
			level: "warn",
			message: "test warning",
			timestamp: 1_000,
		});

		expect(getConsoleEntries({ limit: 10 })).toHaveLength(1);
		expect(clearConsoleEntries()).toEqual({ clearedCount: 1 });
		expect(getConsoleEntries({ limit: 10 })).toHaveLength(0);
	});

	it("captures webContents console events and renderer failures", async () => {
		const webContents = new MockWebContents();
		const window = {
			webContents,
		} as unknown as Electron.BrowserWindow;

		attachConsoleCapture({ window });

		webContents.emit("did-finish-load");
		expect(webContents.executeJavaScript).toHaveBeenCalledTimes(1);

		webContents.emit(
			"console-message",
			{},
			3,
			"renderer exploded",
			42,
			"/src/app.tsx"
		);
		webContents.emit("render-process-gone", {}, { reason: "crashed", exitCode: 9 });

		const messages = getConsoleEntries({ limit: 10 });
		expect(messages).toHaveLength(2);
		expect(messages[0]?.level).toBe("error");
		expect(messages[0]?.message).toContain("renderer exploded");
		expect(messages[1]?.message).toContain("render-process-gone");
	});

	it("preserves Electron console-message level semantics", () => {
		const webContents = new MockWebContents();
		const window = {
			webContents,
		} as unknown as Electron.BrowserWindow;

		attachConsoleCapture({ window });

		webContents.emit("console-message", {}, 0, "verbose-style", 1, "a.ts");
		webContents.emit("console-message", {}, 1, "info-style", 2, "b.ts");

		const messages = getConsoleEntries({ limit: 10 });
		expect(messages[0]?.level).toBe("log");
		expect(messages[1]?.level).toBe("info");
	});
});
