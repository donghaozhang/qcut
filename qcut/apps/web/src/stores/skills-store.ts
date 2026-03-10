import { create } from "zustand";
import { platform } from "@qcut/platform-core";
import { debugLog, debugError } from "@/lib/debug/debug-config";
import type { Skill } from "@/types/skill";

// ============================================================================
// Skills Store Types
// ============================================================================

interface SkillsState {
	skills: Skill[];
	selectedSkillId: string | null;
	isLoading: boolean;
	error: string | null;
}

interface SkillsActions {
	// CRUD Operations
	loadSkills: (projectId: string) => Promise<void>;
	importSkill: (
		projectId: string,
		sourcePath: string
	) => Promise<string | null>;
	deleteSkill: (projectId: string, skillId: string) => Promise<void>;

	// Queries
	getSkillById: (id: string) => Skill | undefined;

	// UI State
	setSelectedSkill: (id: string | null) => void;
	clearSkills: () => void;
}

type SkillsStore = SkillsState & SkillsActions;

// ============================================================================
// Skills Store Implementation
// ============================================================================

export const useSkillsStore = create<SkillsStore>((set, get) => ({
	// Initial State
	skills: [],
	selectedSkillId: null,
	isLoading: false,
	error: null,

	// ============================================================================
	// CRUD Operations
	// ============================================================================

	loadSkills: async (projectId) => {
		set({ isLoading: true, error: null });

		try {
			const skills = await platform().skills.list(projectId);
			set({ skills, isLoading: false });
			debugLog("[SkillsStore] Loaded skills:", {
				projectId,
				count: skills.length,
			});
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			debugError("[SkillsStore] Failed to load skills:", error);
			set({ error: errorMessage, isLoading: false });
		}
	},

	importSkill: async (projectId, sourcePath) => {
		try {
			const skill = await platform().skills.import(
				projectId,
				sourcePath
			);
			if (skill) {
				set((state) => ({ skills: [...state.skills, skill] }));
				debugLog("[SkillsStore] Imported skill:", {
					projectId,
					skillId: skill.id,
					name: skill.name,
				});
				return skill.id;
			}
			return null;
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			debugError("[SkillsStore] Failed to import skill:", error);
			set({ error: errorMessage });
			return null;
		}
	},

	deleteSkill: async (projectId, skillId) => {
		try {
			await platform().skills.delete(projectId, skillId);
			set((state) => ({
				skills: state.skills.filter((s) => s.id !== skillId),
				selectedSkillId:
					state.selectedSkillId === skillId ? null : state.selectedSkillId,
			}));
			debugLog("[SkillsStore] Deleted skill:", { projectId, skillId });
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			debugError("[SkillsStore] Failed to delete skill:", error);
			set({ error: errorMessage });
		}
	},

	// ============================================================================
	// Queries
	// ============================================================================

	getSkillById: (id) => {
		return get().skills.find((s) => s.id === id);
	},

	// ============================================================================
	// UI State
	// ============================================================================

	setSelectedSkill: (id) => {
		set({ selectedSkillId: id });
		debugLog("[SkillsStore] Selected skill:", id);
	},

	clearSkills: () => {
		set({ skills: [], selectedSkillId: null, error: null, isLoading: false });
		debugLog("[SkillsStore] Cleared all skills");
	},
}));
