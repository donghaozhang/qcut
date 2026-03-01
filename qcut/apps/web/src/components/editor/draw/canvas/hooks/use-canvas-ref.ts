import { useImperativeHandle, type RefObject } from "react";
import type { DrawingCanvasHandle } from "../drawing-canvas-types";
import type { ObjectGroup } from "../../hooks/use-canvas-objects";
import { debug } from "../canvas-utils";

/**
 * Hook that sets up useImperativeHandle to expose canvas methods to parents.
 */
export function useCanvasRef({
	ref,
	canvasRef,
	handleImageUpload,
	loadDrawingFromDataUrl,
	selectedObjectIds,
	groups,
	getCanvasDataUrl,
	clearAll,
	createGroup,
	ungroupObjects,
}: {
	ref: React.ForwardedRef<DrawingCanvasHandle>;
	canvasRef: RefObject<HTMLCanvasElement | null>;
	handleImageUpload: (file: File) => Promise<string | undefined>;
	loadDrawingFromDataUrl: (dataUrl: string) => Promise<void>;
	selectedObjectIds: string[];
	groups: ObjectGroup[];
	getCanvasDataUrl: () => string | null;
	clearAll: () => void;
	createGroup: () => string | null;
	ungroupObjects: (groupId: string) => void;
}) {
	useImperativeHandle(ref, () => {
		const canvas = canvasRef.current;
		if (!canvas) {
			return {
				handleImageUpload: async () => {
					throw new Error("Canvas not available");
				},
				loadDrawingFromDataUrl: async () => {
					throw new Error("Canvas not available");
				},
				getSelectedCount: () => 0,
				getHasGroups: () => false,
				getCanvasDataUrl: () => null,
				clearAll: () => {
					throw new Error("Canvas not available");
				},
				handleCreateGroup: () => {
					throw new Error("Canvas not available");
				},
				handleUngroup: () => {
					throw new Error("Canvas not available");
				},
			} as unknown as DrawingCanvasHandle;
		}

		const canvasProxy = new Proxy(canvas, {
			get(target, prop) {
				switch (prop) {
					case "handleImageUpload":
						return handleImageUpload;
					case "loadDrawingFromDataUrl":
						return loadDrawingFromDataUrl;
					case "getSelectedCount":
						return () => selectedObjectIds.length;
					case "getHasGroups":
						return () => groups.length > 0;
					case "getCanvasDataUrl":
						return getCanvasDataUrl;
					case "clearAll":
						return clearAll;
					case "handleCreateGroup":
						return () => {
							const groupId = createGroup();
							if (groupId) {
								debug("✅ Group created successfully:", {
									groupId,
									selectedCount: selectedObjectIds.length,
								});
							} else {
								debug(
									"❌ Failed to create group - need at least 2 selected objects"
								);
							}
						};
					case "handleUngroup":
						return () => {
							const selectedGroups = groups.filter((group) =>
								group.objectIds.some((id) => selectedObjectIds.includes(id))
							);
							for (const group of selectedGroups) {
								ungroupObjects(group.id);
								debug("✅ Group dissolved:", {
									groupId: group.id,
								});
							}
						};
					default: {
						const value = target[prop as keyof HTMLCanvasElement];
						return typeof value === "function" ? value.bind(target) : value;
					}
				}
			},
		}) as DrawingCanvasHandle;

		return canvasProxy;
	}, [
		handleImageUpload,
		loadDrawingFromDataUrl,
		createGroup,
		ungroupObjects,
		selectedObjectIds,
		groups,
		getCanvasDataUrl,
		clearAll,
		canvasRef.current,
	]);
}
