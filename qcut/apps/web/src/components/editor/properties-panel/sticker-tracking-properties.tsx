import { CircleAlert, ExternalLink, Link2Off } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "@/lib/i18n";
import { getTimelineElementEndTime } from "@/lib/timeline";
import {
	createStickerMotionTracking,
	getStickerTrackingMediaTargets,
	getStickerTrackingTargets,
	resolveStickerTrackingTargetAnchor,
	type StickerTrackingMediaTarget,
} from "@/lib/stickers/sticker-tracking";
import type {
	StickerElement,
	StickerMotionTracking,
	TimelineTrack,
} from "@/types/timeline";
import {
	PropertyGroup,
	PropertyItem,
	PropertyItemLabel,
	PropertyItemValue,
} from "./property-item";
import type { UpdateStickerProperties } from "./sticker-property-types";

const NONE_TARGET = "none";

function targetValue({
	elementId,
	maskId,
}: {
	elementId: string;
	maskId: string;
}): string {
	return JSON.stringify([elementId, maskId]);
}

export function StickerTrackingProperties({
	element,
	tracks,
	currentTime,
	fps,
	canvasSize,
	update,
	selectElement,
}: {
	element: StickerElement;
	tracks: TimelineTrack[];
	currentTime: number;
	fps: number;
	canvasSize: { width: number; height: number };
	update: UpdateStickerProperties;
	selectElement: (trackId: string, elementId: string) => void;
}) {
	const { t } = useTranslation();
	const allTargets = getStickerTrackingTargets({
		sticker: element,
		tracks,
		fps,
	});
	const targets = allTargets.filter((target) =>
		resolveStickerTrackingTargetAnchor({
			target,
			currentTime,
			fps,
			canvasWidth: canvasSize.width,
			canvasHeight: canvasSize.height,
		})
	);
	const mediaTargets = getStickerTrackingMediaTargets({
		sticker: element,
		tracks,
		fps,
	}).filter(
		({ element: media }) =>
			currentTime >= media.startTime &&
			currentTime <= getTimelineElementEndTime({ element: media, fps })
	);
	const selectedTargetValue = element.tracking
		? targetValue({
				elementId: element.tracking.targetElementId,
				maskId: element.tracking.targetMaskId,
			})
		: NONE_TARGET;
	const selectedTargetExists = targets.some(
		({ element: media, mask }) =>
			targetValue({
				elementId: media.id,
				maskId: mask.id ?? "",
			}) === selectedTargetValue
	);

	const applyTracking = ({ value }: { value: string }) => {
		if (value === NONE_TARGET) {
			update({ history: true, updates: { tracking: undefined } });
			return;
		}
		const target = targets.find(
			({ element: media, mask }) =>
				targetValue({
					elementId: media.id,
					maskId: mask.id ?? "",
				}) === value
		);
		if (!target) return;
		const tracking = createStickerMotionTracking({
			target,
			currentTime,
			fps,
			canvasWidth: canvasSize.width,
			canvasHeight: canvasSize.height,
		});
		if (!tracking) return;
		update({ history: true, updates: { tracking } });
	};
	const updateTracking = ({
		updates,
	}: {
		updates: Partial<StickerMotionTracking>;
	}) => {
		if (!element.tracking) return;
		update({
			history: true,
			updates: {
				tracking: {
					...element.tracking,
					...updates,
				},
			},
		});
	};
	const openMediaTracking = ({
		trackId,
		media,
	}: {
		trackId: string;
		media: StickerTrackingMediaTarget["element"];
	}) => {
		selectElement(trackId, media.id);
		window.setTimeout(() => {
			window.dispatchEvent(
				new CustomEvent("qcut:open-media-properties-tab", {
					detail: { elementId: media.id, tab: "tracking" },
				})
			);
		}, 0);
	};

	return (
		<div className="space-y-4" data-testid="sticker-tracking-properties">
			<PropertyGroup title={t("stickerProperties.tracking.motion")}>
				<div className="space-y-3">
					<PropertyItem>
						<PropertyItemLabel>
							{t("stickerProperties.tracking.target")}
						</PropertyItemLabel>
						<PropertyItemValue>
							<Select
								value={selectedTargetValue}
								onValueChange={(value) => applyTracking({ value })}
							>
								<SelectTrigger
									className="h-8 text-xs"
									aria-label={t("stickerProperties.tracking.target")}
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={NONE_TARGET}>
										{t("common.none")}
									</SelectItem>
									{element.tracking && !selectedTargetExists ? (
										<SelectItem value={selectedTargetValue}>
											{t("stickerProperties.tracking.missing")}
										</SelectItem>
									) : null}
									{targets.map(({ element: media, mask }) => (
										<SelectItem
											key={`${media.id}:${mask.id}`}
											value={targetValue({
												elementId: media.id,
												maskId: mask.id ?? "",
											})}
										>
											{media.name} · {mask.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</PropertyItemValue>
					</PropertyItem>

					{element.tracking ? (
						<>
							<div className="flex items-center justify-between gap-3">
								<PropertyItemLabel>
									{t("stickerProperties.tracking.followScale")}
								</PropertyItemLabel>
								<Switch
									checked={element.tracking.followScale}
									onCheckedChange={(followScale) =>
										updateTracking({ updates: { followScale } })
									}
									aria-label={t("stickerProperties.tracking.followScale")}
								/>
							</div>
							<div className="flex items-center justify-between gap-3 opacity-55">
								<PropertyItemLabel>
									{t("stickerProperties.tracking.followRotation")}
								</PropertyItemLabel>
								<Switch
									checked={false}
									disabled
									aria-label={t("stickerProperties.tracking.followRotation")}
								/>
							</div>
							<p className="text-[10px] text-muted-foreground">
								{t("stickerProperties.tracking.rotationUnavailable")}
							</p>
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="w-full"
								onClick={() => applyTracking({ value: NONE_TARGET })}
								onKeyDown={(event) => event.stopPropagation()}
							>
								<Link2Off className="size-3.5" />
								{t("stickerProperties.tracking.unlink")}
							</Button>
						</>
					) : null}

					{targets.length === 0 ? (
						<div className="space-y-2 rounded border border-dashed p-3">
							<div className="flex gap-2 text-xs text-muted-foreground">
								<CircleAlert className="mt-0.5 size-3.5 shrink-0" />
								<p>{t("stickerProperties.tracking.empty")}</p>
							</div>
							{mediaTargets.map(({ element: media, trackId }) => (
								<Button
									key={media.id}
									type="button"
									variant="outline"
									size="sm"
									className="w-full"
									onClick={() => openMediaTracking({ trackId, media })}
									onKeyDown={(event) => event.stopPropagation()}
								>
									<ExternalLink className="size-3.5" />
									{t("stickerProperties.tracking.create", {
										name: media.name,
									})}
								</Button>
							))}
						</div>
					) : (
						<p className="text-[10px] text-muted-foreground">
							{t("stickerProperties.tracking.realData")}
						</p>
					)}
				</div>
			</PropertyGroup>

			<PropertyGroup title={t("stickerProperties.tracking.planar")}>
				<div
					className="rounded border border-dashed p-3 text-xs text-muted-foreground"
					aria-disabled="true"
				>
					{t("stickerProperties.tracking.planarUnavailable")}
				</div>
			</PropertyGroup>
		</div>
	);
}
