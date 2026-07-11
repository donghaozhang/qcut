import { Search, Star } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
	COLOR_PRESETS_CHANGED_EVENT,
	loadColorPresets,
	type SavedColorPreset,
} from "@/lib/color/color-presets";
import {
	DEFAULT_MEDIA_COLOR_SETTINGS,
	normalizeMediaColorSettings,
} from "@/lib/color/color-properties";
import {
	loadFilterFavorites,
	persistFilterFavorites,
} from "@/lib/filters/filter-favorites";
import {
	FILTER_NONE_ID,
	FILTER_PRESETS,
	getFilterPreset,
} from "@/lib/filters/filter-registry";
import type { FilterPreset } from "@/lib/filters/filter-types";
import { DEFAULT_COLOR_FILTER_APPLICATION } from "@/lib/filters/filter-resolver";
import { cn } from "@/lib/utils";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { FILTER_CATEGORIES, type FilterCategoryId } from "./filter-categories";
import { updateSelectedMediaColors } from "./filter-application";
import { FilterCard } from "./filter-card";
import { getSelectedMediaTargets } from "./filter-selection";

type LibraryMode = "library" | "favorites";

function matchesQuery({
	preset,
	query,
}: {
	preset: FilterPreset;
	query: string;
}) {
	const normalized = query.trim().toLocaleLowerCase();
	if (!normalized) return true;
	return [preset.name, preset.localizedName, ...preset.tags]
		.join(" ")
		.toLocaleLowerCase()
		.includes(normalized);
}

function savedPresetMatchesQuery({
	preset,
	query,
}: {
	preset: SavedColorPreset;
	query: string;
}) {
	return preset.name
		.toLocaleLowerCase()
		.includes(query.trim().toLocaleLowerCase());
}

export function FiltersView() {
	const [mode, setMode] = useState<LibraryMode>("library");
	const [category, setCategory] = useState<FilterCategoryId>("all");
	const [query, setQuery] = useState("");
	const [favorites, setFavorites] = useState(loadFilterFavorites);
	const [savedPresets, setSavedPresets] = useState(loadColorPresets);
	const [selectedSavedPresetId, setSelectedSavedPresetId] = useState<string>();
	const intensityInteractionActive = useRef(false);
	const selectedElements = useTimelineStore((state) => state.selectedElements);
	const tracks = useTimelineStore((state) => state.tracks);
	const selectedTargets = useMemo(
		() => getSelectedMediaTargets({ selectedElements, tracks }),
		[selectedElements, tracks]
	);
	const activeColor = selectedTargets[0]
		? normalizeMediaColorSettings({ element: selectedTargets[0].element })
		: DEFAULT_MEDIA_COLOR_SETTINGS;
	const activeFilter = activeColor.filter;
	const activePreset = getFilterPreset({ presetId: activeFilter.presetId });
	const hasSelection = selectedTargets.length > 0;
	const favoriteIds = useMemo(() => new Set(favorites), [favorites]);

	useEffect(() => {
		const refresh = () => setSavedPresets(loadColorPresets());
		window.addEventListener(COLOR_PRESETS_CHANGED_EVENT, refresh);
		window.addEventListener("storage", refresh);
		return () => {
			window.removeEventListener(COLOR_PRESETS_CHANGED_EVENT, refresh);
			window.removeEventListener("storage", refresh);
		};
	}, []);

	const visiblePresets = useMemo(
		() =>
			FILTER_PRESETS.filter((preset) => {
				if (
					category !== "all" &&
					category !== "mine" &&
					preset.category !== category
				)
					return false;
				if (category === "mine") return false;
				if (mode === "favorites" && !favoriteIds.has(preset.id)) return false;
				return matchesQuery({ preset, query });
			}),
		[category, favoriteIds, mode, query]
	);
	const visibleSavedPresets = useMemo(
		() =>
			category === "mine" && mode === "library"
				? savedPresets.filter((preset) =>
						savedPresetMatchesQuery({ preset, query })
					)
				: [],
		[category, mode, query, savedPresets]
	);

	const applyFilter = ({ preset }: { preset: FilterPreset | undefined }) => {
		const filter = preset
			? {
					presetId: preset.id,
					presetVersion: preset.version,
					intensity: preset.defaultIntensity,
				}
			: { ...DEFAULT_COLOR_FILTER_APPLICATION };
		const updated = updateSelectedMediaColors({
			timeline: useTimelineStore.getState(),
			history: true,
			transform: ({ settings }) => ({ ...settings, enabled: true, filter }),
		});
		if (updated === 0) {
			toast.info("Select an image or video clip first");
			return;
		}
		setSelectedSavedPresetId(undefined);
		toast.success(preset ? `Applied ${preset.name}` : "Filter removed");
	};

	const applySavedPreset = ({ preset }: { preset: SavedColorPreset }) => {
		const updated = updateSelectedMediaColors({
			timeline: useTimelineStore.getState(),
			history: true,
			transform: () => structuredClone(preset.color),
		});
		if (updated === 0) {
			toast.info("Select an image or video clip first");
			return;
		}
		setSelectedSavedPresetId(preset.id);
		toast.success(`Applied ${preset.name}`);
	};

	const updateIntensity = ({ value }: { value: number }) => {
		if (!activePreset) return;
		if (!intensityInteractionActive.current) {
			useTimelineStore.getState().pushHistory();
			intensityInteractionActive.current = true;
		}
		updateSelectedMediaColors({
			timeline: useTimelineStore.getState(),
			history: false,
			transform: ({ settings }) =>
				settings.filter.presetId === activePreset.id
					? { ...settings, filter: { ...settings.filter, intensity: value } }
					: undefined,
		});
	};

	const toggleFavorite = ({ presetId }: { presetId: string }) => {
		const next = favoriteIds.has(presetId)
			? favorites.filter((id) => id !== presetId)
			: [...favorites, presetId];
		setFavorites(next);
		persistFilterFavorites({ presetIds: next });
	};

	const showNoneCard =
		mode === "library" && category === "all" && query.trim().length === 0;
	const resultCount = visiblePresets.length + visibleSavedPresets.length;

	return (
		<div
			className="flex h-full min-h-0 flex-col bg-panel text-foreground"
			data-testid="filters-view"
		>
			<div className="border-b border-border/50 p-3">
				<div className="grid grid-cols-2 rounded-md bg-foreground/5 p-0.5">
					{(["library", "favorites"] as const).map((item) => (
						<button
							key={item}
							type="button"
							className={cn(
								"flex h-7 items-center justify-center gap-1.5 rounded text-[11px] font-medium transition-colors",
								mode === item
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground"
							)}
							onClick={() => {
								setMode(item);
								if (item === "favorites" && category === "mine")
									setCategory("all");
							}}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.currentTarget.click();
								}
							}}
							aria-pressed={mode === item}
						>
							{item === "favorites" && <Star className="size-3" />}
							{item === "library" ? "Filter library" : "Favorites"}
						</button>
					))}
				</div>
				<div className="relative mt-2">
					<Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search filters / 搜索滤镜"
						className="h-8 pl-8 text-xs"
						aria-label="Search filters"
					/>
				</div>
			</div>

			<div className="flex min-h-0 flex-1">
				<aside className="w-[94px] shrink-0 overflow-y-auto border-r border-border/50 p-2">
					<div className="space-y-0.5">
						{FILTER_CATEGORIES.filter(
							(item) => mode === "library" || item.id !== "mine"
						).map((item) => {
							const Icon = item.icon;
							return (
								<button
									key={item.id}
									type="button"
									className={cn(
										"flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[10px] transition-colors",
										category === item.id
											? "bg-primary/15 text-primary"
											: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
									)}
									aria-pressed={category === item.id}
									onClick={() => setCategory(item.id)}
									onKeyDown={(event) => {
										if (event.key === "Enter" || event.key === " ") {
											event.currentTarget.click();
										}
									}}
								>
									<Icon className="size-3.5 shrink-0" />
									<span className="truncate">{item.label}</span>
								</button>
							);
						})}
					</div>
				</aside>

				<section className="flex min-w-0 flex-1 flex-col">
					<div className="flex h-8 shrink-0 items-center justify-between border-b border-border/40 px-3 text-[10px] text-muted-foreground">
						<span>{resultCount + (showNoneCard ? 1 : 0)} filters</span>
						<span>
							{hasSelection
								? `${selectedTargets.length} clip selected`
								: "Select a clip"}
						</span>
					</div>
					<div className="min-h-0 flex-1 overflow-y-auto p-3">
						{resultCount > 0 || showNoneCard ? (
							<div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2">
								{showNoneCard && (
									<FilterCard
										id={FILTER_NONE_ID}
										name="None"
										localizedName="无滤镜"
										thumbnail="/images/filter-previews/none.webp"
										selected={activeFilter.presetId === FILTER_NONE_ID}
										disabled={!hasSelection}
										reset
										onSelect={() => applyFilter({ preset: undefined })}
									/>
								)}
								{visiblePresets.map((preset) => (
									<FilterCard
										key={preset.id}
										id={preset.id}
										name={preset.name}
										localizedName={preset.localizedName}
										thumbnail={preset.thumbnail}
										selected={activeFilter.presetId === preset.id}
										disabled={!hasSelection}
										favorite={favoriteIds.has(preset.id)}
										onSelect={() => applyFilter({ preset })}
										onFavoriteChange={() =>
											toggleFavorite({ presetId: preset.id })
										}
									/>
								))}
								{visibleSavedPresets.map((preset) => (
									<FilterCard
										key={preset.id}
										id={preset.id}
										name={preset.name}
										localizedName="Saved color preset"
										thumbnail="/images/filter-previews/none.webp"
										selected={selectedSavedPresetId === preset.id}
										disabled={!hasSelection}
										onSelect={() => applySavedPreset({ preset })}
									/>
								))}
							</div>
						) : (
							<div className="flex h-full min-h-40 items-center justify-center rounded-md border border-dashed border-border/70 px-6 text-center text-xs text-muted-foreground">
								{mode === "favorites"
									? "Favorite filters appear here."
									: category === "mine"
										? "Save a color preset to add it here."
										: "No filters match this search."}
							</div>
						)}
					</div>
				</section>
			</div>

			<div className="h-[68px] shrink-0 border-t border-border/50 px-3 py-2">
				{activePreset ? (
					<div className="flex h-full items-center gap-3">
						<div className="w-[112px] min-w-0">
							<div className="truncate text-xs font-medium">
								{activePreset.name}
							</div>
							<div className="truncate text-[10px] text-muted-foreground">
								{activePreset.localizedName}
							</div>
						</div>
						<div className="min-w-0 flex-1">
							<div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
								<span>Intensity</span>
								<span className="tabular-nums">
									{Math.round(activeFilter.intensity)}%
								</span>
							</div>
							<Slider
								value={[activeFilter.intensity]}
								min={0}
								max={100}
								step={1}
								disabled={!hasSelection}
								aria-label="Filter intensity"
								onValueChange={([value]) => updateIntensity({ value })}
								onValueCommit={() => {
									intensityInteractionActive.current = false;
								}}
							/>
						</div>
					</div>
				) : (
					<div className="flex h-full items-center text-[11px] text-muted-foreground">
						{hasSelection
							? "Choose a filter to adjust its intensity."
							: "Select one or more image or video clips to apply a filter."}
					</div>
				)}
			</div>
		</div>
	);
}

export default FiltersView;
