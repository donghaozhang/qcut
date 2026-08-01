import { AlertCircle, FlaskConical, Loader2, Lock, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	loadLocalSoundEffectFile,
	localSoundEffectReferenceToSound,
} from "@/lib/audio/local-sound-effect-reference";
import type {
	LocalSoundEffectReference,
	LocalSoundEffectsCategory,
	LocalSoundEffectsLabManifest,
} from "@/lib/audio/local-sound-effects-manifest";
import { debugError } from "@/lib/debug/debug-config";
import { useTranslation } from "@/lib/i18n";
import type { SoundEffect } from "@/types/sounds";
import { AudioLibraryItem } from "./sounds-audio-item";

const ALL_CATEGORIES = "all";
const VISIBLE_BATCH_SIZE = 60;

function referenceMatches({
	categoryId,
	categoryLabels,
	query,
	reference,
}: {
	categoryId: string;
	categoryLabels: readonly string[];
	query: string;
	reference: LocalSoundEffectReference;
}): boolean {
	if (
		categoryId !== ALL_CATEGORIES &&
		!reference.categoryIds.includes(categoryId)
	) {
		return false;
	}
	const normalizedQuery = query.trim().toLocaleLowerCase();
	if (!normalizedQuery) return true;
	return [reference.title, reference.resourceId, ...categoryLabels]
		.join(" ")
		.toLocaleLowerCase()
		.includes(normalizedQuery);
}

function LocalSoundEffectItem({
	categories,
	isPlaying,
	onPlay,
	reference,
}: {
	categories: readonly LocalSoundEffectsCategory[];
	isPlaying: boolean;
	onPlay: ({ sound }: { sound: SoundEffect }) => void;
	reference: LocalSoundEffectReference;
}) {
	const { t } = useTranslation();
	const [loadAttempt, setLoadAttempt] = useState(0);
	const [sound, setSound] = useState<SoundEffect | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let disposed = false;
		let previewUrl: string | undefined;
		setSound(null);
		setError(null);

		const loadSound = async () => {
			try {
				const file = await loadLocalSoundEffectFile({ reference });
				previewUrl = URL.createObjectURL(file);
				if (disposed) {
					URL.revokeObjectURL(previewUrl);
					return;
				}
				setSound(
					localSoundEffectReferenceToSound({
						categories,
						previewUrl,
						reference,
					})
				);
			} catch (loadError) {
				if (disposed) return;
				debugError(
					`[SoundEffectsLab] Failed to load audio (attempt ${loadAttempt + 1})`,
					loadError
				);
				setError(
					loadError instanceof Error
						? loadError.message
						: t("audioLibrary.soundEffectsLab.itemLoadFailed")
				);
			}
		};
		void loadSound();
		return () => {
			disposed = true;
			if (previewUrl) URL.revokeObjectURL(previewUrl);
		};
	}, [categories, loadAttempt, reference, t]);

	if (sound) {
		return (
			<AudioLibraryItem
				sound={sound}
				assetKind="sound-effect"
				folders={[]}
				isPlaying={isPlaying}
				onPlay={() => onPlay({ sound })}
				onToggleSaved={() => undefined}
				onToggleFolder={() => undefined}
			/>
		);
	}

	return (
		<div className="flex h-[106px] items-center justify-center rounded-md border border-border/60 bg-card p-3">
			{error ? (
				<div className="min-w-0 text-center">
					<AlertCircle className="mx-auto size-4 text-destructive">
						<title>{t("audioLibrary.soundEffectsLab.itemLoadFailed")}</title>
					</AlertCircle>
					<p
						className="mt-1 truncate text-[9px] text-destructive"
						title={error}
					>
						{reference.title}
					</p>
					<Button
						type="button"
						variant="text"
						size="sm"
						className="mt-1 h-6 px-2 text-[9px]"
						onClick={() => setLoadAttempt((attempt) => attempt + 1)}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.preventDefault();
								setLoadAttempt((attempt) => attempt + 1);
							}
						}}
					>
						{t("audioLibrary.soundEffectsLab.retry")}
					</Button>
				</div>
			) : (
				<Loader2 className="size-4 animate-spin text-muted-foreground">
					<title>{t("audioLibrary.soundEffectsLab.loadingItem")}</title>
				</Loader2>
			)}
		</div>
	);
}

export function SoundEffectsLabPanel({
	catalog,
	error,
	isLoading,
	onPlay,
	onStop,
	playingId,
}: {
	catalog: LocalSoundEffectsLabManifest | null;
	error: string | null;
	isLoading: boolean;
	onPlay: ({ sound }: { sound: SoundEffect }) => void;
	onStop: () => void;
	playingId: number | null;
}) {
	const { t } = useTranslation();
	const [categoryId, setCategoryId] = useState(ALL_CATEGORIES);
	const [query, setQuery] = useState("");
	const [visibleCount, setVisibleCount] = useState(VISIBLE_BATCH_SIZE);
	const categoryLabelsById = useMemo(
		() =>
			new Map(
				catalog?.categories.map((category) => [category.id, category.label]) ??
					[]
			),
		[catalog]
	);
	const matchingItems = useMemo(
		() =>
			(catalog?.items ?? []).filter((reference) =>
				referenceMatches({
					categoryId,
					categoryLabels: reference.categoryIds
						.map((id) => categoryLabelsById.get(id))
						.filter((label): label is string => Boolean(label)),
					query,
					reference,
				})
			),
		[catalog, categoryId, categoryLabelsById, query]
	);
	const visibleItems = matchingItems.slice(0, visibleCount);

	const changeCategory = ({ nextCategoryId }: { nextCategoryId: string }) => {
		setCategoryId(nextCategoryId);
		setVisibleCount(VISIBLE_BATCH_SIZE);
		onStop();
	};
	const changeQuery = ({ nextQuery }: { nextQuery: string }) => {
		setQuery(nextQuery);
		setVisibleCount(VISIBLE_BATCH_SIZE);
		onStop();
	};

	return (
		<section
			className="flex min-w-0 flex-1 flex-col pb-[62px]"
			data-testid="sound-effects-lab"
		>
			<div className="shrink-0 border-b border-border/60 p-3">
				<div className="flex items-center justify-between gap-3">
					<div className="flex min-w-0 items-center gap-2">
						<span className="flex size-7 shrink-0 items-center justify-center rounded border border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
							<FlaskConical className="size-3.5">
								<title>{t("audioLibrary.section.soundEffectsLab")}</title>
							</FlaskConical>
						</span>
						<div className="min-w-0">
							<h2 className="truncate text-xs font-semibold">
								{t("audioLibrary.section.soundEffectsLab")}
							</h2>
							<p className="truncate text-[9px] text-muted-foreground">
								{catalog
									? t("audioLibrary.soundEffectsLab.summary", {
											categories: catalog.categories.length,
											count: catalog.items.length,
										})
									: t("audioLibrary.soundEffectsLab.internalReference")}
							</p>
						</div>
					</div>
					<span className="flex shrink-0 items-center gap-1 text-[9px] text-amber-300">
						<Lock className="size-3">
							<title>
								{t("audioLibrary.soundEffectsLab.internalReference")}
							</title>
						</Lock>
						{t("audioLibrary.soundEffectsLab.restricted")}
					</span>
				</div>

				<div className="mt-3 flex items-center gap-2">
					<div className="relative min-w-0 flex-1">
						<Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={query}
							onChange={(event) =>
								changeQuery({ nextQuery: event.target.value })
							}
							placeholder={t("audioLibrary.soundEffectsLab.search")}
							aria-label={t("audioLibrary.soundEffectsLab.searchLabel")}
							className="h-8 pl-8 text-xs"
						/>
					</div>
					<Select
						value={categoryId}
						onValueChange={(nextCategoryId) =>
							changeCategory({ nextCategoryId })
						}
					>
						<SelectTrigger
							className="h-8 w-[148px] text-[10px]"
							aria-label={t("audioLibrary.soundEffectsLab.category")}
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={ALL_CATEGORIES}>
								{t("audioLibrary.soundEffectsLab.allCategories")}
							</SelectItem>
							{catalog?.categories.map((category) => (
								<SelectItem key={category.id} value={category.id}>
									{category.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			<ScrollArea className="min-h-0 flex-1">
				<div className="p-3">
					{isLoading ? (
						<div className="flex h-48 items-center justify-center gap-2 text-xs text-muted-foreground">
							<Loader2 className="size-4 animate-spin" />
							{t("audioLibrary.soundEffectsLab.loading")}
						</div>
					) : error ? (
						<div className="flex h-48 items-center justify-center px-6 text-center text-xs text-destructive">
							{error}
						</div>
					) : visibleItems.length > 0 && catalog ? (
						<>
							<div className="mb-2 text-[10px] text-muted-foreground">
								{t("audioLibrary.resultCount", {
									count: matchingItems.length,
								})}
							</div>
							<div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
								{visibleItems.map((reference) => (
									<LocalSoundEffectItem
										key={reference.id}
										categories={catalog.categories}
										isPlaying={playingId === reference.numericId}
										onPlay={onPlay}
										reference={reference}
									/>
								))}
							</div>
							{visibleCount < matchingItems.length ? (
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="mt-3 w-full"
									onClick={() =>
										setVisibleCount((count) => count + VISIBLE_BATCH_SIZE)
									}
									onKeyDown={(event) => {
										if (event.key === "Enter" || event.key === " ") {
											event.preventDefault();
											setVisibleCount((count) => count + VISIBLE_BATCH_SIZE);
										}
									}}
								>
									{t("audioLibrary.loadMore")}
								</Button>
							) : null}
						</>
					) : (
						<div className="flex h-48 items-center justify-center text-xs text-muted-foreground">
							{t("audioLibrary.empty")}
						</div>
					)}
				</div>
			</ScrollArea>
		</section>
	);
}
