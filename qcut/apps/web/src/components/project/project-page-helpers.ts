import type { CanvasSize } from "@/types/editor";

export function buildProjectCreationOptions({
	folderId,
	canvasSize,
}: {
	folderId: string | null;
	canvasSize?: CanvasSize;
}): { folderId: string | null; canvasSize?: CanvasSize } {
	return canvasSize ? { folderId, canvasSize } : { folderId };
}

export function getVisibleSelectionState({
	visibleProjectIds,
	selectedProjectIds,
}: {
	visibleProjectIds: string[];
	selectedProjectIds: ReadonlySet<string>;
}): {
	allSelected: boolean;
	someSelected: boolean;
	visibleSelectedCount: number;
} {
	const visibleSelectedCount = visibleProjectIds.reduce(
		(count, projectId) => count + Number(selectedProjectIds.has(projectId)),
		0
	);
	const allSelected =
		visibleProjectIds.length > 0 &&
		visibleSelectedCount === visibleProjectIds.length;

	return {
		allSelected,
		someSelected: visibleSelectedCount > 0 && !allSelected,
		visibleSelectedCount,
	};
}
