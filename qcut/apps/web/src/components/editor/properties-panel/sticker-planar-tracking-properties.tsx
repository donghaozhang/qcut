import type {
	PlanarTrackingDirection,
	PlanarTrackingReference,
	StickerPlanarTracking,
} from "@qcut/editor-core";
import {
	ArrowLeftRight,
	Link2,
	Link2Off,
	Play,
	Scan,
	Square,
	StepBack,
	StepForward,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "@/lib/i18n";
import { buildTimelineStickerPlanarSeedTargetQuad } from "@/lib/stickers/planar-sticker-seed-target";
import { getStickerTrackingMediaTargets } from "@/lib/stickers/sticker-tracking";
import { getPlanarTrackingResultStore } from "@/lib/tracking/planar-result-store";
import {
	DEFAULT_PLANAR_SEED_QUAD,
	readPlanarTrackingErrorCode,
	upsertPlanarTrackingReference,
} from "@/lib/tracking/planar-tracking-properties-model";
import {
	cancelPlanarTrackingRuntime,
	runPlanarTrackingRuntime,
} from "@/lib/tracking/planar-tracking-job-runtime";
import { runPlanarTrackingJob } from "@/lib/tracking/planar-tracking-job";
import { getMediaSourcePlaybackTime } from "@/lib/video/video-timing";
import { usePlanarTrackingEditorStore } from "@/stores/editor/planar-tracking-editor-store";
import { useMediaStore } from "@/stores/media/media-store";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { generateUUID } from "@/types/timeline";
import type { StickerElement, TimelineTrack } from "@/types/timeline";
import {
	PropertyItem,
	PropertyItemLabel,
	PropertyItemValue,
} from "./property-item";
import type { UpdateStickerProperties } from "./sticker-property-types";

const DIRECTION_OPTIONS = [
	{ direction: "backward", icon: StepBack },
	{ direction: "both", icon: ArrowLeftRight },
	{ direction: "forward", icon: StepForward },
] as const;
export function StickerPlanarTrackingProperties({
	canvasSize,
	currentTime,
	element,
	fps,
	tracks,
	update,
}: {
	canvasSize: { height: number; width: number };
	currentTime: number;
	element: StickerElement;
	fps: number;
	tracks: TimelineTrack[];
	update: UpdateStickerProperties;
}) {
	const { t } = useTranslation();
	const projectId = useProjectStore((state) => state.activeProject?.id);
	const mediaItems = useMediaStore((state) => state.mediaItems);
	const updateMediaElement = useTimelineStore(
		(state) => state.updateMediaElement
	);
	const selection = usePlanarTrackingEditorStore((state) => state.selection);
	const job = usePlanarTrackingEditorStore((state) => state.jobs[element.id]);
	const beginSelection = usePlanarTrackingEditorStore(
		(state) => state.beginSelection
	);
	const clearSelection = usePlanarTrackingEditorStore(
		(state) => state.clearSelection
	);
	const setJob = usePlanarTrackingEditorStore((state) => state.setJob);
	const setProgress = usePlanarTrackingEditorStore(
		(state) => state.setProgress
	);
	const planarBinding =
		element.tracking?.mode === "planar" ? element.tracking : undefined;
	const targets = useMemo(
		() =>
			getStickerTrackingMediaTargets({ sticker: element, tracks, fps }).filter(
				({ element: media }) =>
					mediaItems.some(
						(item) => item.id === media.mediaId && item.type === "video"
					)
			),
		[element, fps, mediaItems, tracks]
	);
	const [sourceElementId, setSourceElementId] = useState(
		planarBinding?.sourceElementId ?? targets[0]?.element.id ?? ""
	);
	const [direction, setDirection] = useState<PlanarTrackingDirection>("both");
	const [lostBehavior, setLostBehavior] = useState<
		StickerPlanarTracking["lostBehavior"]
	>(planarBinding?.lostBehavior ?? "hold");
	useEffect(() => {
		if (targets.some(({ element: media }) => media.id === sourceElementId))
			return;
		setSourceElementId(
			planarBinding?.sourceElementId ?? targets[0]?.element.id ?? ""
		);
	}, [planarBinding?.sourceElementId, sourceElementId, targets]);

	const target = targets.find(
		({ element: media }) => media.id === sourceElementId
	);
	const mediaItem = target
		? mediaItems.find((item) => item.id === target.element.mediaId)
		: undefined;
	const seedTargetQuad = buildTimelineStickerPlanarSeedTargetQuad({
		canvasSize,
		currentTime,
		fps,
		sourceElement: target?.element,
		sourceMedia: mediaItem,
		stickerElement: element,
	});
	const reference = target?.element.surfaceTrackings?.find(
		(candidate) =>
			candidate.id === planarBinding?.surfaceTrackingId ||
			(candidate.sourceMediaId === target.element.mediaId &&
				candidate.status !== "error")
	);
	const reusableReference =
		reference &&
		(reference.status === "ready" || reference.status === "partial") &&
		reference.resultUri &&
		reference.resultSha256
			? reference
			: undefined;
	const editingSelection =
		selection?.stickerElementId === element.id &&
		selection.sourceElementId === sourceElementId;
	const processing = job?.status === "processing";
	const canStart = Boolean(
		projectId &&
			target &&
			mediaItem?.file &&
			seedTargetQuad &&
			editingSelection &&
			!processing
	);

	const editSelection = (): void => {
		if (!target) return;
		beginSelection({
			selection: {
				quad:
					reference?.seedQuad ??
					(editingSelection ? selection.quad : DEFAULT_PLANAR_SEED_QUAD),
				sourceElementId: target.element.id,
				stickerElementId: element.id,
			},
		});
	};
	const unlink = (): void => {
		cancelPlanarTrackingRuntime({ stickerElementId: element.id });
		clearSelection({ stickerElementId: element.id });
		update({ history: true, updates: { tracking: undefined } });
	};
	const attachReference = (): void => {
		if (!target || !reusableReference || !editingSelection || !seedTargetQuad)
			return;
		update({
			history: true,
			updates: {
				tracking: {
					mode: "planar",
					lostBehavior,
					seedPtsUs: reusableReference.seedPtsUs,
					seedTargetQuad,
					sourceElementId: target.element.id,
					surfaceTrackingId: reusableReference.id,
				},
			},
		});
	};
	const startTracking = (): void => {
		if (
			!projectId ||
			!target ||
			!mediaItem?.file ||
			!editingSelection ||
			!seedTargetQuad
		)
			return;
		const trackingId =
			reference?.id ?? `planar-${generateUUID().toLowerCase()}`;
		const sourceTime = getMediaSourcePlaybackTime({
			element: target.element,
			fps,
			localTimelineTime: currentTime - target.element.startTime,
		});
		const seedPtsUs = Math.max(0, Math.round(sourceTime * 1_000_000));
		setJob({
			stickerElementId: element.id,
			job: {
				phase: "hashing",
				processedFrames: 0,
				progress: 0,
				status: "processing",
				trackingId,
			},
		});
		void runPlanarTrackingRuntime({
			stickerElementId: element.id,
			task: async ({ signal }) => {
				let firstReference = true;
				let terminalReference: PlanarTrackingReference | undefined;
				try {
					const result = await runPlanarTrackingJob({
						direction,
						file: mediaItem.file,
						lostBehavior,
						onBinding: (binding) =>
							update({ history: false, updates: { tracking: binding } }),
						onProgress: (progress) =>
							setProgress({ progress, stickerElementId: element.id }),
						onReference: (nextReference) => {
							terminalReference = nextReference;
							const currentTarget = useTimelineStore
								.getState()
								.tracks.flatMap((track) =>
									track.elements.map((candidate) => ({ candidate, track }))
								)
								.find(({ candidate }) => candidate.id === target.element.id);
							if (!currentTarget || currentTarget.candidate.type !== "media")
								return;
							updateMediaElement(
								currentTarget.track.id,
								currentTarget.candidate.id,
								{
									surfaceTrackings: upsertPlanarTrackingReference({
										reference: nextReference,
										references: currentTarget.candidate.surfaceTrackings,
									}),
								},
								firstReference
							);
							firstReference = false;
						},
						projectId,
						resultStore: getPlanarTrackingResultStore(),
						seedPtsUs,
						seedQuad: selection.quad,
						seedTargetQuad,
						signal,
						sourceDisplayHeight:
							mediaItem.height ?? target.element.height ?? 1080,
						sourceDisplayWidth: mediaItem.width ?? target.element.width ?? 1920,
						sourceElementId: target.element.id,
						sourceMediaId: target.element.mediaId,
						trackingId,
					});
					setJob({
						stickerElementId: element.id,
						job: {
							phase: "complete",
							processedFrames: result.reference.sampleCount ?? 0,
							progress: 1,
							status:
								result.reference.status === "partial" ? "partial" : "ready",
							trackingId,
						},
					});
					return result;
				} catch (cause) {
					console.error(`[PlanarTracking] Job ${trackingId} failed`, cause);
					const code =
						terminalReference?.errorCode ??
						readPlanarTrackingErrorCode({ cause });
					const latestJob =
						usePlanarTrackingEditorStore.getState().jobs[element.id];
					setJob({
						stickerElementId: element.id,
						job: {
							errorCode: code,
							phase: latestJob?.phase ?? "initializing",
							processedFrames: latestJob?.processedFrames ?? 0,
							progress: latestJob?.progress ?? 0,
							status: code === "cancelled" ? "cancelled" : "error",
							trackingId,
						},
					});
					throw cause;
				}
			},
		}).catch(() => undefined);
	};

	return (
		<div className="space-y-3" data-testid="sticker-planar-tracking-properties">
			<PropertyItem>
				<PropertyItemLabel>
					{t("stickerProperties.tracking.planarSource")}
				</PropertyItemLabel>
				<PropertyItemValue>
					<Select
						value={sourceElementId}
						onValueChange={(value) => {
							setSourceElementId(value);
							clearSelection({ stickerElementId: element.id });
						}}
						disabled={processing || targets.length === 0}
					>
						<SelectTrigger
							className="h-8 text-xs"
							aria-label={t("stickerProperties.tracking.planarSource")}
						>
							<SelectValue
								placeholder={t("stickerProperties.tracking.noPlanarSource")}
							/>
						</SelectTrigger>
						<SelectContent>
							{targets.map(({ element: media }) => (
								<SelectItem key={media.id} value={media.id}>
									{media.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</PropertyItemValue>
			</PropertyItem>

			<div
				className="grid grid-cols-3 gap-1"
				role="group"
				aria-label={t("stickerProperties.tracking.direction")}
			>
				{DIRECTION_OPTIONS.map(({ direction: option, icon: Icon }) => (
					<Button
						key={option}
						type="button"
						variant={direction === option ? "default" : "outline"}
						size="icon"
						className="h-8 w-full"
						title={t(`stickerProperties.tracking.direction.${option}`)}
						aria-label={t(`stickerProperties.tracking.direction.${option}`)}
						onClick={() => setDirection(option)}
						onKeyDown={(event) => event.stopPropagation()}
						disabled={processing}
					>
						<Icon className="size-4" />
					</Button>
				))}
			</div>

			<PropertyItem>
				<PropertyItemLabel>
					{t("stickerProperties.tracking.lostBehavior")}
				</PropertyItemLabel>
				<PropertyItemValue>
					<Select
						value={lostBehavior}
						onValueChange={(value) =>
							setLostBehavior(value as StickerPlanarTracking["lostBehavior"])
						}
						disabled={processing}
					>
						<SelectTrigger className="h-8 text-xs">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="hold">
								{t("stickerProperties.tracking.lostBehavior.hold")}
							</SelectItem>
							<SelectItem value="hide">
								{t("stickerProperties.tracking.lostBehavior.hide")}
							</SelectItem>
						</SelectContent>
					</Select>
				</PropertyItemValue>
			</PropertyItem>

			<Button
				type="button"
				variant={editingSelection ? "secondary" : "outline"}
				size="sm"
				className="w-full"
				onClick={editSelection}
				onKeyDown={(event) => event.stopPropagation()}
				disabled={!target || processing}
			>
				<Scan className="size-3.5" />
				{editingSelection
					? t("stickerProperties.tracking.editingPlane")
					: t("stickerProperties.tracking.editPlane")}
			</Button>

			{processing ? (
				<div className="space-y-2" aria-live="polite">
					<div className="h-1.5 overflow-hidden rounded-sm bg-muted">
						<div
							className="h-full bg-cyan-500 transition-[width]"
							style={{ width: `${Math.round(job.progress * 100)}%` }}
						/>
					</div>
					<div className="flex items-center justify-between text-[10px] text-muted-foreground">
						<span>{t(`stickerProperties.tracking.phase.${job.phase}`)}</span>
						<span>{Math.round(job.progress * 100)}%</span>
					</div>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="w-full"
						onClick={() =>
							cancelPlanarTrackingRuntime({ stickerElementId: element.id })
						}
						onKeyDown={(event) => event.stopPropagation()}
					>
						<Square className="size-3.5" />
						{t("common.cancel")}
					</Button>
				</div>
			) : (
				<Button
					type="button"
					variant="default"
					size="sm"
					className="w-full"
					onClick={startTracking}
					onKeyDown={(event) => event.stopPropagation()}
					disabled={!canStart}
				>
					<Play className="size-3.5" />
					{reference
						? t("stickerProperties.tracking.trackAgain")
						: t("stickerProperties.tracking.startPlanar")}
				</Button>
			)}

			{reusableReference && editingSelection && !processing ? (
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="w-full"
					onClick={attachReference}
					onKeyDown={(event) => event.stopPropagation()}
				>
					<Link2 className="size-3.5" />
					{t("stickerProperties.tracking.useExisting")}
				</Button>
			) : null}

			{job && job.status !== "processing" ? (
				<p
					className={
						job.status === "error" || job.status === "cancelled"
							? "text-[10px] text-destructive"
							: "text-[10px] text-muted-foreground"
					}
					data-testid="planar-tracking-job-status"
				>
					{job.errorCode
						? t("stickerProperties.tracking.failed", {
								code: job.errorCode,
							})
						: t(`stickerProperties.tracking.status.${job.status}`)}
				</p>
			) : null}

			{planarBinding ? (
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="w-full"
					onClick={unlink}
					onKeyDown={(event) => event.stopPropagation()}
				>
					<Link2Off className="size-3.5" />
					{t("stickerProperties.tracking.unlink")}
				</Button>
			) : null}

			{targets.length === 0 ? (
				<p className="text-[10px] text-muted-foreground">
					{t("stickerProperties.tracking.noPlanarSource")}
				</p>
			) : null}
		</div>
	);
}
