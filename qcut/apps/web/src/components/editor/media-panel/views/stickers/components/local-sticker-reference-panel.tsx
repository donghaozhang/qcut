"use client";

import { AlertCircle, ImageIcon, Loader2, Play } from "lucide-react";
import {
	useEffect,
	useRef,
	useState,
	type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { debugError } from "@/lib/debug/debug-config";
import {
	loadStickerLabReferenceFile,
	type StickerLabReference,
} from "@/lib/stickers/local-sticker-reference";
import type {
	LocalStickerPlayback,
	StickerLabCatalog,
} from "@/lib/stickers/local-sticker-manifest";
import { cn } from "@/lib/utils";

interface LoadedReference {
	file: File;
	loadKey: string;
	previewUrl: string;
}

function getReferenceKey({
	reference,
}: {
	reference: StickerLabReference;
}): string {
	const resourceKey =
		"filePath" in reference
			? reference.filePath
			: [
					reference.asset.objectKey,
					reference.asset.byteSize,
					reference.asset.checksumSha256,
				].join("\0");
	return [
		reference.id,
		resourceKey,
		reference.fileName,
		reference.mimeType,
	].join("\0");
}

function playbackDescription({
	playback,
}: {
	playback: LocalStickerPlayback;
}): string {
	if (playback.kind === "static") return "静态";

	const segments = ["动画", `${playback.frameCount} 帧`];
	if (playback.frameRate) segments.push(`${playback.frameRate} FPS`);
	segments.push(
		`${playback.cycleDuration} 秒${playback.loop ? "循环" : "时长"}`
	);
	return segments.join(" · ");
}

function LocalStickerReferenceItem({
	onSelect,
	reference,
}: {
	onSelect: ({ file }: { file: File }) => Promise<void>;
	reference: StickerLabReference;
}) {
	const [loaded, setLoaded] = useState<LoadedReference | null>(null);
	const [hasError, setHasError] = useState(false);
	const [isAdding, setIsAdding] = useState(false);
	const [loadAttempt, setLoadAttempt] = useState(0);
	const [selectError, setSelectError] = useState<string | null>(null);
	const referenceKey = getReferenceKey({ reference });
	const loadKey = `${referenceKey}\0${loadAttempt}`;
	const activeLoaded = loaded?.loadKey === loadKey ? loaded : null;
	const loadErrorId = `local-sticker-load-error-${reference.id}`;

	useEffect(() => {
		let disposed = false;
		let previewUrl: string | undefined;
		setLoaded(null);
		setHasError(false);
		setSelectError(null);

		const loadPreview = async () => {
			try {
				const file = await loadStickerLabReferenceFile({ reference });
				previewUrl = URL.createObjectURL(file);
				if (disposed) {
					URL.revokeObjectURL(previewUrl);
					return;
				}
				setLoaded({ file, loadKey, previewUrl });
			} catch (error) {
				debugError("[StickerLab] Failed to load reference", error);
				if (!disposed) setHasError(true);
			}
		};

		loadPreview();
		return () => {
			disposed = true;
			if (previewUrl) URL.revokeObjectURL(previewUrl);
		};
	}, [loadKey, reference]);

	const handleSelect = async () => {
		if (!activeLoaded || isAdding) return;
		setIsAdding(true);
		setSelectError(null);
		try {
			await onSelect({ file: activeLoaded.file });
		} catch (error) {
			debugError("[StickerLab] Failed to add local reference", error);
			setSelectError("无法添加到时间线，请重试");
		} finally {
			setIsAdding(false);
		}
	};
	const retryLoad = () => setLoadAttempt((attempt) => attempt + 1);
	const handleRetryKeyDown = ({
		event,
	}: {
		event: ReactKeyboardEvent<HTMLButtonElement>;
	}) => {
		if (event.key !== "Enter" && event.key !== " ") return;
		event.preventDefault();
		retryLoad();
	};

	return (
		<div className="min-w-0">
			<button
				type="button"
				className="relative aspect-square w-full overflow-hidden rounded-lg border border-border/80 bg-foreground/[0.04] transition-colors hover:border-primary hover:bg-foreground/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed"
				disabled={!activeLoaded || hasError || isAdding}
				aria-label={`添加${reference.displayName}到时间线`}
				aria-describedby={hasError ? loadErrorId : undefined}
				data-testid="local-sticker-reference-item"
				onClick={handleSelect}
				onKeyDown={(event) => {
					if (event.key === " ") {
						event.preventDefault();
						handleSelect();
					}
				}}
			>
				{!activeLoaded && !hasError && (
					<Loader2 className="mx-auto size-6 animate-spin text-muted-foreground">
						<title>正在载入实验贴纸</title>
					</Loader2>
				)}
				{hasError && (
					<AlertCircle className="mx-auto size-6 text-destructive">
						<title>实验贴纸无法载入</title>
					</AlertCircle>
				)}
				{activeLoaded && (
					<img
						src={activeLoaded.previewUrl}
						alt={reference.displayName}
						className={cn("size-full object-contain", isAdding && "opacity-50")}
						draggable={false}
					/>
				)}
				{activeLoaded && (
					<span
						className={cn(
							"pointer-events-none absolute bottom-1 left-1 flex size-5 items-center justify-center rounded bg-background/85",
							reference.playback.kind === "animated"
								? "text-emerald-300"
								: "text-muted-foreground"
						)}
					>
						{reference.playback.kind === "animated" ? (
							<Play className="size-3 fill-current">
								<title>动画贴纸</title>
							</Play>
						) : (
							<ImageIcon className="size-3">
								<title>静态贴纸</title>
							</ImageIcon>
						)}
					</span>
				)}
				{isAdding && (
					<span className="absolute inset-0 flex items-center justify-center bg-background/35">
						<Loader2 className="size-6 animate-spin">
							<title>正在加入时间线</title>
						</Loader2>
					</span>
				)}
			</button>
			<p className="mt-1 truncate text-[11px] font-medium">
				{reference.displayName}
			</p>
			<p className="truncate text-[10px] text-muted-foreground">
				{playbackDescription({ playback: reference.playback })}
			</p>
			<p className="truncate font-mono text-[9px] text-muted-foreground/80">
				{reference.sourceKind}
			</p>
			{hasError && (
				<div className="mt-1 flex items-center justify-between gap-1 text-[9px] text-destructive">
					<span id={loadErrorId} role="alert">
						实验素材无法载入
					</span>
					<button
						type="button"
						className="rounded px-1 py-0.5 font-medium underline underline-offset-2 hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-destructive"
						aria-label={`重试加载${reference.displayName}`}
						onClick={retryLoad}
						onKeyDown={(event) => handleRetryKeyDown({ event })}
					>
						重试
					</button>
				</div>
			)}
			{selectError && (
				<p className="text-[9px] text-destructive" role="alert">
					{selectError}
				</p>
			)}
		</div>
	);
}

export function LocalStickerReferencePanel({
	catalog,
	error,
	isLoading,
	onSelect,
}: {
	catalog: StickerLabCatalog | null;
	error: string | null;
	isLoading: boolean;
	onSelect: ({ file }: { file: File }) => Promise<void>;
}) {
	const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
		null
	);
	const categoryTabRefs = useRef(new Map<string, HTMLButtonElement>());
	const categories = catalog?.categories ?? [];
	const selectedCategory =
		categories.find((category) => category.id === selectedCategoryId) ??
		categories[0];

	const selectAndFocusCategory = ({
		categoryIndex,
	}: {
		categoryIndex: number;
	}) => {
		const category = categories.at(categoryIndex);
		if (!category) return;
		setSelectedCategoryId(category.id);
		requestAnimationFrame(() => {
			categoryTabRefs.current.get(category.id)?.focus();
		});
	};

	const handleCategoryKeyDown = ({
		categoryIndex,
		event,
	}: {
		categoryIndex: number;
		event: ReactKeyboardEvent<HTMLButtonElement>;
	}) => {
		if (!categories.length) return;

		let nextIndex: number | null = null;
		if (event.key === "ArrowRight") {
			nextIndex = (categoryIndex + 1) % categories.length;
		}
		if (event.key === "ArrowLeft") {
			nextIndex = (categoryIndex - 1 + categories.length) % categories.length;
		}
		if (event.key === "Home") nextIndex = 0;
		if (event.key === "End") nextIndex = categories.length - 1;
		if (nextIndex === null) return;

		event.preventDefault();
		selectAndFocusCategory({ categoryIndex: nextIndex });
	};

	return (
		<div
			className="flex h-full min-h-0 flex-col"
			data-testid="local-sticker-reference-panel"
		>
			<div className="shrink-0 border-b border-border/40 px-3 py-2">
				<p className="text-xs font-medium">贴纸实验室</p>
				<p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
					实验素材按需载入，不随 QCut 安装包分发
				</p>
			</div>

			{isLoading ? (
				<div
					className="flex min-h-0 flex-1 items-center justify-center gap-2 text-xs text-muted-foreground"
					data-testid="local-sticker-catalog-loading"
				>
					<Loader2 className="size-4 animate-spin" aria-hidden="true" />
					<span>正在读取贴纸实验目录</span>
				</div>
			) : error ? (
				<div
					className="m-3 flex gap-2 rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive"
					role="alert"
				>
					<AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
					<span className="min-w-0 break-words">{error}</span>
				</div>
			) : selectedCategory ? (
				<>
					<div
						className="flex shrink-0 gap-1 overflow-x-auto border-b border-border/40 px-2 py-2"
						role="tablist"
						aria-label="贴纸实验室分类"
						aria-orientation="horizontal"
					>
						{categories.map((category, categoryIndex) => {
							const isSelected = category.id === selectedCategory.id;
							return (
								<button
									key={category.id}
									ref={(node) => {
										if (node) {
											categoryTabRefs.current.set(category.id, node);
											return;
										}
										categoryTabRefs.current.delete(category.id);
									}}
									id={`local-sticker-category-tab-${category.id}`}
									type="button"
									role="tab"
									aria-selected={isSelected}
									aria-controls={`local-sticker-category-panel-${category.id}`}
									aria-label={`${category.label}，${category.items.length} 个贴纸`}
									tabIndex={isSelected ? 0 : -1}
									className={cn(
										"shrink-0 rounded-full px-2 py-1 text-[10px] transition-colors",
										isSelected
											? "bg-primary/15 font-medium text-primary"
											: "bg-foreground/5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
									)}
									onClick={() => setSelectedCategoryId(category.id)}
									onKeyDown={(event) =>
										handleCategoryKeyDown({ categoryIndex, event })
									}
								>
									{category.label}
								</button>
							);
						})}
					</div>
					<div
						id={`local-sticker-category-panel-${selectedCategory.id}`}
						role="tabpanel"
						aria-labelledby={`local-sticker-category-tab-${selectedCategory.id}`}
						className="flex min-h-0 flex-1 flex-col"
					>
						<div className="flex h-8 shrink-0 items-center justify-between px-3 text-[10px] text-muted-foreground">
							<span>{selectedCategory.sourcePanel}</span>
							<span className="tabular-nums">
								{selectedCategory.items.length} 个贴纸
							</span>
						</div>
						<div className="min-h-0 flex-1 overflow-y-auto p-2">
							<div
								className="grid grid-cols-3 gap-2"
								data-testid="local-sticker-category-grid"
							>
								{selectedCategory.items.map((reference) => (
									<LocalStickerReferenceItem
										key={reference.id}
										reference={reference}
										onSelect={onSelect}
									/>
								))}
							</div>
						</div>
					</div>
				</>
			) : (
				<div className="flex min-h-0 flex-1 items-center justify-center text-xs text-muted-foreground">
					暂无实验贴纸
				</div>
			)}
		</div>
	);
}
