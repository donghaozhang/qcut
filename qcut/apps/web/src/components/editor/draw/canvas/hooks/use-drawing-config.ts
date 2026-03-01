import { useCallback, type RefObject } from "react";
import { useCanvasDrawing } from "../../hooks/use-canvas-drawing";
import type {
	StrokeStyle,
	ShapeStyle,
	TextStyle,
} from "../../hooks/use-canvas-drawing";
import {
	handleError,
	ErrorCategory,
	ErrorSeverity,
} from "@/lib/debug/error-handler";
import type { AnyCanvasObject } from "../../hooks/use-canvas-objects";
import type { DrawingToolConfig } from "@/types/white-draw";
import { debug } from "../canvas-utils";

/**
 * Hook that configures the useCanvasDrawing hook with all 8 callback handlers.
 */
export function useDrawingConfig({
	canvasRef,
	currentTool,
	brushSize,
	color,
	opacity,
	disabled,
	setDrawing,
	setIsDrawing,
	saveToHistory,
	onDrawingChange,
	objects,
	selectedObjectIds,
	isDragging,
	addStroke,
	addShape,
	addText,
	getObjectAtPosition,
	selectObjects,
	startDrag,
	updateDrag,
	endDrag,
	setTextInputModal,
	saveCanvasToHistory,
	withObjectCreationProtection,
}: {
	canvasRef: RefObject<HTMLCanvasElement | null>;
	currentTool: DrawingToolConfig;
	brushSize: number;
	color: string;
	opacity: number;
	disabled: boolean;
	setDrawing: (drawing: boolean) => void;
	setIsDrawing: (isDrawing: boolean) => void;
	saveToHistory: (dataUrl: string) => void;
	onDrawingChange?: (dataUrl: string) => void;
	objects: AnyCanvasObject[];
	selectedObjectIds: string[];
	isDragging: boolean;
	addStroke: (
		points: { x: number; y: number }[],
		style: StrokeStyle
	) => string | null;
	addShape: (
		shapeType: "rectangle" | "circle" | "line",
		bounds: { x: number; y: number; width: number; height: number },
		style: ShapeStyle
	) => string;
	addText: (
		text: string,
		position: { x: number; y: number },
		style: TextStyle
	) => string;
	getObjectAtPosition: (x: number, y: number) => AnyCanvasObject | null;
	selectObjects: (ids: string[], isMultiSelect?: boolean) => void;
	startDrag: (x: number, y: number) => void;
	updateDrag: (x: number, y: number) => void;
	endDrag: () => void;
	setTextInputModal: React.Dispatch<
		React.SetStateAction<{
			isOpen: boolean;
			position: { x: number; y: number };
			canvasPosition: { x: number; y: number };
		}>
	>;
	saveCanvasToHistory: () => void;
	withObjectCreationProtection: <T>(
		operation: () => T,
		operationType: string
	) => T;
}) {
	return useCanvasDrawing(canvasRef, {
		tool: currentTool,
		brushSize,
		color,
		opacity,
		disabled,
		onDrawingStart: useCallback(() => {
			if (disabled) return;
			try {
				debug("🎯 DRAW DEBUG - Drawing started");
				setDrawing(true);
				setIsDrawing(true);
				if (canvasRef.current) {
					saveToHistory(canvasRef.current.toDataURL());
				}
			} catch (error) {
				handleError(error, {
					operation: "canvas drawing start",
					category: ErrorCategory.UI,
					severity: ErrorSeverity.MEDIUM,
				});
			}
		}, [disabled, setDrawing, setIsDrawing, saveToHistory, canvasRef.current]),

		onDrawingEnd: useCallback(() => {
			if (disabled) return;
			try {
				debug("🎯 DRAW DEBUG - Drawing ended");
				setDrawing(false);
				setIsDrawing(false);

				// Save the completed pencil stroke to history
				saveCanvasToHistory();

				if (canvasRef.current && onDrawingChange) {
					onDrawingChange(canvasRef.current.toDataURL());
				}
			} catch (error) {
				handleError(error, {
					operation: "canvas drawing end",
					category: ErrorCategory.UI,
					severity: ErrorSeverity.MEDIUM,
				});
			}
		}, [
			disabled,
			setDrawing,
			setIsDrawing,
			saveCanvasToHistory,
			onDrawingChange,
			canvasRef.current,
		]),

		onTextInput: useCallback(
			(canvasPosition: { x: number; y: number }) => {
				const canvas = canvasRef.current;
				if (!canvas) return;

				const rect = canvas.getBoundingClientRect();
				const screenPosition = {
					x: rect.left + (canvasPosition.x * rect.width) / canvas.width,
					y: rect.top + (canvasPosition.y * rect.height) / canvas.height,
				};

				setTextInputModal({
					isOpen: true,
					position: screenPosition,
					canvasPosition,
				});
			},
			[canvasRef.current, setTextInputModal]
		),

		onSelectObject: useCallback(
			(canvasPosition: { x: number; y: number }, isMultiSelect = false) => {
				const object = getObjectAtPosition(canvasPosition.x, canvasPosition.y);
				if (object) {
					debug("🎯 Object selected:", {
						objectId: object.id,
						objectType: object.type,
						position: canvasPosition,
						multiSelect: isMultiSelect,
						currentSelection: selectedObjectIds,
					});

					selectObjects([object.id], isMultiSelect);
					startDrag(canvasPosition.x, canvasPosition.y);
					return true;
				}
				if (!isMultiSelect) {
					selectObjects([]);
				}
				return false;
			},
			[getObjectAtPosition, selectObjects, selectedObjectIds, startDrag]
		),

		onMoveObject: useCallback(
			(
				startPos: { x: number; y: number },
				currentPos: { x: number; y: number }
			) => {
				if (selectedObjectIds.length > 0) {
					debug("🚀 Moving objects:", {
						selectedIds: selectedObjectIds,
						startPos,
						currentPos,
						isDragState: isDragging,
					});
					updateDrag(currentPos.x, currentPos.y);
				} else {
					debug("❌ No objects selected for movement:", {
						selectedCount: selectedObjectIds.length,
						isDragState: isDragging,
					});
				}
			},
			[selectedObjectIds, isDragging, updateDrag]
		),

		onEndMove: useCallback(() => {
			debug("🏁 End move operation");
			endDrag();
			saveCanvasToHistory();
		}, [endDrag, saveCanvasToHistory]),

		onCreateStroke: useCallback(
			(points: { x: number; y: number }[], style: StrokeStyle) => {
				return withObjectCreationProtection(() => {
					const objectId = addStroke(points, style);
					saveCanvasToHistory();
					return objectId;
				}, "stroke");
			},
			[addStroke, saveCanvasToHistory, withObjectCreationProtection]
		),

		onCreateShape: useCallback(
			(
				shapeType: "rectangle" | "circle" | "line",
				bounds: {
					x: number;
					y: number;
					width: number;
					height: number;
				},
				style: ShapeStyle
			) => {
				return withObjectCreationProtection(() => {
					const objectId = addShape(shapeType, bounds, style);
					saveCanvasToHistory();
					return objectId;
				}, `shape-${shapeType}`);
			},
			[addShape, saveCanvasToHistory, withObjectCreationProtection]
		),

		onCreateText: useCallback(
			(text: string, position: { x: number; y: number }, style: TextStyle) => {
				debug("📝 TEXT DEBUG - Text creation starting:", {
					position,
					style,
					currentObjectCount: objects.length,
				});

				return withObjectCreationProtection(() => {
					const objectId = addText(text, position, style);
					debug("📝 TEXT DEBUG - Text object added with ID:", objectId);

					saveCanvasToHistory();

					debug("📝 TEXT DEBUG - Text creation completed:", {
						objectId,
						newObjectCount: objects.length + 1,
					});

					return objectId;
				}, "text");
			},
			[
				addText,
				saveCanvasToHistory,
				withObjectCreationProtection,
				objects.length,
			]
		),
	});
}
