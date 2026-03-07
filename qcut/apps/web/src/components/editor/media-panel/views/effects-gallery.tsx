import { useState, useCallback } from "react";
import { Star, Play, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { effectsSearchHelpers } from "./effects-search";
import type { EffectPreset } from "@/types/effects";

interface EffectsGalleryProps {
	effects: EffectPreset[];
	onApplyEffect: (preset: EffectPreset) => void;
	onDragStart?: (e: React.DragEvent, preset: EffectPreset) => void;
	onDragEnd?: () => void;
	viewMode?: "grid" | "list";
	showThumbnails?: boolean;
	className?: string;
}

export function EffectsGallery({
	effects,
	onApplyEffect,
	onDragStart,
	onDragEnd,
	viewMode = "grid",
	showThumbnails = true,
	className,
}: EffectsGalleryProps) {
	const [selectedEffect, setSelectedEffect] = useState<EffectPreset | null>(
		null
	);
	const [favorites, setFavorites] = useState<Set<string>>(() => {
		const saved = localStorage.getItem("effectsFavorites");
		return saved ? new Set(JSON.parse(saved)) : new Set();
	});

	const toggleFavorite = useCallback(
		(e: React.MouseEvent, presetId: string) => {
			e.stopPropagation();
			const isFav = effectsSearchHelpers.toggleFavorite(presetId);
			setFavorites((prev) => {
				const newFavs = new Set(prev);
				if (isFav) {
					newFavs.add(presetId);
				} else {
					newFavs.delete(presetId);
				}
				return newFavs;
			});
		},
		[]
	);

	const handleApply = useCallback(
		(preset: EffectPreset) => {
			onApplyEffect(preset);
			effectsSearchHelpers.addToRecent(preset.id);
		},
		[onApplyEffect]
	);

	const handlePreview = useCallback(
		(e: React.MouseEvent, preset: EffectPreset) => {
			e.stopPropagation();
			setSelectedEffect(preset);
		},
		[]
	);

	const getEffectThumbnail = (preset: EffectPreset) => {
		// Generate a CSS filter preview based on effect parameters
		const filters: string[] = [];

		if (preset.parameters.brightness !== undefined) {
			filters.push(`brightness(${1 + preset.parameters.brightness / 100})`);
		}
		if (preset.parameters.contrast !== undefined) {
			filters.push(`contrast(${1 + preset.parameters.contrast / 100})`);
		}
		if (preset.parameters.saturation !== undefined) {
			filters.push(`saturate(${1 + preset.parameters.saturation / 100})`);
		}
		if (preset.parameters.blur !== undefined) {
			filters.push(`blur(${preset.parameters.blur}px)`);
		}
		if (preset.parameters.grayscale !== undefined) {
			filters.push(`grayscale(${preset.parameters.grayscale}%)`);
		}
		if (preset.parameters.sepia !== undefined) {
			filters.push(`sepia(${preset.parameters.sepia}%)`);
		}
		if (preset.parameters.hue !== undefined) {
			filters.push(`hue-rotate(${preset.parameters.hue}deg)`);
		}
		if (preset.parameters.invert !== undefined) {
			filters.push(`invert(${preset.parameters.invert}%)`);
		}

		return filters.join(" ");
	};

	if (viewMode === "list") {
		return (
			<ScrollArea className={cn("h-full", className)}>
				<div className="space-y-2 p-4">
					{effects.map((preset) => (
						<Card
							key={preset.id}
							className="p-3 cursor-move hover:bg-accent/50 transition-colors"
							draggable
							onDragStart={(e) => onDragStart?.(e, preset)}
							onDragEnd={onDragEnd}
							onClick={() => handleApply(preset)}
						>
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-3">
									<span className="text-2xl">{preset.icon}</span>
									<div>
										<h4 className="font-medium">{preset.name}</h4>
										<p className="text-xs text-muted-foreground">
											{preset.description}
										</p>
									</div>
								</div>
								<div className="flex items-center gap-1">
									<Tooltip>
										<TooltipTrigger asChild>
											<Button
												type="button"
												variant="text"
												size="icon"
												className="h-8 w-8"
												aria-label={
													favorites.has(preset.id)
														? "Remove from favorites"
														: "Add to favorites"
												}
												aria-pressed={favorites.has(preset.id)}
												onClick={(e) => toggleFavorite(e, preset.id)}
											>
												<Star
													className={cn(
														"h-4 w-4",
														favorites.has(preset.id) &&
															"fill-yellow-500 text-yellow-500"
													)}
												/>
											</Button>
										</TooltipTrigger>
										<TooltipContent>
											{favorites.has(preset.id)
												? "Remove from favorites"
												: "Add to favorites"}
										</TooltipContent>
									</Tooltip>

									<Tooltip>
										<TooltipTrigger asChild>
											<Button
												type="button"
												variant="text"
												size="icon"
												className="h-8 w-8"
												aria-label="Preview effect"
												onClick={(e) => handlePreview(e, preset)}
											>
												<Info className="h-4 w-4" />
											</Button>
										</TooltipTrigger>
										<TooltipContent>Preview effect</TooltipContent>
									</Tooltip>
								</div>
							</div>
						</Card>
					))}
				</div>
			</ScrollArea>
		);
	}

	return (
		<>
			<div
				className={cn("grid gap-3 p-4", className, {
					"grid-cols-2 sm:grid-cols-3 md:grid-cols-4": viewMode === "grid",
				})}
			>
				{effects.map((preset) => (
					<Card
						key={preset.id}
						className={cn(
							"relative group cursor-move overflow-hidden transition-all",
							"hover:shadow-lg hover:scale-105",
							"focus-within:ring-2 focus-within:ring-primary"
						)}
						draggable
						onDragStart={(e) => onDragStart?.(e, preset)}
						onDragEnd={onDragEnd}
						onClick={() => handleApply(preset)}
					>
						{/* Thumbnail Preview */}
						{showThumbnails && (
							<div className="relative h-24 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900">
								<div
									className="absolute inset-0 flex items-center justify-center"
									style={{ filter: getEffectThumbnail(preset) }}
								>
									<div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-purple-600" />
								</div>

								{/* Favorite button overlay */}
								<Button
									type="button"
									variant="text"
									size="icon"
									className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
									aria-label={
										favorites.has(preset.id)
											? "Remove from favorites"
											: "Add to favorites"
									}
									aria-pressed={favorites.has(preset.id)}
									onClick={(e) => toggleFavorite(e, preset.id)}
								>
									<Star
										className={cn(
											"h-3 w-3",
											favorites.has(preset.id) &&
												"fill-yellow-500 text-yellow-500"
										)}
									/>
								</Button>
							</div>
						)}

						{/* Effect Info */}
						<div className="p-3">
							<div className="flex items-start justify-between gap-2">
								<div className="flex-1 min-w-0">
									<h4 className="font-medium text-sm truncate">
										{preset.name}
									</h4>
									<Badge variant="outline" className="mt-1 text-xs">
										{preset.category}
									</Badge>
								</div>
								<span className="text-2xl flex-shrink-0">{preset.icon}</span>
							</div>

							{/* Action buttons on hover */}
							<div className="mt-2 flex gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
								<Button
									type="button"
									variant="secondary"
									size="sm"
									className="flex-1 h-7 text-xs"
									onClick={(e) => {
										e.stopPropagation();
										handleApply(preset);
									}}
								>
									<Play className="h-3 w-3 mr-1" />
									Apply
								</Button>
								<Button
									type="button"
									variant="text"
									size="sm"
									className="h-7 w-7 p-0"
									onClick={(e) => handlePreview(e, preset)}
								>
									<Info className="h-3 w-3" />
								</Button>
							</div>
						</div>
					</Card>
				))}
			</div>

			{/* Effect Details Dialog */}
			<Dialog
				open={!!selectedEffect}
				onOpenChange={() => setSelectedEffect(null)}
			>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<span className="text-2xl">{selectedEffect?.icon}</span>
							{selectedEffect?.name}
						</DialogTitle>
						<DialogDescription>{selectedEffect?.description}</DialogDescription>
					</DialogHeader>

					{selectedEffect && (
						<div className="space-y-4">
							<div>
								<h4 className="font-medium mb-2">Category</h4>
								<Badge>{selectedEffect.category}</Badge>
							</div>

							<div>
								<h4 className="font-medium mb-2">Parameters</h4>
								<div className="space-y-2">
									{Object.entries(selectedEffect.parameters).map(
										([key, value]) => (
											<div key={key} className="flex justify-between text-sm">
												<span className="capitalize text-muted-foreground">
													{key}:
												</span>
												<span className="font-mono">{value}</span>
											</div>
										)
									)}
								</div>
							</div>

							<div>
								<h4 className="font-medium mb-2">Preview</h4>
								<div className="h-32 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 rounded-lg flex items-center justify-center">
									<div
										className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-400 to-purple-600"
										style={{ filter: getEffectThumbnail(selectedEffect) }}
									/>
								</div>
							</div>

							<div className="flex gap-2">
								<Button
									type="button"
									className="flex-1"
									onClick={() => {
										handleApply(selectedEffect);
										setSelectedEffect(null);
									}}
								>
									<Play className="h-4 w-4 mr-2" />
									Apply Effect
								</Button>
								<Button
									type="button"
									variant="outline"
									size="icon"
									aria-label={
										favorites.has(selectedEffect.id)
											? "Remove from favorites"
											: "Add to favorites"
									}
									aria-pressed={favorites.has(selectedEffect.id)}
									onClick={(e) => toggleFavorite(e, selectedEffect.id)}
								>
									<Star
										className={cn(
											"h-4 w-4",
											favorites.has(selectedEffect.id) &&
												"fill-yellow-500 text-yellow-500"
										)}
									/>
								</Button>
							</div>
						</div>
					)}
				</DialogContent>
			</Dialog>
		</>
	);
}
