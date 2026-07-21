import {
	Activity,
	Aperture,
	AudioLines,
	CloudSun,
	Flame,
	Frame,
	Grid2X2,
	Heart,
	Leaf,
	Lightbulb,
	Search,
	SlidersHorizontal,
	Sparkles,
	Star,
	Sun,
	UserRound,
	Video,
	Volume2,
	WandSparkles,
	Zap,
	type LucideIcon,
} from "lucide-react";
import { useMemo, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { EFFECT_CATALOG } from "@/lib/effects/effect-catalog";
import {
	EFFECT_LIBRARY_SECTIONS,
	VISUAL_EFFECT_NAVIGATION,
} from "@/lib/effects/effect-catalog-navigation";
import { selectEffectCatalogEntries } from "@/lib/effects/effect-catalog-selectors";
import type {
	EffectCatalogNavigation,
	EffectCatalogEntry,
	EffectCollectionId,
	EffectLibrarySectionId,
	VisualEffectCategoryId,
} from "@/lib/effects/effect-catalog-types";
import {
	readEffectFavoriteIds,
	toggleEffectFavoriteId,
	writeEffectFavoriteIds,
} from "@/lib/effects/effect-favorites";
import { getEffectPresetTranslationKeys } from "@/lib/effects/effect-preset-translations";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useEffectsStore } from "@/stores/ai/effects-store";
import { useMediaStore } from "@/stores/media/media-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { EffectPreset } from "@/types/effects";
import { EffectPreviewThumbnail } from "./effect-preview-thumbnail";

const FALLBACK_PREVIEW = "/images/filter-previews/coastal.webp";

const SECTION_ICONS: Record<EffectLibrarySectionId, LucideIcon> = {
	favorites: Star,
	visual: Sparkles,
	person: UserRound,
};

const CATEGORY_ICONS: Record<VisualEffectCategoryId, LucideIcon> = {
	basic: SlidersHorizontal,
	dynamic: Activity,
	atmosphere: CloudSun,
	trendy: Zap,
	border: Frame,
	multiscreen: Grid2X2,
	sound: Volume2,
	light: Sun,
	heart: Heart,
	audio: AudioLines,
	"creative-ai": WandSparkles,
	camera: Video,
	nature: Leaf,
};

const COLLECTION_ICONS: Record<EffectCollectionId, LucideIcon> = {
	popular: Flame,
	latest: Lightbulb,
};

function navigationMatches({
	left,
	right,
}: {
	left: EffectCatalogNavigation;
	right: EffectCatalogNavigation;
}): boolean {
	return left.kind === right.kind && left.id === right.id;
}

function navigationIcon({
	navigation,
}: {
	navigation: EffectCatalogNavigation;
}): LucideIcon {
	return navigation.kind === "category"
		? CATEGORY_ICONS[navigation.id]
		: COLLECTION_ICONS[navigation.id];
}

function localizeCatalogEntry({
	entry,
	locale,
	t,
}: {
	entry: EffectCatalogEntry;
	locale: "en" | "zh";
	t: ReturnType<typeof useTranslation>["t"];
}): { entry: EffectCatalogEntry; name: string; description: string } {
	const translationKeys = getEffectPresetTranslationKeys({
		presetId: entry.preset.id,
	});
	if (locale === "zh" && entry.localizedName) {
		return {
			entry,
			name: entry.localizedName,
			description: entry.localizedDescription ?? entry.preset.description,
		};
	}
	return {
		entry,
		name: translationKeys ? t(translationKeys.name) : entry.preset.name,
		description: translationKeys
			? t(translationKeys.description)
			: entry.preset.description,
	};
}

export default function EffectsView() {
	const { locale, t } = useTranslation();
	const applyEffect = useEffectsStore((state) => state.applyEffect);
	const selectedElements = useTimelineStore((state) => state.selectedElements);
	const tracks = useTimelineStore((state) => state.tracks);
	const autoShowEffectsTrack = useTimelineStore(
		(state) => state.autoShowEffectsTrack
	);
	const mediaItems = useMediaStore((state) => state.mediaItems);
	const [selectedSection, setSelectedSection] =
		useState<EffectLibrarySectionId>("visual");
	const [selectedNavigation, setSelectedNavigation] =
		useState<EffectCatalogNavigation>({ kind: "collection", id: "popular" });
	const [searchQuery, setSearchQuery] = useState("");
	const [draggedEffectId, setDraggedEffectId] = useState<string | null>(null);
	const [favoriteIds, setFavoriteIds] = useState(readEffectFavoriteIds);

	const localizedCatalog = useMemo(
		() =>
			EFFECT_CATALOG.map((entry) => localizeCatalogEntry({ entry, locale, t })),
		[locale, t]
	);

	const visibleEntries = useMemo(() => {
		const normalizedQuery = searchQuery.trim().toLowerCase();
		const selectedEntries = selectEffectCatalogEntries({
			entries: EFFECT_CATALOG,
			section: selectedSection,
			navigation:
				selectedSection === "visual" && !normalizedQuery
					? selectedNavigation
					: undefined,
			favoriteIds,
			collectionLimit: 12,
		});
		const selectedIds = new Set(
			selectedEntries.map((entry) => entry.preset.id)
		);
		return localizedCatalog.filter(({ entry, name, description }) => {
			if (!selectedIds.has(entry.preset.id)) return false;
			if (!normalizedQuery) return true;
			return [
				name,
				description,
				entry.preset.name,
				entry.preset.description,
				entry.category,
				...entry.tags,
			]
				.join(" ")
				.toLowerCase()
				.includes(normalizedQuery);
		});
	}, [
		favoriteIds,
		localizedCatalog,
		searchQuery,
		selectedNavigation,
		selectedSection,
	]);

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
			toast.info(t("effects.toast.selectClip"));
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

	const handleToggleFavorite = ({ presetId }: { presetId: string }) => {
		const next = toggleEffectFavoriteId({ favoriteIds, presetId });
		setFavoriteIds(next);
		writeEffectFavoriteIds({ favoriteIds: next });
	};

	return (
		<div
			className="flex h-full min-h-0 bg-panel text-foreground"
			data-testid="effects-view"
		>
			<aside className="w-[116px] shrink-0 overflow-y-auto border-r border-border/50 p-2">
				<div className="space-y-1">
					{EFFECT_LIBRARY_SECTIONS.map((section) => {
						const Icon = SECTION_ICONS[section.id];
						const selected = selectedSection === section.id;
						return (
							<div key={section.id}>
								<button
									type="button"
									className={cn(
										"flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[11px] font-medium transition-colors",
										selected
											? "bg-foreground/10 text-foreground"
											: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
									)}
									aria-pressed={selected}
									data-testid={`effect-section-${section.id}`}
									onClick={() => setSelectedSection(section.id)}
									onKeyDown={(event) => {
										if (event.key === "Escape") event.currentTarget.blur();
									}}
								>
									<Icon className="size-3.5 shrink-0" />
									<span className="truncate">
										{locale === "zh" ? section.localizedLabel : section.label}
									</span>
								</button>
								{section.id === "visual" && selected ? (
									<div className="mt-1 space-y-0.5 border-l border-border/60 pl-2">
										{VISUAL_EFFECT_NAVIGATION.map((item) => {
											const NavigationIcon = navigationIcon({
												navigation: item.navigation,
											});
											const active = navigationMatches({
												left: selectedNavigation,
												right: item.navigation,
											});
											return (
												<button
													key={`${item.navigation.kind}-${item.navigation.id}`}
													type="button"
													className={cn(
														"flex h-7 w-full items-center gap-1.5 rounded px-1.5 text-left text-[10px] transition-colors",
														active
															? "bg-primary/15 text-primary"
															: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
													)}
													aria-pressed={active}
													data-testid={`effect-navigation-${item.navigation.id}`}
													onClick={() => setSelectedNavigation(item.navigation)}
													onKeyDown={(event) => {
														if (event.key === "Escape") {
															event.currentTarget.blur();
														}
													}}
												>
													<NavigationIcon className="size-3 shrink-0" />
													<span className="truncate">
														{locale === "zh" ? item.localizedLabel : item.label}
													</span>
												</button>
											);
										})}
									</div>
								) : null}
							</div>
						);
					})}
				</div>
			</aside>

			<section className="flex min-w-0 flex-1 flex-col">
				<div className="border-b border-border/50 p-3">
					<div className="relative">
						<Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
						<Input
							type="search"
							placeholder={t("effects.search.placeholder")}
							value={searchQuery}
							onChange={(event) => setSearchQuery(event.target.value)}
							className="h-8 w-full pl-8 text-xs"
							aria-label={t("effects.search.label")}
						/>
					</div>
					<div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
						<span>{t("effects.count", { count: visibleEntries.length })}</span>
						<span className={cn(selectedElements.length > 0 && "text-primary")}>
							{selectedElements.length > 0
								? t("effects.apply.selected")
								: t("effects.selectClip")}
						</span>
					</div>
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto p-3">
					{visibleEntries.length > 0 ? (
						<div className="grid grid-cols-[repeat(auto-fill,minmax(108px,1fr))] gap-2">
							{visibleEntries.map(({ entry, name, description }) => {
								const favorite = favoriteIds.has(entry.preset.id);
								const favoriteLabel = t(
									favorite
										? "effects.card.unfavorite"
										: "effects.card.favorite",
									{ name }
								);
								return (
									<div
										key={entry.preset.id}
										className={cn(
											"group relative h-[116px] min-w-0 overflow-hidden rounded-md border bg-card transition-colors hover:border-primary/60 focus-within:border-primary/60",
											draggedEffectId === entry.preset.id && "opacity-50"
										)}
									>
										<button
											type="button"
											className="flex size-full min-w-0 flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
											aria-label={t("effects.card.apply", { name })}
											data-testid={`effect-card-${entry.preset.id}`}
											draggable
											title={`${name}: ${description}`}
											onClick={() =>
												handleApplyEffect({ preset: entry.preset })
											}
											onKeyDown={(event) => {
												if (event.key === "Escape") event.currentTarget.blur();
											}}
											onDragStart={(event) =>
												handleDragStart({ event, preset: entry.preset })
											}
											onDragEnd={() => setDraggedEffectId(null)}
										>
											<div className="h-[82px] w-full shrink-0 overflow-hidden bg-black">
												<EffectPreviewThumbnail
													entry={entry}
													source={previewSource}
												/>
											</div>
											<div className="flex min-h-0 flex-1 items-center gap-1.5 px-2 pr-8">
												<Aperture className="size-3 shrink-0 text-primary" />
												<span className="truncate text-[11px] font-medium">
													{name}
												</span>
											</div>
										</button>
										<button
											type="button"
											className={cn(
												"absolute bottom-1.5 right-1.5 flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
												favorite && "text-yellow-500"
											)}
											aria-label={favoriteLabel}
											aria-pressed={favorite}
											data-testid={`effect-favorite-${entry.preset.id}`}
											title={favoriteLabel}
											onClick={() =>
												handleToggleFavorite({ presetId: entry.preset.id })
											}
											onKeyDown={(event) => {
												if (event.key === "Escape") event.currentTarget.blur();
											}}
										>
											<Star
												aria-hidden="true"
												className={cn("size-3.5", favorite && "fill-current")}
											/>
										</button>
									</div>
								);
							})}
						</div>
					) : (
						<div className="flex h-full min-h-40 items-center justify-center border border-dashed border-border/70 px-6 text-center text-xs text-muted-foreground">
							{t("effects.empty")}
						</div>
					)}
				</div>
			</section>
		</div>
	);
}
