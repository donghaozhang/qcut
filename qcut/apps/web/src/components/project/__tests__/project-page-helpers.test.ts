import { describe, expect, it } from "vitest";
import {
	buildProjectCreationOptions,
	getVisibleSelectionState,
} from "../project-page-helpers";

describe("project page helpers", () => {
	it("keeps template-created projects in the current folder", () => {
		expect(
			buildProjectCreationOptions({
				folderId: "folder-1",
				canvasSize: { width: 1080, height: 1920 },
			})
		).toEqual({
			folderId: "folder-1",
			canvasSize: { width: 1080, height: 1920 },
		});
	});

	it("does not treat selections from another folder as visible selections", () => {
		const state = getVisibleSelectionState({
			visibleProjectIds: ["folder-project-1", "folder-project-2"],
			selectedProjectIds: new Set(["root-project-1", "root-project-2"]),
		});

		expect(state).toEqual({
			allSelected: false,
			someSelected: false,
			visibleSelectedCount: 0,
		});
	});

	it("reports a partial selection using only visible projects", () => {
		const state = getVisibleSelectionState({
			visibleProjectIds: ["project-1", "project-2"],
			selectedProjectIds: new Set(["project-1", "hidden-project"]),
		});

		expect(state).toEqual({
			allSelected: false,
			someSelected: true,
			visibleSelectedCount: 1,
		});
	});
});
