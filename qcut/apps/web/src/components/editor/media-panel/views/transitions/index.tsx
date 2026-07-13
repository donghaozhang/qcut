import { useMemo, useState } from "react";
import type { DragEvent } from "react";
import { SearchIcon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { useMediaStore } from "@/stores/media/media-store";
import { useAssetLibraryStore } from "@/stores/asset-library-store";
import { transitionCategories } from "./transition-categories";
import {
	filterTransitionPresets,
	getClipTransitionPresetConfig,
	transitionPresets,
	type ClipTransitionPresetConfig,
	type TransitionCategory,
	type TransitionPreset,
} from "./transition-presets";
import { TransitionCard } from "./transition-card";
import { getTransitionApplyState } from "./transition-apply-state";
import { recommendTransitions } from "./transition-recommendations";
import { useBeatDetectionStore } from "@/stores/beat-detection-store";
import { getTimelineElementDuration } from "@/lib/timeline";
import { collectTimelineBeats } from "@/lib/audio/timeline-beats";
import { buildTransitionContentText } from "./transition-content-analysis";
import { useTransitionContentAnalysis } from "./use-transition-content-analysis";

function encodeDragPayload({
	preset,
	config,
}: {
	preset: TransitionPreset;
	config: ClipTransitionPresetConfig;
}): string {
	return JSON.stringify({
		kind: "qcut-transition-preset",
		id: preset.id,
		type: config.type,
		direction: config.direction,
		tuning: config.tuning,
		defaultDuration: preset.defaultDuration,
	});
}

export function TransitionsView() {
	const [category, setCategory] = useState<TransitionCategory>("all");
	const [query, setQuery] = useState("");
	const [selectedPresetId, setSelectedPresetId] = useState("dissolve");
	const selectedElements = useTimelineStore((state) => state.selectedElements);
	const tracks = useTimelineStore((state) => state.tracks);
	const addTransition = useTimelineStore((state) => state.addTransition);
	const mediaItems = useMediaStore((state) => state.mediaItems);
	const beatCache = useBeatDetectionStore((state) => state.cache);
	const favorites = useAssetLibraryStore((state) => state.favorites);
	const toggleFavorite = useAssetLibraryStore((state) => state.toggleFavorite);
	const favoriteIds = useMemo(
		() =>
			new Set(
				Object.keys(favorites)
					.filter((identity) => identity.startsWith("transition:"))
					.map((identity) => identity.slice("transition:".length))
			),
		[favorites]
	);

	const visiblePresets = useMemo(
		() => filterTransitionPresets({ category, query, favoriteIds }),
		[category, favoriteIds, query]
	);
	const selectedPreset =
		visiblePresets.find((preset) => preset.id === selectedPresetId) ??
		visiblePresets[0];
	const applyState = getTransitionApplyState({ selectedElements, tracks });
	const canApply = applyState.status === "ready";
	const selectedConfig = selectedPreset
		? getClipTransitionPresetConfig({ preset: selectedPreset })
		: null;
	const previewSources = useMemo(() => {
		if (applyState.status !== "ready") return;
		const fromMedia = mediaItems.find(
			(item) => item.id === applyState.fromMediaId
		);
		const toMedia = mediaItems.find((item) => item.id === applyState.toMediaId);
		return {
			from: fromMedia?.thumbnailUrl,
			to: toMedia?.thumbnailUrl,
		};
	}, [applyState, mediaItems]);
	const visualSignals = useTransitionContentAnalysis({
		sources: previewSources,
	});
	const recommendations = useMemo(() => {
		if (applyState.status !== "ready") return [];
		const track = tracks.find(
			(candidate) => candidate.id === applyState.trackId
		);
		const fromElement = track?.elements.find(
			(candidate) => candidate.id === applyState.fromElementId
		);
		const toElement = track?.elements.find(
			(candidate) => candidate.id === applyState.toElementId
		);
		if (
			!track ||
			fromElement?.type !== "media" ||
			toElement?.type !== "media"
		) {
			return [];
		}
		const absoluteBeatTimes = collectTimelineBeats({ beatCache, tracks }).map(
			(beat) => beat.timestamp
		);
		const fromMedia = mediaItems.find(
			(item) => item.id === fromElement.mediaId
		);
		const toMedia = mediaItems.find((item) => item.id === toElement.mediaId);
		return recommendTransitions({
			beatTimes: absoluteBeatTimes,
			cutTime: toElement.startTime,
			fromDuration: getTimelineElementDuration({ element: fromElement }),
			fromName: buildTransitionContentText({
				fallbackName: fromElement.name,
				mediaItem: fromMedia,
			}),
			maxDuration: applyState.maxDuration,
			presets: transitionPresets.filter((preset) =>
				Boolean(getClipTransitionPresetConfig({ preset }))
			),
			toDuration: getTimelineElementDuration({ element: toElement }),
			toName: buildTransitionContentText({
				fallbackName: toElement.name,
				mediaItem: toMedia,
			}),
			visualSignals,
		});
	}, [applyState, beatCache, mediaItems, tracks, visualSignals]);

	const handleApply = ({
		duration,
		preset,
	}: {
		duration?: number;
		preset: TransitionPreset;
	}) => {
		if (applyState.status !== "ready") {
			toast.error(applyState.message);
			return;
		}
		const config = getClipTransitionPresetConfig({ preset });
		if (!config) {
			toast.info(
				`${preset.name} will be available in a later transition pack.`
			);
			return;
		}

		const transitionId = addTransition({
			trackId: applyState.trackId,
			fromElementId: applyState.fromElementId,
			toElementId: applyState.toElementId,
			presetId: preset.id,
			type: config.type,
			direction: config.direction,
			tuning: config.tuning,
			duration: Math.min(
				duration ?? preset.defaultDuration,
				applyState.maxDuration
			),
			easing: "easeInOut",
		});
		if (!transitionId) {
			toast.error("This cut does not have enough room for a transition.");
			return;
		}

		toast.success(`${preset.name} applied.`);
	};

	const handleDragStart = ({
		event,
		preset,
	}: {
		event: DragEvent<HTMLDivElement>;
		preset: TransitionPreset;
	}) => {
		const config = getClipTransitionPresetConfig({ preset });
		if (!config) {
			event.preventDefault();
			return;
		}
		event.dataTransfer.effectAllowed = "copy";
		event.dataTransfer.setData(
			"application/qcut-transition",
			encodeDragPayload({ preset, config })
		);
		event.dataTransfer.setData("text/plain", preset.name);
	};

	return (
		<div className="flex h-full min-h-0 bg-panel text-foreground">
			<aside className="w-[104px] shrink-0 border-r border-border/50 p-2">
				<div className="space-y-1">
					{transitionCategories.map((item) => {
						const Icon = item.icon;
						return (
							<button
								key={item.id}
								type="button"
								className={cn(
									"flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[11px] transition-colors",
									category === item.id
										? "bg-primary/15 text-primary"
										: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
								)}
								aria-pressed={category === item.id}
								onClick={() => setCategory(item.id)}
							>
								<Icon className="h-3.5 w-3.5 shrink-0" />
								<span className="truncate">{item.label}</span>
							</button>
						);
					})}
				</div>
			</aside>
			<section className="flex min-w-0 flex-1 flex-col">
				<div className="border-b border-border/50 p-3">
					<div className="relative">
						<SearchIcon className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="搜索转场"
							className="h-8 pl-8 text-xs"
							aria-label="搜索转场"
						/>
					</div>
					<div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
						<span>{visiblePresets.length} 个转场</span>
						<span className={cn(canApply && "text-primary")}>
							{applyState.message}
						</span>
					</div>
					{recommendations.length > 0 ? (
						<div
							className="mt-2 border-t border-border/50 pt-2"
							data-testid="transition-recommendations"
						>
							<div className="mb-1.5 flex items-center gap-1 text-[10px] font-medium text-primary">
								<SparklesIcon className="h-3 w-3">
									<title>智能转场推荐</title>
								</SparklesIcon>
								<span>智能推荐</span>
							</div>
							<div className="flex gap-1.5 overflow-x-auto pb-0.5">
								{recommendations.map((recommendation) => {
									const preset = transitionPresets.find(
										(candidate) => candidate.id === recommendation.presetId
									);
									if (!preset) return null;
									const applyRecommendation = () => {
										setSelectedPresetId(preset.id);
										handleApply({
											duration: recommendation.duration,
											preset,
										});
									};
									return (
										<button
											type="button"
											key={recommendation.presetId}
											className="min-w-28 shrink-0 border border-primary/30 bg-primary/5 px-2 py-1.5 text-left transition-colors hover:border-primary/60 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
											onClick={applyRecommendation}
											onKeyDown={(event) => {
												if (event.key !== "Enter" && event.key !== " ") return;
												event.preventDefault();
												applyRecommendation();
											}}
											aria-label={`应用推荐转场 ${preset.localizedName}`}
											title={`应用 ${preset.localizedName}: ${recommendation.reason}`}
											data-recommendation-score={recommendation.score.toFixed(
												2
											)}
											data-recommendation-duration={recommendation.duration.toFixed(
												3
											)}
										>
											<span className="block truncate text-[10px] font-medium text-foreground">
												{preset.localizedName}
											</span>
											<span className="block truncate text-[9px] text-muted-foreground">
												{recommendation.reason}
											</span>
										</button>
									);
								})}
							</div>
						</div>
					) : null}
				</div>
				<div className="min-h-0 flex-1 overflow-y-auto p-3">
					{visiblePresets.length > 0 ? (
						<div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
							{visiblePresets.map((preset) => (
								<TransitionCard
									key={preset.id}
									preset={preset}
									selected={selectedPreset?.id === preset.id}
									canApply={canApply}
									available={Boolean(getClipTransitionPresetConfig({ preset }))}
									favorite={favoriteIds.has(preset.id)}
									previewSources={previewSources}
									onSelect={({ preset: nextPreset }) =>
										setSelectedPresetId(nextPreset.id)
									}
									onApply={handleApply}
									onToggleFavorite={({ preset: favoritePreset }) =>
										toggleFavorite({
											kind: "transition",
											id: favoritePreset.id,
										})
									}
									onDragStart={handleDragStart}
								/>
							))}
						</div>
					) : (
						<div className="flex h-full items-center justify-center rounded-md border border-dashed border-border/70 text-center text-xs text-muted-foreground">
							没有符合条件的转场
						</div>
					)}
				</div>
				<div className="border-t border-border/50 p-3">
					<Button
						type="button"
						variant="secondary"
						size="sm"
						className="h-8 w-full text-xs"
						disabled={!canApply || !selectedPreset || !selectedConfig}
						onClick={() =>
							selectedPreset && handleApply({ preset: selectedPreset })
						}
					>
						应用所选转场
					</Button>
				</div>
			</section>
		</div>
	);
}

export default TransitionsView;
