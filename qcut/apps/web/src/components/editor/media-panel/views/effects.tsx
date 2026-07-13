import {
	BrushIcon,
	ClapperboardIcon,
	FilmIcon,
	PaletteIcon,
	SlidersHorizontalIcon,
	SparklesIcon,
	type LucideIcon,
} from "lucide-react";
import { useMemo, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { parametersToCSSFilters } from "@/lib/effects/effects-utils";
import { cn } from "@/lib/utils";
import { useEffectsStore } from "@/stores/ai/effects-store";
import { useMediaStore } from "@/stores/media/media-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { EffectCategory, EffectPreset } from "@/types/effects";

const FALLBACK_PREVIEW = "/images/filter-previews/coastal.webp";

interface EffectCategoryItem {
	id: EffectCategory | "all";
	label: string;
	icon: LucideIcon;
}

const EFFECT_CATEGORIES: EffectCategoryItem[] = [
	{ id: "all", label: "All", icon: SparklesIcon },
	{ id: "basic", label: "Basic", icon: SlidersHorizontalIcon },
	{ id: "color", label: "Color", icon: PaletteIcon },
	{ id: "artistic", label: "Artistic", icon: BrushIcon },
	{ id: "vintage", label: "Vintage", icon: FilmIcon },
	{ id: "cinematic", label: "Cinema", icon: ClapperboardIcon },
];

export default function EffectsView() {
	const presets = useEffectsStore((state) => state.presets);
	const selectedCategory = useEffectsStore((state) => state.selectedCategory);
	const setSelectedCategory = useEffectsStore(
		(state) => state.setSelectedCategory
	);
	const applyEffect = useEffectsStore((state) => state.applyEffect);
	const selectedElements = useTimelineStore((state) => state.selectedElements);
	const tracks = useTimelineStore((state) => state.tracks);
	const autoShowEffectsTrack = useTimelineStore(
		(state) => state.autoShowEffectsTrack
	);
	const mediaItems = useMediaStore((state) => state.mediaItems);
	const [searchQuery, setSearchQuery] = useState("");
	const [draggedEffectId, setDraggedEffectId] = useState<string | null>(null);

	const filteredPresets = useMemo(() => {
		const normalizedQuery = searchQuery.trim().toLowerCase();
		return presets.filter((preset) => {
			const matchesCategory =
				selectedCategory === "all" || preset.category === selectedCategory;
			if (!matchesCategory) return false;
			if (!normalizedQuery) return true;
			return `${preset.name} ${preset.description}`
				.toLowerCase()
				.includes(normalizedQuery);
		});
	}, [presets, searchQuery, selectedCategory]);

	const previewSource = useMemo(() => {
		const selection = selectedElements[0];
		const track = tracks.find(
			(candidate) => candidate.id === selection?.trackId
		);
		const element = track?.elements.find(
			(candidate) => candidate.id === selection?.elementId
		);
		if (element?.type !== "media") return FALLBACK_PREVIEW;
		const mediaItem = mediaItems.find((item) => item.id === element.mediaId);
		if (!mediaItem) return FALLBACK_PREVIEW;
		return (
			mediaItem.thumbnailUrl ||
			(mediaItem.type === "image" ? mediaItem.url : undefined) ||
			FALLBACK_PREVIEW
		);
	}, [mediaItems, selectedElements, tracks]);

	const handleApplyEffect = ({ preset }: { preset: EffectPreset }) => {
		const selectedElementId = selectedElements[0]?.elementId;
		if (!selectedElementId) {
			toast.info("Select a timeline clip before applying an effect.");
			return;
		}
		applyEffect(selectedElementId, preset);
		autoShowEffectsTrack();
	};

	const handleDragStart = ({
		event,
		preset,
	}: {
		event: DragEvent<HTMLButtonElement>;
		preset: EffectPreset;
	}) => {
		setDraggedEffectId(preset.id);
		event.dataTransfer.effectAllowed = "copy";
		event.dataTransfer.setData(
			"application/json",
			JSON.stringify({ type: "effect", preset })
		);
	};

	return (
		<div
			className="flex h-full min-h-0 bg-panel text-foreground"
			data-testid="effects-view"
		>
			<aside className="w-[104px] shrink-0 border-r border-border/50 p-2">
				<div className="space-y-1">
					{EFFECT_CATEGORIES.map((category) => {
						const Icon = category.icon;
						return (
							<button
								key={category.id}
								type="button"
								className={cn(
									"flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[11px] transition-colors",
									selectedCategory === category.id
										? "bg-primary/15 text-primary"
										: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
								)}
								aria-pressed={selectedCategory === category.id}
								data-testid={`effect-category-${category.id}`}
								onClick={() => setSelectedCategory(category.id)}
								onKeyDown={(event) => {
									if (event.key === "Escape") event.currentTarget.blur();
								}}
							>
								<Icon className="size-3.5 shrink-0" />
								<span className="truncate">{category.label}</span>
							</button>
						);
					})}
				</div>
			</aside>

			<section className="flex min-w-0 flex-1 flex-col">
				<div className="border-b border-border/50 p-3">
					<Input
						type="search"
						placeholder="Search effects"
						value={searchQuery}
						onChange={(event) => setSearchQuery(event.target.value)}
						className="h-8 w-full text-xs"
						aria-label="Search effects"
					/>
					<div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
						<span>{filteredPresets.length} effects</span>
						<span className={cn(selectedElements.length > 0 && "text-primary")}>
							{selectedElements.length > 0
								? "Apply to selected clip"
								: "Select a timeline clip"}
						</span>
					</div>
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto p-3">
					{filteredPresets.length > 0 ? (
						<div className="grid grid-cols-[repeat(auto-fill,minmax(108px,1fr))] gap-2">
							{filteredPresets.map((preset) => (
								<button
									key={preset.id}
									type="button"
									className={cn(
										"group flex h-[116px] min-w-0 flex-col overflow-hidden rounded-md border bg-card text-left transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
										draggedEffectId === preset.id && "opacity-50"
									)}
									aria-label={`Apply ${preset.name} effect`}
									data-testid={`effect-card-${preset.id}`}
									draggable
									title={`${preset.name}: ${preset.description}`}
									onClick={() => handleApplyEffect({ preset })}
									onKeyDown={(event) => {
										if (event.key === "Escape") event.currentTarget.blur();
									}}
									onDragStart={(event) => handleDragStart({ event, preset })}
									onDragEnd={() => setDraggedEffectId(null)}
								>
									<div className="h-[82px] w-full shrink-0 overflow-hidden bg-black">
										<img
											src={previewSource}
											alt=""
											className="size-full scale-[1.04] object-cover"
											style={{
												filter: parametersToCSSFilters(preset.parameters),
											}}
											draggable={false}
										/>
									</div>
									<div className="flex min-h-0 flex-1 items-center justify-between gap-1.5 px-2">
										<span className="truncate text-[11px] font-medium">
											{preset.name}
										</span>
										<span className="shrink-0 text-[9px] text-primary">
											Ready
										</span>
									</div>
								</button>
							))}
						</div>
					) : (
						<div className="flex h-full items-center justify-center rounded-md border border-dashed border-border/70 text-center text-xs text-muted-foreground">
							No effects match this search.
						</div>
					)}
				</div>
			</section>
		</div>
	);
}
