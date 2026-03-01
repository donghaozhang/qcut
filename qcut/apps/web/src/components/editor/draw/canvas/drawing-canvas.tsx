import React, { useRef, useState, forwardRef } from "react";
import {
	useWhiteDrawStore,
	selectCurrentTool,
} from "@/stores/editor/white-draw-store";
import { useCanvasObjects } from "../hooks/use-canvas-objects";
import { TextInputModal } from "../components/text-input-modal";
import { cn } from "@/lib/utils";

import type {
	DrawingCanvasProps,
	DrawingCanvasHandle,
} from "./drawing-canvas-types";
import { useCanvasUtils } from "./canvas-utils";
import { useCanvasHandlers } from "./canvas-handlers";
import { useCanvasInit } from "./hooks/use-canvas-init";
import { useDrawingConfig } from "./hooks/use-drawing-config";
import { useCanvasHistory } from "./hooks/use-canvas-history";
import { useCanvasRendering } from "./hooks/use-canvas-rendering";
import { useCanvasRef } from "./hooks/use-canvas-ref";

export type { DrawingCanvasProps, DrawingCanvasHandle };

export const DrawingCanvas = forwardRef<
	DrawingCanvasHandle,
	DrawingCanvasProps
>(({ className, onDrawingChange, backgroundImage, disabled = false }, ref) => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const backgroundCanvasRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [textInputModal, setTextInputModal] = useState<{
		isOpen: boolean;
		position: { x: number; y: number };
		canvasPosition: { x: number; y: number };
	}>({
		isOpen: false,
		position: { x: 0, y: 0 },
		canvasPosition: { x: 0, y: 0 },
	});

	// Use selectors for performance optimization
	const currentTool = useWhiteDrawStore(selectCurrentTool);
	const {
		brushSize,
		color,
		opacity,
		setDrawing,
		saveToHistory,
		historyIndex,
		getCurrentHistoryState,
	} = useWhiteDrawStore();

	// Object management hook
	const {
		objects,
		groups,
		selectedObjectIds,
		isDragging,
		addStroke,
		addShape,
		addText,
		addImageObject,
		selectObjects,
		getObjectAtPosition,
		createGroup,
		ungroupObjects,
		startDrag,
		updateDrag,
		endDrag,
		deleteSelectedObjects,
		renderObjects,
		setIsDrawing,
		setIsDragging,
		clearAll,
	} = useCanvasObjects();

	// Track if we're currently saving to history to prevent restoration
	const isSavingToHistory = useRef(false);
	// Track recent object creation to prevent inappropriate restoration
	const recentObjectCreation = useRef(false);

	// Canvas utilities: protection, data URL export, history saving
	const {
		withObjectCreationProtection,
		getCanvasDataUrl,
		saveCanvasToHistory,
	} = useCanvasUtils({
		canvasRef,
		backgroundCanvasRef,
		objects,
		renderObjects,
		saveToHistory,
		isSavingToHistory,
		recentObjectCreation,
	});

	// Canvas initialization
	const { canvasDimensions } = useCanvasInit({
		canvasRef,
		backgroundCanvasRef,
		containerRef,
		backgroundImage,
	});

	// Drawing configuration with all callbacks
	const {
		handleMouseDown,
		handleMouseMove,
		handleMouseUp,
		handleTouchStart,
		handleTouchMove,
		handleTouchEnd,
		drawText,
	} = useDrawingConfig({
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
	});

	// Canvas event handlers: text confirm/cancel, image upload, load from data URL
	const {
		handleTextConfirm,
		handleTextCancel,
		loadDrawingFromDataUrl,
		handleImageUpload,
	} = useCanvasHandlers({
		canvasRef,
		objects,
		textInputModal,
		setTextInputModal,
		addText,
		addImageObject,
		brushSize,
		color,
		opacity,
		onDrawingChange,
		withObjectCreationProtection,
	});

	// History restoration (undo/redo)
	useCanvasHistory({
		historyIndex,
		getCurrentHistoryState,
		getCanvasDataUrl,
		loadDrawingFromDataUrl,
		isSavingToHistory,
		recentObjectCreation,
	});

	// Canvas rendering effects
	useCanvasRendering({
		canvasRef,
		backgroundCanvasRef,
		objects,
		renderObjects,
		backgroundImage,
	});

	// Expose canvas ref and object/group functions to parent
	useCanvasRef({
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
	});

	return (
		<div
			ref={containerRef}
			className={cn(
				"relative bg-gray-900 rounded-lg overflow-hidden drawing-canvas",
				disabled && "opacity-50 pointer-events-none",
				className
			)}
			style={{
				width: canvasDimensions.width,
				height: canvasDimensions.height,
			}}
		>
			{/* Background canvas for images */}
			<canvas
				ref={backgroundCanvasRef}
				className="absolute inset-0 pointer-events-none"
				style={{ zIndex: 1 }}
			/>

			{/* Drawing canvas */}
			<canvas
				ref={canvasRef}
				width={canvasDimensions.width}
				height={canvasDimensions.height}
				className={cn(
					"absolute inset-0 border border-gray-600",
					!disabled && "hover:border-orange-500 transition-colors"
				)}
				style={{ zIndex: 2, cursor: currentTool.cursor }}
				onMouseDown={handleMouseDown}
				onMouseMove={handleMouseMove}
				onMouseUp={handleMouseUp}
				onMouseLeave={handleMouseUp}
				onTouchStart={handleTouchStart}
				onTouchMove={handleTouchMove}
				onTouchEnd={handleTouchEnd}
				aria-label="Drawing canvas"
				role="img"
			/>

			{/* Loading indicator */}
			{disabled && (
				<div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-10">
					<div className="text-white text-sm">Processing...</div>
				</div>
			)}

			{/* Text Input Modal */}
			<TextInputModal
				isOpen={textInputModal.isOpen}
				position={textInputModal.position}
				fontSize={brushSize}
				color={color}
				onConfirm={handleTextConfirm}
				onCancel={handleTextCancel}
			/>
		</div>
	);
});

DrawingCanvas.displayName = "DrawingCanvas";
