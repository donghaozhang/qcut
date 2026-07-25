"use client";

import { CodeXml, Info, RotateCcw } from "lucide-react";
import { useCallback, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	BooleanProp,
	ColorProp,
	NumberProp,
	SelectProp,
	TextProp,
} from "./prop-editors";
import { PropertyGroup } from "./property-item";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type {
	HyperframesElement,
	HyperframesVariableDefinition,
	HyperframesVariableValue,
} from "@/types/timeline";

interface HyperframesPropertiesProps {
	element: HyperframesElement;
	trackId: string;
}

interface VariableEditorProps {
	definition: HyperframesVariableDefinition;
	value: HyperframesVariableValue;
	onChange: (value: HyperframesVariableValue) => void;
}

function VariableEditor({ definition, value, onChange }: VariableEditorProps) {
	const common = {
		name: `hyperframes-${definition.id}`,
		label: definition.label,
		description: definition.description,
		disabled: false,
	};

	if (definition.type === "boolean") {
		return (
			<BooleanProp {...common} value={Boolean(value)} onChange={onChange} />
		);
	}

	if (definition.type === "number") {
		return (
			<NumberProp
				{...common}
				value={typeof value === "number" ? value : Number(value)}
				onChange={onChange}
				min={definition.min}
				max={definition.max}
				step={definition.step}
				unit={definition.unit}
				showSlider={
					definition.min !== undefined && definition.max !== undefined
				}
			/>
		);
	}

	if (definition.type === "color") {
		return (
			<ColorProp
				{...common}
				value={String(value)}
				onChange={onChange}
				allowAlpha
			/>
		);
	}

	if (definition.type === "enum" && definition.options?.length) {
		return (
			<SelectProp
				{...common}
				value={value}
				onChange={(nextValue) =>
					onChange(
						typeof nextValue === "string" ||
							typeof nextValue === "number" ||
							typeof nextValue === "boolean"
							? nextValue
							: String(nextValue)
					)
				}
				options={definition.options}
			/>
		);
	}

	return (
		<TextProp
			{...common}
			value={String(value)}
			onChange={onChange}
			placeholder={definition.placeholder}
			maxLength={definition.maxLength}
		/>
	);
}

/** Variable and presentation controls for a HyperFrames timeline element. */
export function HyperframesProperties({
	element,
	trackId,
}: HyperframesPropertiesProps) {
	const updateHyperframesElement = useTimelineStore(
		(state) => state.updateHyperframesElement
	);
	const defaults = useMemo(
		() =>
			Object.fromEntries(
				element.variableDefinitions.map((definition) => [
					definition.id,
					definition.default,
				])
			),
		[element.variableDefinitions]
	);
	const hasVariableChanges =
		JSON.stringify(defaults) !== JSON.stringify(element.variableValues);

	const updateVariable = useCallback(
		({ id, value }: { id: string; value: HyperframesVariableValue }) => {
			updateHyperframesElement(trackId, element.id, {
				variableValues: {
					...element.variableValues,
					[id]: value,
				},
			});
		},
		[element.id, element.variableValues, trackId, updateHyperframesElement]
	);

	const resetVariables = useCallback(() => {
		updateHyperframesElement(trackId, element.id, {
			variableValues: defaults,
		});
	}, [defaults, element.id, trackId, updateHyperframesElement]);

	return (
		<div className="space-y-4">
			<div className="flex items-start justify-between gap-2 border-b pb-3">
				<div className="flex min-w-0 items-center gap-2">
					<div className="flex size-8 shrink-0 items-center justify-center rounded bg-emerald-500/15">
						<CodeXml className="size-4 text-emerald-400" />
					</div>
					<div className="min-w-0">
						<div className="truncate text-sm font-medium">{element.name}</div>
						<div className="flex items-center gap-1.5">
							<Badge variant="secondary" className="px-1 py-0 text-[10px]">
								HyperFrames
							</Badge>
							<span className="truncate text-[10px] text-muted-foreground">
								{element.compositionId}
							</span>
						</div>
					</div>
				</div>
				<Button
					type="button"
					variant="outline"
					size="icon"
					className="size-7 shrink-0"
					onClick={resetVariables}
					disabled={!hasVariableChanges}
					title="Reset variables"
				>
					<RotateCcw className="size-3.5" />
				</Button>
			</div>

			<PropertyGroup title="Composition Variables">
				{element.variableDefinitions.length > 0 ? (
					<div className="space-y-4">
						{element.variableDefinitions.map((definition) => (
							<VariableEditor
								key={definition.id}
								definition={definition}
								value={
									element.variableValues[definition.id] ?? definition.default
								}
								onChange={(value) =>
									updateVariable({ id: definition.id, value })
								}
							/>
						))}
					</div>
				) : (
					<div className="flex items-start gap-2 text-xs text-muted-foreground">
						<Info className="mt-0.5 size-3.5 shrink-0" />
						This composition has no declared variables.
					</div>
				)}
			</PropertyGroup>

			<PropertyGroup title="Presentation" defaultExpanded={false}>
				<div className="space-y-4">
					<NumberProp
						name={`hyperframes-opacity-${element.id}`}
						label="Opacity"
						value={element.opacity ?? 1}
						onChange={(opacity) =>
							updateHyperframesElement(trackId, element.id, { opacity })
						}
						min={0}
						max={1}
						step={0.01}
						disabled={false}
					/>
					<NumberProp
						name={`hyperframes-scale-${element.id}`}
						label="Scale"
						value={element.scale ?? 1}
						onChange={(scale) =>
							updateHyperframesElement(trackId, element.id, { scale })
						}
						min={0.1}
						max={4}
						step={0.05}
						disabled={false}
					/>
				</div>
			</PropertyGroup>

			<PropertyGroup title="Composition Info" defaultExpanded={false}>
				<div className="grid grid-cols-2 gap-2 text-[10px]">
					<div>
						<span className="text-muted-foreground">Duration:</span>{" "}
						{element.duration.toFixed(2)}s
					</div>
					<div>
						<span className="text-muted-foreground">FPS:</span> {element.fps}
					</div>
					<div>
						<span className="text-muted-foreground">Size:</span>{" "}
						{element.compositionWidth}x{element.compositionHeight}
					</div>
					<div>
						<span className="text-muted-foreground">Mode:</span>{" "}
						{element.renderMode}
					</div>
				</div>
				<p
					className="mt-2 truncate text-[10px] text-muted-foreground"
					title={element.sourcePath}
				>
					{element.sourcePath}
				</p>
			</PropertyGroup>
		</div>
	);
}
