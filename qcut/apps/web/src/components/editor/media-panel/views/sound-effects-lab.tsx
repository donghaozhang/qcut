import { AlertCircle, FlaskConical, Loader2, Lock, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	loadSoundEffectReferenceFile,
	soundEffectReferenceToSound,
} from "@/lib/audio/local-sound-effect-reference";
import type {
	LocalSoundEffectsCategory,
	SoundEffectsLabManifest,
	SoundEffectsLabReference,
} from "@/lib/audio/local-sound-effects-manifest";
import { debugError } from "@/lib/debug/debug-config";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
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
	reference: SoundEffectsLabReference;
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

function SoundEffectReferenceItem({
	categories,
	isPlaying,
	onPlay,
	reference,
}: {
	categories: readonly LocalSoundEffectsCategory[];
	isPlaying: boolean;
	onPlay: ({ sound }: { sound: SoundEffect }) => void;
	reference: SoundEffectsLabReference;
}) {
	const { t } = useTranslation();
	const [loadAttempt, setLoadAttempt] = useState(0);
	const [sound, setSound] = useState<SoundEffect | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let disposed = false;
		const abortController = new AbortController();
		let previewUrl: string | undefined;
		setSound(null);
		setError(null);

		const loadSound = async () => {
			try {
				const file = await loadSoundEffectReferenceFile({
					reference,
					signal: abortController.signal,
				});
				previewUrl = URL.createObjectURL(file);
				if (disposed) {
					URL.revokeObjectURL(previewUrl);
					return;
				}
				setSound(
					soundEffectReferenceToSound({
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
			abortController.abort();
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

/** One category row in the Jianying-style rail on the left of the lab. */
function LabCategoryButton({
	active,
	count,
	label,
	onSelect,
}: {
	active: boolean;
	count: number;
	label: string;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			className={cn(
				"flex h-7 w-full items-center gap-1 rounded px-2 text-left text-[10px] transition-colors",
				active
					? "bg-primary/15 text-primary"
					: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
			)}
			aria-pressed={active}
			title={label}
			onClick={onSelect}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onSelect();
				}
			}}
		>
			<span className="truncate">{label}</span>
			<span className="ml-auto text-[9px] tabular-nums opacity-60">
				{count}
			</span>
		</button>
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
	catalog: SoundEffectsLabManifest | null;
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
	const categoryCounts = useMemo(() => {
		const counts = new Map<string, number>();
		for (const reference of catalog?.items ?? []) {
			for (const id of reference.categoryIds) {
				counts.set(id, (counts.get(id) ?? 0) + 1);
			}
		}
		return counts;
	}, [catalog]);
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

				<div className="relative mt-3 min-w-0">
					<Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={query}
						onChange={(event) => changeQuery({ nextQuery: event.target.value })}
						placeholder={t("audioLibrary.soundEffectsLab.search")}
						aria-label={t("audioLibrary.soundEffectsLab.searchLabel")}
						className="h-8 pl-8 text-xs"
					/>
				</div>
			</div>

			<div className="flex min-h-0 flex-1">
				<aside
					className="w-[104px] shrink-0 border-r border-border/60 bg-panel-accent/40"
					aria-label={t("audioLibrary.soundEffectsLab.category")}
				>
					<ScrollArea className="h-full">
						<div className="space-y-0.5 p-2 pb-10">
							<LabCategoryButton
								active={categoryId === ALL_CATEGORIES}
								count={catalog?.items.length ?? 0}
								label={t("audioLibrary.soundEffectsLab.allCategories")}
								onSelect={() =>
									changeCategory({ nextCategoryId: ALL_CATEGORIES })
								}
							/>
							{catalog?.categories.map((category) => (
								<LabCategoryButton
									key={category.id}
									active={categoryId === category.id}
									count={categoryCounts.get(category.id) ?? 0}
									label={category.label}
									onSelect={() =>
										changeCategory({ nextCategoryId: category.id })
									}
								/>
							))}
						</div>
					</ScrollArea>
				</aside>

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
										<SoundEffectReferenceItem
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
			</div>
		</section>
	);
}
