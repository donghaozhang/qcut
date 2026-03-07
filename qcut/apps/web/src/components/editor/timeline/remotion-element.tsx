/**
 * Remotion Timeline Element Component
 *
 * Visual representation of a Remotion element on the QCut timeline.
 * Provides a distinct appearance, component info, and interaction handles.
 *
 * @module components/editor/timeline/remotion-element
 */

import React, { useMemo, useCallback } from "react";
import { Layers, RefreshCw, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RemotionElement, TimelineTrack } from "@/types/timeline";
import {
	useRemotionComponent,
	useRemotionInstance,
	useComponentAnalysis,
} from "@/stores/ai/remotion-store";
import { RemotionSequences } from "./remotion-sequences";
import { ParsedSequenceOverlay } from "./parsed-sequence-overlay";
import { calculateTotalDuration } from "@/lib/remotion/duration-calculator";

// ============================================================================
// Types
// ============================================================================

export interface RemotionTimelineElementProps {
	/** The Remotion element data */
	element: RemotionElement;
	/** The track this element belongs to */
	track: TimelineTrack;
	/** Current zoom level */
	zoomLevel: number;
	/** Whether this element is currently selected */
	isSelected: boolean;
	/** Handler for mouse down events (for dragging) */
	onElementMouseDown: (e: React.MouseEvent, element: RemotionElement) => void;
	/** Handler for click events (for selection) */
	onElementClick: (e: React.MouseEvent, element: RemotionElement) => void;
	/** Handler for resize start */
	onResizeStart?: (
		e: React.MouseEvent,
		element: RemotionElement,
		edge: "left" | "right"
	) => void;
}

// ============================================================================
// Constants
// ============================================================================

/** Minimum width for resize handles to be visible */
const MIN_WIDTH_FOR_HANDLES = 50;

/** Width of resize handles in pixels */
const RESIZE_HANDLE_WIDTH = 8;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate the display width of an element based on duration and zoom
 */
function calculateElementWidth(
	element: RemotionElement,
	zoomLevel: number
): number {
	const effectiveDuration =
		element.duration - element.trimStart - element.trimEnd;
	// Base: 100px per second at zoom level 1
	return Math.max(20, effectiveDuration * 100 * zoomLevel);
}

/**
 * Calculate the left position of an element based on start time and zoom
 */
function calculateElementLeft(
	element: RemotionElement,
	zoomLevel: number
): number {
	return element.startTime * 100 * zoomLevel;
}

// ============================================================================
// Sub-Components
// ============================================================================

interface ResizeHandleProps {
	edge: "left" | "right";
	onMouseDown: (e: React.MouseEvent) => void;
}

function ResizeHandle({ edge, onMouseDown }: ResizeHandleProps) {
	return (
		<div
			className={cn(
				"absolute top-0 bottom-0 w-2 cursor-ew-resize",
				"opacity-0 group-hover:opacity-100 transition-opacity",
				"bg-white/30 hover:bg-white/50",
				edge === "left" ? "left-0 rounded-l" : "right-0 rounded-r"
			)}
			style={{ width: RESIZE_HANDLE_WIDTH }}
			onMouseDown={(e) => {
				e.stopPropagation();
				onMouseDown(e);
			}}
		/>
	);
}

interface CacheStatusIndicatorProps {
	status: "none" | "partial" | "complete";
}

function CacheStatusIndicator({ status }: CacheStatusIndicatorProps) {
	if (status === "complete") {
		return null; // Don't show indicator when fully cached
	}

	return (
		<div
			className={cn(
				"absolute top-1 right-1 w-4 h-4 flex items-center justify-center rounded",
				status === "none" ? "text-yellow-500" : "text-blue-400"
			)}
			title={status === "none" ? "Not cached" : "Partially cached"}
		>
			<RefreshCw className="w-3 h-3" />
		</div>
	);
}

interface ErrorIndicatorProps {
	message: string;
}

function ErrorIndicator({ message }: ErrorIndicatorProps) {
	return (
		<div
			className="absolute top-1 right-1 w-4 h-4 flex items-center justify-center text-red-500"
			title={message}
		>
			<AlertCircle className="w-3 h-3" />
		</div>
	);
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * RemotionTimelineElement - Visual representation of a Remotion element on timeline
 *
 * Features:
 * - Purple/violet gradient to distinguish from other elements
 * - Component name and icon
 * - Thumbnail preview (when available)
 * - Resize handles on edges
 * - Cache status indicator
 * - Error state display
 */
export function RemotionTimelineElement({
	element,
	track,
	zoomLevel,
	isSelected,
	onElementMouseDown,
	onElementClick,
	onResizeStart,
}: RemotionTimelineElementProps) {
	// Get component and instance info from store
	const component = useRemotionComponent(element.componentId);
	const instance = useRemotionInstance(element.id);
	const analysis = useComponentAnalysis(element.componentId);

	// Calculate dimensions
	const width = useMemo(
		() => calculateElementWidth(element, zoomLevel),
		[element, zoomLevel]
	);
	const left = useMemo(
		() => calculateElementLeft(element, zoomLevel),
		[element, zoomLevel]
	);

	// Determine display states
	const showResizeHandles = width >= MIN_WIDTH_FOR_HANDLES;
	const hasError = !!instance?.error;
	const cacheStatus = instance?.cacheStatus ?? "none";

	// Check if component has sequence structure for visualization
	// Author-provided metadata takes precedence over parsed analysis
	const hasAuthorMetadata = !!component?.sequenceStructure?.sequences?.length;

	// Fall back to parsed analysis for imported components without author metadata
	const hasParsedAnalysis =
		!hasAuthorMetadata && !!analysis?.parsed?.sequences?.length;

	// Check if any sequences have dynamic values
	const hasDynamicValues = analysis?.hasDynamicValues ?? false;

	const sequenceTotalDuration = useMemo(() => {
		if (component?.sequenceStructure) {
			return calculateTotalDuration(component.sequenceStructure);
		}
		return 0;
	}, [component?.sequenceStructure]);

	// Event handlers
	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			onElementMouseDown(e, element);
		},
		[element, onElementMouseDown]
	);

	const handleClick = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			onElementClick(e, element);
		},
		[element, onElementClick]
	);

	const handleResizeStart = useCallback(
		(edge: "left" | "right") => (e: React.MouseEvent) => {
			e.stopPropagation();
			onResizeStart?.(e, element, edge);
		},
		[element, onResizeStart]
	);

	// Component not found state
	if (!component) {
		return (
			<div
				className={cn(
					"absolute h-full rounded border-2 border-dashed",
					"bg-red-500/10 border-red-500/50",
					"flex items-center justify-center",
					"cursor-pointer group"
				)}
				style={{
					left: `${left}px`,
					width: `${width}px`,
				}}
				onClick={handleClick}
				onMouseDown={handleMouseDown}
			>
				<div className="flex items-center gap-1 text-red-500 text-xs px-2">
					<AlertCircle className="w-3 h-3" />
					<span className="truncate">Missing: {element.componentId}</span>
				</div>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"absolute h-full rounded cursor-pointer group transition-all",
				// Base gradient - purple/violet theme for Remotion
				"bg-gradient-to-r from-violet-600 to-purple-600",
				// Selection state
				isSelected && "ring-2 ring-white ring-offset-1 ring-offset-background",
				// Hover state
				"hover:brightness-110",
				// Hidden state
				element.hidden && "opacity-40"
			)}
			style={{
				left: `${left}px`,
				width: `${width}px`,
			}}
			onClick={handleClick}
			onMouseDown={handleMouseDown}
			data-element-id={element.id}
			data-element-type="remotion"
		>
			{/* Thumbnail background (when available) */}
			{component.thumbnail && (
				<div
					className="absolute inset-0 opacity-30 rounded overflow-hidden"
					style={{
						backgroundImage: `url(${component.thumbnail})`,
						backgroundSize: "cover",
						backgroundPosition: "center",
					}}
				/>
			)}

			{/* Content overlay */}
			<div className="relative h-full flex items-center px-2 overflow-hidden">
				{/* Icon */}
				<div
					className={cn(
						"flex-shrink-0 w-5 h-5 rounded bg-white/20 flex items-center justify-center",
						"mr-2"
					)}
				>
					<Layers className="w-3 h-3 text-white" />
				</div>

				{/* Component name */}
				<div className="flex-1 min-w-0">
					<div className="text-xs font-medium text-white truncate">
						{component.name}
					</div>
					{width > 80 && (
						<div className="text-[10px] text-white/80 truncate">
							{component.category}
						</div>
					)}
				</div>
			</div>

			{/* Status indicators */}
			{hasError && instance?.error && (
				<ErrorIndicator message={instance.error.message} />
			)}
			{!hasError && <CacheStatusIndicator status={cacheStatus} />}

			{/* Resize handles */}
			{showResizeHandles && onResizeStart && (
				<>
					<ResizeHandle edge="left" onMouseDown={handleResizeStart("left")} />
					<ResizeHandle edge="right" onMouseDown={handleResizeStart("right")} />
				</>
			)}

			{/* Trim indicator stripes (for trimmed elements) */}
			{(element.trimStart > 0 || element.trimEnd > 0) && (
				<div
					className={cn(
						"absolute inset-0 pointer-events-none rounded",
						"bg-stripes opacity-20"
					)}
					style={{
						backgroundImage:
							"repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(0,0,0,0.3) 3px, rgba(0,0,0,0.3) 6px)",
					}}
				/>
			)}

			{/* Sequence visualization - author-provided metadata (preferred) */}
			{hasAuthorMetadata && component?.sequenceStructure && (
				<RemotionSequences
					structure={component.sequenceStructure}
					totalDuration={sequenceTotalDuration || element.duration}
					elementWidth={width}
				/>
			)}

			{/* Sequence visualization - parsed from AST (fallback for imports) */}
			{hasParsedAnalysis && analysis?.parsed && (
				<ParsedSequenceOverlay
					sequences={analysis.parsed.sequences}
					transitions={analysis.parsed.transitions}
					elementWidth={width}
					totalDuration={element.duration}
					usesTransitionSeries={analysis.parsed.usesTransitionSeries}
					className="opacity-80"
				/>
			)}

			{/* Dynamic values indicator badge */}
			{hasParsedAnalysis && hasDynamicValues && (
				<div
					className="absolute top-1 left-1 px-1.5 py-0.5 text-[8px] font-medium bg-amber-500/80 text-white rounded"
					title="Some timing values are computed at runtime"
				>
					~dynamic
				</div>
			)}
		</div>
	);
}

// ============================================================================
// Compact Variant
// ============================================================================

export interface RemotionTimelineElementCompactProps {
	element: RemotionElement;
	zoomLevel: number;
	isSelected: boolean;
	onClick: (element: RemotionElement) => void;
}

/**
 * Compact variant for use in collapsed track views
 */
export function RemotionTimelineElementCompact({
	element,
	zoomLevel,
	isSelected,
	onClick,
}: RemotionTimelineElementCompactProps) {
	const component = useRemotionComponent(element.componentId);

	const width = useMemo(
		() => calculateElementWidth(element, zoomLevel),
		[element, zoomLevel]
	);
	const left = useMemo(
		() => calculateElementLeft(element, zoomLevel),
		[element, zoomLevel]
	);

	return (
		<div
			className={cn(
				"absolute h-4 rounded-sm cursor-pointer",
				"bg-gradient-to-r from-violet-500 to-purple-500",
				isSelected && "ring-1 ring-white",
				"hover:brightness-110"
			)}
			style={{
				left: `${left}px`,
				width: `${width}px`,
			}}
			onClick={() => onClick(element)}
			title={component?.name ?? element.componentId}
		/>
	);
}

export default RemotionTimelineElement;
