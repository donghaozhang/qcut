import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FoldersStrip } from "../project-folders";
import { PROJECT_DRAG_MIME } from "../project-meta";

const storeMocks = vi.hoisted(() => ({
	createProjectFolder: vi.fn(),
	deleteProjectFolder: vi.fn(),
	moveProjectToFolder: vi.fn(),
	renameProjectFolder: vi.fn(),
}));

vi.mock("@/stores/project-store", () => {
	const state = {
		projectFolders: [
			{
				id: "folder-1",
				name: "Campaign",
				createdAt: new Date("2026-07-18T00:00:00.000Z"),
			},
		],
		savedProjects: [],
		...storeMocks,
	};
	return {
		useProjectStore: (selector?: (value: typeof state) => unknown) =>
			selector ? selector(state) : state,
	};
});

vi.mock("@/lib/i18n", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

describe("project folders drag and drop", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		storeMocks.moveProjectToFolder.mockResolvedValue(true);
	});

	it("moves the dragged project into the dropped folder", () => {
		render(<FoldersStrip currentFolderId={null} onOpenFolder={vi.fn()} />);
		const folder = screen.getByTestId("project-folder-chip");
		const dataTransfer = {
			types: [PROJECT_DRAG_MIME],
			getData: vi.fn((type: string) =>
				type === PROJECT_DRAG_MIME ? "project-1" : ""
			),
			dropEffect: "none",
		};

		fireEvent.dragOver(folder, { dataTransfer });
		fireEvent.drop(folder, { dataTransfer });

		expect(storeMocks.moveProjectToFolder).toHaveBeenCalledWith(
			"project-1",
			"folder-1"
		);
	});

	it("clears an abandoned folder name when the controlled dialog reopens", () => {
		render(<FoldersStrip currentFolderId={null} onOpenFolder={vi.fn()} />);

		fireEvent.click(screen.getByTestId("new-folder-button"));
		const input = screen.getByPlaceholderText("projects.folderName");
		fireEvent.change(input, { target: { value: "Abandoned draft" } });
		fireEvent.click(screen.getByText("common.cancel"));
		fireEvent.click(screen.getByTestId("new-folder-button"));

		expect(screen.getByPlaceholderText("projects.folderName")).toHaveValue("");
	});
});
