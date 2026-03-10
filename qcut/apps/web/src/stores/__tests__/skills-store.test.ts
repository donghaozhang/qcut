import { describe, it, expect, beforeEach, vi } from "vitest";
import { initPlatform } from "@qcut/platform-core";
import { createDesktopAdapter } from "@qcut/platform-desktop";
import { createWebAdapter } from "@qcut/platform-web";
import { useSkillsStore } from "../skills-store";
import type { Skill } from "@/types/skill";

// Mock the debug utilities
vi.mock("@/lib/debug/debug-config", () => ({
	debugLog: vi.fn(),
	debugError: vi.fn(),
}));

// Create mock skills for testing
const mockSkill1: Skill = {
	id: "skill-1",
	name: "AI Content Pipeline",
	description: "Generate AI content using YAML pipelines",
	dependencies: "python>=3.10",
	folderName: "ai-content-pipeline",
	mainFile: "Skill.md",
	additionalFiles: ["REFERENCE.md"],
	content: "# AI Content Pipeline\n\nSkill content here",
	createdAt: Date.now(),
	updatedAt: Date.now(),
};

const mockSkill2: Skill = {
	id: "skill-2",
	name: "FFmpeg Skill",
	description: "Video processing with FFmpeg",
	folderName: "ffmpeg-skill",
	mainFile: "Skill.md",
	additionalFiles: ["REFERENCE.md", "CONCEPTS.md"],
	content: "# FFmpeg Skill\n\nSkill content here",
	createdAt: Date.now(),
	updatedAt: Date.now(),
};

describe("SkillsStore", () => {
	beforeEach(() => {
		// Reset store state before each test
		useSkillsStore.getState().clearSkills();
		// Reset any window.electronAPI mocks
		vi.resetAllMocks();
		initPlatform(createWebAdapter());
	});

	// ============================================================================
	// Initial State Tests
	// ============================================================================

	describe("Initial State", () => {
		it("starts with empty skills array", () => {
			expect(useSkillsStore.getState().skills).toEqual([]);
		});

		it("starts with no selected skill", () => {
			expect(useSkillsStore.getState().selectedSkillId).toBeNull();
		});

		it("starts with loading false", () => {
			expect(useSkillsStore.getState().isLoading).toBe(false);
		});

		it("starts with no error", () => {
			expect(useSkillsStore.getState().error).toBeNull();
		});
	});

	// ============================================================================
	// Query Tests
	// ============================================================================

	describe("getSkillById", () => {
		it("returns skill when found", () => {
			// Manually set skills for testing
			useSkillsStore.setState({ skills: [mockSkill1, mockSkill2] });

			const skill = useSkillsStore.getState().getSkillById("skill-1");
			expect(skill).toBeDefined();
			expect(skill?.id).toBe("skill-1");
			expect(skill?.name).toBe("AI Content Pipeline");
		});

		it("returns undefined for non-existent skill", () => {
			useSkillsStore.setState({ skills: [mockSkill1] });

			const skill = useSkillsStore.getState().getSkillById("non-existent");
			expect(skill).toBeUndefined();
		});
	});

	// ============================================================================
	// UI State Tests
	// ============================================================================

	describe("setSelectedSkill", () => {
		it("sets selected skill id", () => {
			useSkillsStore.getState().setSelectedSkill("skill-1");
			expect(useSkillsStore.getState().selectedSkillId).toBe("skill-1");
		});

		it("clears selection with null", () => {
			useSkillsStore.getState().setSelectedSkill("skill-1");
			useSkillsStore.getState().setSelectedSkill(null);
			expect(useSkillsStore.getState().selectedSkillId).toBeNull();
		});
	});

	// ============================================================================
	// Clear Tests
	// ============================================================================

	describe("clearSkills", () => {
		it("clears all skills and resets state", () => {
			useSkillsStore.setState({
				skills: [mockSkill1, mockSkill2],
				selectedSkillId: "skill-1",
				error: "Some error",
				isLoading: true,
			});

			useSkillsStore.getState().clearSkills();

			expect(useSkillsStore.getState().skills).toEqual([]);
			expect(useSkillsStore.getState().selectedSkillId).toBeNull();
			expect(useSkillsStore.getState().error).toBeNull();
			expect(useSkillsStore.getState().isLoading).toBe(false);
		});
	});

	// ============================================================================
	// Load Skills Tests (with mocked Electron API)
	// ============================================================================

	describe("loadSkills", () => {
		it("sets loading state while loading", async () => {
			// No electronAPI available
			(window as any).electronAPI = undefined;

			const promise = useSkillsStore.getState().loadSkills("project-1");

			// State should be loading during the async operation
			// Note: This is hard to test without more complex async tracking

			await promise;

			expect(useSkillsStore.getState().isLoading).toBe(false);
		});

		it("sets empty skills when electronAPI not available", async () => {
			(window as any).electronAPI = undefined;

			await useSkillsStore.getState().loadSkills("project-1");

			expect(useSkillsStore.getState().skills).toEqual([]);
			expect(useSkillsStore.getState().isLoading).toBe(false);
		});

		it("loads skills from electronAPI when available", async () => {
			(window as any).electronAPI = {
				skills: {
					list: vi.fn().mockResolvedValue([mockSkill1, mockSkill2]),
				},
			};
			initPlatform(createDesktopAdapter());

			await useSkillsStore.getState().loadSkills("project-1");

			expect(window.electronAPI?.skills?.list).toHaveBeenCalledWith(
				"project-1"
			);
			expect(useSkillsStore.getState().skills).toHaveLength(2);
			expect(useSkillsStore.getState().skills[0].name).toBe(
				"AI Content Pipeline"
			);
			expect(useSkillsStore.getState().isLoading).toBe(false);
		});

		it("handles load error gracefully", async () => {
			(window as any).electronAPI = {
				skills: {
					list: vi.fn().mockRejectedValue(new Error("Load failed")),
				},
			};
			initPlatform(createDesktopAdapter());

			await useSkillsStore.getState().loadSkills("project-1");

			expect(useSkillsStore.getState().error).toBe("Load failed");
			expect(useSkillsStore.getState().isLoading).toBe(false);
		});
	});

	// ============================================================================
	// Import Skill Tests
	// ============================================================================

	describe("importSkill", () => {
		it("returns null when electronAPI not available", async () => {
			(window as any).electronAPI = undefined;

			const result = await useSkillsStore
				.getState()
				.importSkill("project-1", "/path/to/skill");

			expect(result).toBeNull();
		});

		it("imports skill and adds to state", async () => {
			(window as any).electronAPI = {
				skills: {
					import: vi.fn().mockResolvedValue(mockSkill1),
				},
			};
			initPlatform(createDesktopAdapter());

			const result = await useSkillsStore
				.getState()
				.importSkill("project-1", "/path/to/skill");

			expect(result).toBe("skill-1");
			expect(useSkillsStore.getState().skills).toHaveLength(1);
			expect(useSkillsStore.getState().skills[0].name).toBe(
				"AI Content Pipeline"
			);
		});

		it("handles import error gracefully", async () => {
			(window as any).electronAPI = {
				skills: {
					import: vi.fn().mockRejectedValue(new Error("Import failed")),
				},
			};
			initPlatform(createDesktopAdapter());

			const result = await useSkillsStore
				.getState()
				.importSkill("project-1", "/path/to/skill");

			expect(result).toBeNull();
			expect(useSkillsStore.getState().error).toBe("Import failed");
		});
	});

	// ============================================================================
	// Delete Skill Tests
	// ============================================================================

	describe("deleteSkill", () => {
		it("removes skill from state", async () => {
			useSkillsStore.setState({ skills: [mockSkill1, mockSkill2] });

			(window as any).electronAPI = {
				skills: {
					delete: vi.fn().mockResolvedValue(undefined),
				},
			};
			initPlatform(createDesktopAdapter());

			await useSkillsStore.getState().deleteSkill("project-1", "skill-1");

			expect(useSkillsStore.getState().skills).toHaveLength(1);
			expect(useSkillsStore.getState().skills[0].id).toBe("skill-2");
		});

		it("clears selection when deleted skill was selected", async () => {
			useSkillsStore.setState({
				skills: [mockSkill1, mockSkill2],
				selectedSkillId: "skill-1",
			});

			(window as any).electronAPI = {
				skills: {
					delete: vi.fn().mockResolvedValue(undefined),
				},
			};
			initPlatform(createDesktopAdapter());

			await useSkillsStore.getState().deleteSkill("project-1", "skill-1");

			expect(useSkillsStore.getState().selectedSkillId).toBeNull();
		});

		it("preserves selection when different skill deleted", async () => {
			useSkillsStore.setState({
				skills: [mockSkill1, mockSkill2],
				selectedSkillId: "skill-1",
			});

			(window as any).electronAPI = {
				skills: {
					delete: vi.fn().mockResolvedValue(undefined),
				},
			};
			initPlatform(createDesktopAdapter());

			await useSkillsStore.getState().deleteSkill("project-1", "skill-2");

			expect(useSkillsStore.getState().selectedSkillId).toBe("skill-1");
		});

		it("handles delete error gracefully", async () => {
			useSkillsStore.setState({ skills: [mockSkill1] });

			(window as any).electronAPI = {
				skills: {
					delete: vi.fn().mockRejectedValue(new Error("Delete failed")),
				},
			};
			initPlatform(createDesktopAdapter());

			await useSkillsStore.getState().deleteSkill("project-1", "skill-1");

			expect(useSkillsStore.getState().error).toBe("Delete failed");
			// Skills should remain unchanged on error
			expect(useSkillsStore.getState().skills).toHaveLength(1);
		});
	});
});
