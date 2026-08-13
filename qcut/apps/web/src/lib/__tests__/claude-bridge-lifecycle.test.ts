import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	cleanupClaudeProjectBridge,
	cleanupClaudeTimelineBridge,
	setupClaudeProjectBridge,
	setupClaudeTimelineBridge,
} from "@/lib/claude-bridge/claude-timeline-bridge";
import {
	cleanupClaudeTransactionBridge,
	setupClaudeTransactionBridge,
} from "@/lib/claude-bridge/claude-transaction-bridge";
import {
	cleanupQCutJianyingProjectExportBridge,
	setupQCutJianyingProjectExportBridge,
} from "@/lib/claude-bridge/qcut-jianying-project-export-bridge";
import { setupClaudeBridgeLifecycle } from "@/lib/claude-bridge/claude-bridge-lifecycle";

vi.mock("@/lib/claude-bridge/claude-timeline-bridge", () => ({
	setupClaudeTimelineBridge: vi.fn(),
	setupClaudeProjectBridge: vi.fn(),
	cleanupClaudeTimelineBridge: vi.fn(),
	cleanupClaudeProjectBridge: vi.fn(),
}));
vi.mock("@/lib/claude-bridge/claude-transaction-bridge", () => ({
	setupClaudeTransactionBridge: vi.fn(),
	cleanupClaudeTransactionBridge: vi.fn(),
}));
vi.mock("@/lib/claude-bridge/qcut-jianying-project-export-bridge", () => ({
	setupQCutJianyingProjectExportBridge: vi.fn(),
	cleanupQCutJianyingProjectExportBridge: vi.fn(),
}));

describe("setupClaudeBridgeLifecycle", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("sets up and cleans up both bridges", () => {
		const cleanup = setupClaudeBridgeLifecycle();

		expect(setupClaudeTransactionBridge).toHaveBeenCalledTimes(1);
		expect(setupClaudeTimelineBridge).toHaveBeenCalledTimes(1);
		expect(setupClaudeProjectBridge).toHaveBeenCalledTimes(1);
		expect(setupQCutJianyingProjectExportBridge).toHaveBeenCalledTimes(1);

		cleanup();

		expect(cleanupClaudeTransactionBridge).toHaveBeenCalledTimes(1);
		expect(cleanupClaudeTimelineBridge).toHaveBeenCalledTimes(1);
		expect(cleanupClaudeProjectBridge).toHaveBeenCalledTimes(1);
		expect(cleanupQCutJianyingProjectExportBridge).toHaveBeenCalledTimes(1);
	});

	it("continues setup when timeline bridge setup throws", () => {
		const setupError = new Error("timeline setup failed");
		vi.mocked(setupClaudeTimelineBridge).mockImplementationOnce(() => {
			throw setupError;
		});
		const onError = vi.fn();

		const cleanup = setupClaudeBridgeLifecycle({ onError });

		expect(setupClaudeProjectBridge).toHaveBeenCalledTimes(1);
		expect(onError).toHaveBeenCalledWith(
			"[ClaudeBridge] Failed to setup timeline bridge",
			setupError
		);

		cleanup();
	});

	it("continues cleanup when timeline bridge cleanup throws", () => {
		const cleanupError = new Error("timeline cleanup failed");
		vi.mocked(cleanupClaudeTimelineBridge).mockImplementationOnce(() => {
			throw cleanupError;
		});
		const onError = vi.fn();

		const cleanup = setupClaudeBridgeLifecycle({ onError });
		cleanup();

		expect(cleanupClaudeProjectBridge).toHaveBeenCalledTimes(1);
		expect(onError).toHaveBeenCalledWith(
			"[ClaudeBridge] Failed to cleanup timeline bridge",
			cleanupError
		);
	});
});
