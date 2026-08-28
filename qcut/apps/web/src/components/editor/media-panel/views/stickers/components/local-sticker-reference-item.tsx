"use client";

import { AlertCircle, ImageIcon, Loader2, Lock, Play } from "lucide-react";
import {
	useEffect,
	useRef,
	useState,
	type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { debugError } from "@/lib/debug/debug-config";
import {
	buildStickerReferenceUsageMetadata,
	loadStickerLabReferenceFile,
	loadStickerLabReferenceRuntimePackage,
	loadStickerLabThumbnail,
	releaseLocalStickerReferenceFile,
	type StickerLabReference,
	type StickerReferenceUsageMetadata,
} from "@/lib/stickers/local-sticker-reference";
import type { PreparedStickerRuntimePackage } from "@/lib/stickers/sticker-runtime-package";
import type {
	LocalStickerPlayback,
	RemoteStickerProvenance,
} from "@/lib/stickers/local-sticker-manifest";
import { isLocalBridgeStickerReference } from "@/lib/stickers/local-sticker-manifest";
import { cn } from "@/lib/utils";

interface LoadedReference {
	file?: File;
	loadKey: string;
	previewUrl: string;
}

const PREVIEW_RELEASE_DELAY_MS = 750;
const PREVIEW_ROOT_MARGIN = "160px 0px";

function getReferenceKey({
	reference,
}: {
	reference: StickerLabReference;
}): string {
	const resourceKey =
		"filePath" in reference
			? reference.filePath
			: isLocalBridgeStickerReference(reference)
				? [
						reference.asset.rootPath,
						reference.asset.batchId,
						reference.asset.stickerId,
						reference.asset.byteSize,
						reference.asset.checksumSha256,
					].join("\0")
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

function isAbortError({ error }: { error: unknown }): boolean {
	return (
		(error instanceof DOMException && error.name === "AbortError") ||
		(error instanceof Error && error.name === "AbortError")
	);
}

/** A 403 from the license server means the lab entitlement is missing. */
function isForbiddenError({ error }: { error: unknown }): boolean {
	return error instanceof Error && /\b403\b/.test(error.message);
}

export function LocalStickerReferenceItem({
	onSelect,
	provenance,
	reference,
}: {
	onSelect: ({
		file,
		metadata,
	}: {
		file: File;
		metadata?: StickerReferenceUsageMetadata;
		runtimePackage?: PreparedStickerRuntimePackage;
	}) => Promise<void>;
	provenance?: RemoteStickerProvenance;
	reference: StickerLabReference;
}) {
	const itemRef = useRef<HTMLDivElement>(null);
	const [loaded, setLoaded] = useState<LoadedReference | null>(null);
	const [hasError, setHasError] = useState(false);
	const [isAdding, setIsAdding] = useState(false);
	const [loadAttempt, setLoadAttempt] = useState(0);
	const [selectError, setSelectError] = useState<string | null>(null);
	const [shouldLoad, setShouldLoad] = useState(false);
	// Not an error: the lab ships to everyone, but placing an original needs
	// an entitlement most viewers do not have.
	const [isLocked, setIsLocked] = useState(false);
	const referenceKey = getReferenceKey({ reference });
	const loadKey = `${referenceKey}\0${loadAttempt}`;
	const activeLoaded = loaded?.loadKey === loadKey ? loaded : null;
	const loadErrorId = `local-sticker-load-error-${reference.id}`;

	useEffect(() => {
		const item = itemRef.current;
		if (!item || typeof IntersectionObserver === "undefined") {
			setShouldLoad(true);
			return;
		}

		let releaseTimer: ReturnType<typeof setTimeout> | undefined;
		const observer = new IntersectionObserver(
			(entries) => {
				const entry =
					entries.find((candidate) => candidate.target === item) ?? entries[0];
				if (entry?.isIntersecting) {
					if (releaseTimer) clearTimeout(releaseTimer);
					releaseTimer = undefined;
					setShouldLoad(true);
					return;
				}
				if (releaseTimer) clearTimeout(releaseTimer);
				releaseTimer = setTimeout(() => {
					setShouldLoad(false);
					releaseTimer = undefined;
				}, PREVIEW_RELEASE_DELAY_MS);
			},
			{ rootMargin: PREVIEW_ROOT_MARGIN }
		);
		observer.observe(item);
		return () => {
			if (releaseTimer) clearTimeout(releaseTimer);
			observer.disconnect();
		};
	}, []);

	useEffect(() => {
		setLoaded(null);
		setHasError(false);
		setSelectError(null);
		setIsLocked(false);
		if (!shouldLoad) return;

		const abortController = new AbortController();
		let disposed = false;
		let publishedPreview = false;
		let previewUrl: string | undefined;
		const localBridgeReference = isLocalBridgeStickerReference(reference)
			? reference
			: null;
		const releaseLocalFile = () => {
			if (localBridgeReference) {
				releaseLocalStickerReferenceFile({ reference: localBridgeReference });
			}
		};

		const loadPreview = async () => {
			try {
				// Public references browse via the preview tier, which every
				// signed-in user may sign; the full-resolution file is fetched
				// when the sticker is placed, so a viewer without the lab
				// entitlement sees the catalogue instead of error tiles.
				// Private references have no un-entitled viewers and their
				// "thumbnail" is the original GIF anyway, so they go through
				// the cached loader — otherwise every category switch would
				// re-download megabytes of animation.
				const usesUncachedThumbnail =
					!("filePath" in reference) && "sourceAsset" in reference;
				const blob = usesUncachedThumbnail
					? await loadStickerLabThumbnail({
							reference,
							signal: abortController.signal,
						})
					: await loadStickerLabReferenceFile({
							reference,
							provenance,
							signal: abortController.signal,
						});
				previewUrl = URL.createObjectURL(blob);
				if (disposed) {
					URL.revokeObjectURL(previewUrl);
					return;
				}
				publishedPreview = true;
				setLoaded({
					file:
						!usesUncachedThumbnail && blob instanceof File ? blob : undefined,
					loadKey,
					previewUrl,
				});
			} catch (error) {
				if (disposed || isAbortError({ error })) return;
				debugError("[StickerLab] Failed to load reference", error);
				setHasError(true);
			} finally {
				if (!publishedPreview) releaseLocalFile();
			}
		};

		loadPreview();
		return () => {
			disposed = true;
			abortController.abort();
			if (previewUrl) URL.revokeObjectURL(previewUrl);
			releaseLocalFile();
		};
	}, [loadKey, provenance, reference, shouldLoad]);

	const handleSelect = async () => {
		if (!activeLoaded || isAdding) return;
		setIsAdding(true);
		setSelectError(null);
		try {
			const file =
				activeLoaded.file ??
				(await loadStickerLabReferenceFile({
					provenance,
					reference,
				}));
			const metadata = buildStickerReferenceUsageMetadata({ reference });
			const runtimePackage = await loadStickerLabReferenceRuntimePackage({
				primaryFile: file,
				reference,
			});
			await onSelect({
				file,
				...(metadata ? { metadata } : {}),
				...(runtimePackage ? { runtimePackage } : {}),
			});
		} catch (error) {
			debugError("[StickerLab] Failed to add local reference", error);
			if (isForbiddenError({ error })) {
				setIsLocked(true);
				return;
			}
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
		<div ref={itemRef} className="min-w-0">
			<button
				type="button"
				className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg bg-foreground/[0.06] transition-colors hover:bg-foreground/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed"
				disabled={!activeLoaded || hasError || isAdding}
				title={`${reference.displayName} · ${playbackDescription({
					playback: reference.playback,
				})}`}
				aria-label={`添加${reference.displayName}到时间线`}
				aria-describedby={hasError ? loadErrorId : undefined}
				data-testid="local-sticker-reference-item"
				data-sticker-reference-id={reference.id}
				onClick={handleSelect}
				onKeyDown={(event) => {
					if (event.key === " ") {
						event.preventDefault();
						handleSelect();
					}
				}}
			>
				{shouldLoad && !activeLoaded && !hasError && (
					<Loader2 className="size-6 animate-spin text-muted-foreground">
						<title>正在载入实验贴纸</title>
					</Loader2>
				)}
				{!shouldLoad && (
					<ImageIcon className="size-6 text-muted-foreground/60">
						<title>贴纸进入可视区域后载入</title>
					</ImageIcon>
				)}
				{hasError && (
					<AlertCircle className="size-6 text-destructive">
						<title>实验贴纸无法载入</title>
					</AlertCircle>
				)}
				{activeLoaded && (
					<img
						src={activeLoaded.previewUrl}
						alt={reference.displayName}
						className={cn(
							"size-full object-contain p-1.5",
							isAdding && "opacity-50"
						)}
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
			{isLocked && (
				<p className="flex items-center gap-1 text-[9px] text-muted-foreground">
					<Lock className="size-2.5" />
					仅限内测账号使用
				</p>
			)}
			{selectError && (
				<p className="text-[9px] text-destructive" role="alert">
					{selectError}
				</p>
			)}
		</div>
	);
}
