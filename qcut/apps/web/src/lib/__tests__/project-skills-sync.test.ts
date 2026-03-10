import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncProjectSkillsForClaude } from "../claude-bridge/project-skills-sync";
import { initPlatform } from "@qcut/platform-core";
import { createWebAdapter } from "@qcut/platform-web";
import type { PlatformAPI } from "@qcut/platform-core";

let originalPlatform: PlatformAPI | undefined;

beforeEach(() => {
	// Reset platform before each test
});

afterEach(() => {
	initPlatform(createWebAdapter());
	vi.restoreAllMocks();
});

describe("syncProjectSkillsForClaude", () => {
	it("calls skills.syncForClaude when API is available", () => {
		const syncForClaude = vi.fn().mockResolvedValue({
			synced: true,
			copied: 1,
			skipped: 0,
			removed: 0,
			warnings: [],
		});

		initPlatform({
			isElectron: true,
			skills: {
				syncForClaude,
			},
		} as unknown as PlatformAPI);

		syncProjectSkillsForClaude({
			projectId: "project-1",
		});

		expect(syncForClaude).toHaveBeenCalledWith("project-1");
	});

	it("does not throw when skills API is unavailable", () => {
		initPlatform({
			isElectron: false,
		} as unknown as PlatformAPI);

		expect(() => {
			syncProjectSkillsForClaude({ projectId: "project-2" });
		}).not.toThrow();
	});

	it("warns when sync promise rejects", async () => {
		const warningSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const syncForClaude = vi.fn().mockRejectedValue(new Error("sync failed"));

		initPlatform({
			isElectron: true,
			skills: {
				syncForClaude,
			},
		} as unknown as PlatformAPI);

		syncProjectSkillsForClaude({
			projectId: "project-3",
		});

		await Promise.resolve();

		expect(warningSpy).toHaveBeenCalledWith(
			"[ProjectStore] skills syncForClaude failed",
			expect.any(Error)
		);
	});
});
