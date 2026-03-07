/**
 * Remotion Properties Panel
 *
 * Displays and allows editing of Remotion component props for the selected
 * timeline element. Auto-generates form fields from the component's Zod schema.
 *
 * @module components/editor/properties-panel/remotion-properties
 */

"use client";

import React, { useCallback, useMemo, useState, useEffect } from "react";
import { Layers, RotateCcw, AlertCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PropertyGroup } from "./property-item";
import { PropEditorFactory } from "./prop-editors";
import {
	parseSchema,
	validateSchema,
	getDefaultValues,
	setValueByPath,
	type ParsedField,
	type ValidationResult,
} from "@/lib/remotion/schema-parser";
import {
	useRemotionStore,
	useRemotionComponent,
} from "@/stores/ai/remotion-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { RemotionElement } from "@/types/timeline";

// ============================================================================
// Types
// ============================================================================

export interface RemotionPropertiesProps {
	/** The Remotion element being edited */
	element: RemotionElement;
	/** Track ID containing the element */
	trackId: string;
}

// ============================================================================
// Component Header
// ============================================================================

interface ComponentHeaderProps {
	componentName: string;
	componentCategory: string;
	componentId: string;
	onReset: () => void;
	hasChanges: boolean;
}

function ComponentHeader({
	componentName,
	componentCategory,
	componentId,
	onReset,
	hasChanges,
}: ComponentHeaderProps) {
	return (
		<div className="flex items-start justify-between gap-2 pb-3 border-b">
			<div className="flex items-center gap-2">
				<div className="w-8 h-8 rounded bg-violet-500/20 flex items-center justify-center">
					<Layers className="w-4 h-4 text-violet-400" />
				</div>
				<div>
					<div className="text-sm font-medium">{componentName}</div>
					<div className="flex items-center gap-1.5">
						<Badge variant="secondary" className="text-[10px] px-1 py-0">
							{componentCategory}
						</Badge>
						<span className="text-[10px] text-muted-foreground">
							{componentId}
						</span>
					</div>
				</div>
			</div>

			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="outline"
						size="icon"
						className="h-7 w-7"
						onClick={onReset}
						disabled={!hasChanges}
					>
						<RotateCcw className="w-3.5 h-3.5" />
					</Button>
				</TooltipTrigger>
				<TooltipContent>Reset to defaults</TooltipContent>
			</Tooltip>
		</div>
	);
}

// ============================================================================
// Missing Component State
// ============================================================================

function MissingComponentState({ componentId }: { componentId: string }) {
	return (
		<div className="flex flex-col items-center justify-center py-8 px-4 text-center">
			<AlertCircle className="w-10 h-10 text-muted-foreground mb-3" />
			<h3 className="font-medium mb-1">Component Not Found</h3>
			<p className="text-sm text-muted-foreground">
				The component "{componentId}" is not registered. It may have been
				removed or not loaded yet.
			</p>
		</div>
	);
}

// ============================================================================
// No Schema State
// ============================================================================

function NoSchemaState() {
	return (
		<div className="flex items-center gap-2 p-3 bg-muted/30 rounded text-sm text-muted-foreground">
			<Info className="w-4 h-4" />
			<span>This component has no configurable properties.</span>
		</div>
	);
}

// ============================================================================
// Main Component
// ============================================================================

export function RemotionProperties({
	element,
	trackId,
}: RemotionPropertiesProps) {
	// Get component definition
	const component = useRemotionComponent(element.componentId);
	const { updateInstanceProps } = useRemotionStore();
	const { updateRemotionElement } = useTimelineStore();

	// Local state for props editing
	const [localProps, setLocalProps] = useState<Record<string, unknown>>(
		element.props || {}
	);
	const [validationResult, setValidationResult] = useState<ValidationResult>({
		success: true,
		errors: {},
	});

	// Parse schema into fields
	const parsedFields = useMemo<ParsedField[]>(() => {
		if (!component?.schema) return [];
		return parseSchema(component.schema, component.defaultProps);
	}, [component]);

	// Get default values from schema
	const defaultProps = useMemo(() => {
		if (!component?.schema) return {};
		return getDefaultValues(component.schema, component.defaultProps);
	}, [component]);

	// Check if props have changed from defaults
	const hasChanges = useMemo(() => {
		return JSON.stringify(localProps) !== JSON.stringify(defaultProps);
	}, [localProps, defaultProps]);

	// Sync local props with element props
	useEffect(() => {
		setLocalProps(element.props || {});
	}, [element.props]);

	// Validate props when they change
	useEffect(() => {
		if (component?.schema) {
			const result = validateSchema(component.schema, localProps);
			setValidationResult(result);
		}
	}, [localProps, component?.schema]);

	// Handle prop change
	const handlePropChange = useCallback(
		(fieldName: string, value: unknown) => {
			const newProps = setValueByPath(localProps, fieldName, value);
			setLocalProps(newProps);

			// Update element props in timeline store
			updateRemotionElement(trackId, element.id, { props: newProps });

			// Update instance props in remotion store
			updateInstanceProps(element.id, newProps);
		},
		[
			localProps,
			trackId,
			element.id,
			updateRemotionElement,
			updateInstanceProps,
		]
	);

	// Handle reset to defaults
	const handleReset = useCallback(() => {
		setLocalProps(defaultProps);

		// Update element props in timeline store
		updateRemotionElement(trackId, element.id, { props: defaultProps });

		// Update instance props in remotion store
		updateInstanceProps(element.id, defaultProps);
	}, [
		defaultProps,
		trackId,
		element.id,
		updateRemotionElement,
		updateInstanceProps,
	]);

	// Component not found
	if (!component) {
		return <MissingComponentState componentId={element.componentId} />;
	}

	return (
		<div className="space-y-4">
			{/* Component Header */}
			<ComponentHeader
				componentName={component.name}
				componentCategory={component.category}
				componentId={component.id}
				onReset={handleReset}
				hasChanges={hasChanges}
			/>

			{/* Props Form */}
			{parsedFields.length === 0 ? (
				<NoSchemaState />
			) : (
				<PropertyGroup title="Component Properties" defaultExpanded={true}>
					<div className="space-y-4">
						{parsedFields.map((field) => (
							<PropEditorFactory
								key={field.name}
								field={field}
								value={localProps[field.name]}
								onChange={(value) => handlePropChange(field.name, value)}
								error={validationResult.errors[field.name]}
								disabled={false}
							/>
						))}
					</div>
				</PropertyGroup>
			)}

			{/* Render Mode */}
			<PropertyGroup title="Render Settings" defaultExpanded={false}>
				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<span className="text-xs">Render Mode</span>
						<Badge
							variant={element.renderMode === "live" ? "default" : "secondary"}
							className="text-[10px]"
						>
							{element.renderMode === "live" ? "Live Preview" : "Cached"}
						</Badge>
					</div>
					<p className="text-[10px] text-muted-foreground">
						Live mode renders in real-time. Cached mode uses pre-rendered frames
						for better export performance.
					</p>
				</div>
			</PropertyGroup>

			{/* Component Info */}
			{component.description && (
				<PropertyGroup title="About" defaultExpanded={false}>
					<p className="text-xs text-muted-foreground">
						{component.description}
					</p>
					<div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
						<div>
							<span className="text-muted-foreground">Duration:</span>{" "}
							{component.durationInFrames} frames
						</div>
						<div>
							<span className="text-muted-foreground">FPS:</span>{" "}
							{component.fps}
						</div>
						<div>
							<span className="text-muted-foreground">Size:</span>{" "}
							{component.width}x{component.height}
						</div>
						<div>
							<span className="text-muted-foreground">Source:</span>{" "}
							{component.source}
						</div>
					</div>
				</PropertyGroup>
			)}

			{/* Validation Errors Summary */}
			{!validationResult.success &&
				Object.keys(validationResult.errors).length > 0 && (
					<div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-sm">
						<div className="flex items-center gap-2 text-red-500 font-medium mb-1">
							<AlertCircle className="w-4 h-4" />
							Validation Errors
						</div>
						<ul className="text-xs text-red-400 space-y-1">
							{Object.entries(validationResult.errors).map(
								([path, message]) => (
									<li key={path}>
										<span className="font-mono">{path}</span>: {message}
									</li>
								)
							)}
						</ul>
					</div>
				)}
		</div>
	);
}
