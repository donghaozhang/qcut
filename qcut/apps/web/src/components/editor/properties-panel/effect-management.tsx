"use client";

import { useState } from "react";
import { useEffectsStore } from "@/stores/ai/effects-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	Copy,
	Trash2,
	RotateCcw,
	Clock,
	Layers,
	ChevronUp,
	ChevronDown,
	Eye,
	EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EffectInstance, EffectPreset } from "@/types/effects";
import { generateUUID } from "@/lib/utils";

interface EffectManagementProps {
	elementId: string;
	className?: string;
}

export function EffectManagement({
	elementId,
	className,
}: EffectManagementProps) {
	const {
		getElementEffects,
		updateEffectParameters,
		removeEffect,
		clearEffects,
		applyEffect,
		toggleEffect,
		reorderEffects,
		duplicateEffect,
		resetEffectToDefaults,
	} = useEffectsStore();

	const effects = getElementEffects(elementId);
	const [expandedEffects, setExpandedEffects] = useState<Set<string>>(
		new Set()
	);
	const [effectTimeRanges, setEffectTimeRanges] = useState<
		Map<string, { start: number; end: number }>
	>(new Map());

	const handleToggleEffect = (effectId: string) => {
		toggleEffect(elementId, effectId);
	};

	const handleDuplicateEffect = (effect: EffectInstance) => {
		const duplicatedEffect: EffectPreset = {
			id: `${effect.id}-copy-${generateUUID().slice(0, 8)}`,
			name: `${effect.name} (Copy)`,
			description: `Copy of ${effect.name}`,
			category: "basic",
			icon: "📋",
			parameters: { ...effect.parameters },
		};
		applyEffect(elementId, duplicatedEffect);
	};

	const handleResetEffect = (effectId: string) => {
		resetEffectToDefaults(elementId, effectId);
	};

	const handleMoveEffect = (effectId: string, direction: "up" | "down") => {
		const currentIndex = effects.findIndex((e) => e.id === effectId);
		if (currentIndex === -1) return;

		const newIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
		if (newIndex < 0 || newIndex >= effects.length) return;

		const newOrder = [...effects];
		[newOrder[currentIndex], newOrder[newIndex]] = [
			newOrder[newIndex],
			newOrder[currentIndex],
		];
		reorderEffects(
			elementId,
			newOrder.map((e) => e.id)
		);
	};

	const handleSetTimeRange = (effectId: string, start: number, end: number) => {
		const newRanges = new Map(effectTimeRanges);
		newRanges.set(effectId, { start, end });
		setEffectTimeRanges(newRanges);
		// TODO: Implement actual time range trimming when keyframes are supported
	};

	const toggleExpanded = (effectId: string) => {
		const newExpanded = new Set(expandedEffects);
		if (newExpanded.has(effectId)) {
			newExpanded.delete(effectId);
		} else {
			newExpanded.add(effectId);
		}
		setExpandedEffects(newExpanded);
	};

	if (effects.length === 0) {
		return (
			<div className={cn("p-4 text-center text-muted-foreground", className)}>
				No effects applied. Add effects from the Media Panel.
			</div>
		);
	}

	return (
		<div className={cn("space-y-4", className)}>
			{/* Header Actions */}
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-medium">
					Applied Effects ({effects.length})
				</h3>
				<Button
					type="button"
					variant="text"
					size="sm"
					onClick={() => clearEffects(elementId)}
					className="text-destructive hover:text-destructive"
				>
					<Trash2 className="h-4 w-4 mr-1" />
					Clear All
				</Button>
			</div>

			{/* Effects List */}
			<div className="space-y-2">
				{effects.map((effect, index) => {
					const isExpanded = expandedEffects.has(effect.id);
					const timeRange = effectTimeRanges.get(effect.id);

					return (
						<Card key={effect.id} className="overflow-hidden">
							<CardHeader className="p-3">
								<div className="flex items-center justify-between">
									<div className="flex items-center space-x-2">
										{/* Effect Order */}
										<span className="text-xs text-muted-foreground">
											#{index + 1}
										</span>

										{/* Effect Icon */}
										<span className="text-lg">✨</span>

										{/* Effect Name */}
										<CardTitle className="text-sm">{effect.name}</CardTitle>

										{/* Enable/Disable Switch */}
										<Switch
											checked={effect.enabled}
											onCheckedChange={() => handleToggleEffect(effect.id)}
											aria-label="Toggle effect"
											className="scale-75"
										/>
									</div>

									<div className="flex items-center space-x-1">
										{/* Reorder Buttons */}
										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													type="button"
													variant="text"
													size="icon"
													className="h-6 w-6"
													aria-label="Move effect up"
													onClick={() => handleMoveEffect(effect.id, "up")}
													disabled={index === 0}
												>
													<ChevronUp className="h-3 w-3" />
												</Button>
											</TooltipTrigger>
											<TooltipContent>Move Up</TooltipContent>
										</Tooltip>

										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													type="button"
													variant="text"
													size="icon"
													className="h-6 w-6"
													aria-label="Move effect down"
													onClick={() => handleMoveEffect(effect.id, "down")}
													disabled={index === effects.length - 1}
												>
													<ChevronDown className="h-3 w-3" />
												</Button>
											</TooltipTrigger>
											<TooltipContent>Move Down</TooltipContent>
										</Tooltip>

										{/* Action Buttons */}
										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													type="button"
													variant="text"
													size="icon"
													className="h-6 w-6"
													aria-label="Duplicate effect"
													onClick={() => handleDuplicateEffect(effect)}
												>
													<Copy className="h-3 w-3" />
												</Button>
											</TooltipTrigger>
											<TooltipContent>Duplicate Effect</TooltipContent>
										</Tooltip>

										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													type="button"
													variant="text"
													size="icon"
													className="h-6 w-6"
													aria-label="Reset effect to defaults"
													onClick={() => handleResetEffect(effect.id)}
												>
													<RotateCcw className="h-3 w-3" />
												</Button>
											</TooltipTrigger>
											<TooltipContent>Reset to Defaults</TooltipContent>
										</Tooltip>

										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													type="button"
													variant="text"
													size="icon"
													className="h-6 w-6"
													aria-label="Remove effect"
													onClick={() => removeEffect(elementId, effect.id)}
												>
													<Trash2 className="h-3 w-3" />
												</Button>
											</TooltipTrigger>
											<TooltipContent>Remove Effect</TooltipContent>
										</Tooltip>

										{/* Expand/Collapse */}
										<Button
											type="button"
											variant="text"
											size="icon"
											className="h-6 w-6"
											aria-label={
												isExpanded
													? "Collapse effect details"
													: "Expand effect details"
											}
											aria-expanded={isExpanded}
											aria-controls={`effect-${effect.id}-panel`}
											onClick={() => toggleExpanded(effect.id)}
										>
											{isExpanded ? (
												<Eye className="h-3 w-3" />
											) : (
												<EyeOff className="h-3 w-3" />
											)}
										</Button>
									</div>
								</div>
							</CardHeader>

							{isExpanded && (
								<CardContent
									id={`effect-${effect.id}-panel`}
									className="p-3 pt-0 space-y-3"
								>
									{/* Parameter Controls */}
									<div className="space-y-2">
										{Object.entries(effect.parameters).map(([param, value]) => (
											<div key={param} className="space-y-1">
												<div className="flex justify-between">
													<label className="text-xs capitalize">
														{param.replace(/([A-Z])/g, " $1").trim()}
													</label>
													<span className="text-xs text-muted-foreground">
														{typeof value === "number" ? `${value}%` : value}
													</span>
												</div>
												{typeof value === "number" && (
													<Slider
														value={[value]}
														onValueChange={([newValue]) => {
															updateEffectParameters(elementId, effect.id, {
																[param]: newValue,
															});
														}}
														min={-100}
														max={100}
														step={1}
														className="h-1"
													/>
												)}
											</div>
										))}
									</div>

									{/* Time Range Control (for future keyframe support) */}
									<div className="border-t pt-3">
										<div className="flex items-center justify-between mb-2">
											<label className="text-xs flex items-center">
												<Clock className="h-3 w-3 mr-1" />
												Time Range
											</label>
											<span className="text-xs text-muted-foreground">
												{timeRange
													? `${timeRange.start}s - ${timeRange.end}s`
													: "Full Duration"}
											</span>
										</div>
										<div className="flex space-x-2">
											<input
												type="number"
												placeholder="Start"
												className="flex-1 px-2 py-1 text-xs border rounded"
												min={0}
												aria-label="Effect start time (s)"
												value={timeRange?.start || ""}
												onChange={(e) => {
													const start = parseFloat(e.target.value) || 0;
													const end = timeRange?.end || 999;
													handleSetTimeRange(effect.id, start, end);
												}}
											/>
											<input
												type="number"
												placeholder="End"
												className="flex-1 px-2 py-1 text-xs border rounded"
												min={0}
												aria-label="Effect end time (s)"
												value={timeRange?.end || ""}
												onChange={(e) => {
													const start = timeRange?.start || 0;
													const end = parseFloat(e.target.value) || 999;
													handleSetTimeRange(effect.id, start, end);
												}}
											/>
										</div>
									</div>
								</CardContent>
							)}
						</Card>
					);
				})}
			</div>

			{/* Layer Mode Indicator */}
			<div className="flex items-center space-x-2 p-2 bg-muted rounded text-xs">
				<Layers className="h-3 w-3" />
				<span>Effects are applied in order from top to bottom</span>
			</div>
		</div>
	);
}
