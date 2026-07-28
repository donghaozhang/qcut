import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n/translations";
import type {
	MediaAnimationType,
	StickerAnimationLoopType,
} from "@/types/timeline";
import {
	PropertyGroup,
	PropertyItem,
	PropertyItemLabel,
	PropertyItemValue,
} from "./property-item";
import { clamp, type UpdateStickerProperties } from "./sticker-property-types";
import {
	CLIP_ANIMATION_OPTIONS,
	NumberControl,
} from "./visual-property-controls";

const LOOP_ANIMATION_OPTIONS = [
	["none", "stickerProperties.loop.none"],
	["pulse", "stickerProperties.loop.pulse"],
	["drift", "stickerProperties.loop.drift"],
	["spin", "stickerProperties.loop.spin"],
	["wobble", "stickerProperties.loop.wobble"],
	["bounce", "stickerProperties.loop.bounce"],
	["blink", "stickerProperties.loop.blink"],
] as const satisfies ReadonlyArray<readonly [string, TranslationKey]>;

function StickerClipAnimationControl({
	duration,
	durationKey,
	label,
	onInteractionEnd,
	onInteractionStart,
	type,
	typeKey,
	update,
}: {
	duration: number;
	durationKey: "animationInDuration" | "animationOutDuration";
	label: string;
	onInteractionEnd: () => void;
	onInteractionStart: () => void;
	type: MediaAnimationType;
	typeKey: "animationInType" | "animationOutType";
	update: UpdateStickerProperties;
}) {
	const { t } = useTranslation();
	return (
		<div className="space-y-3">
			<PropertyItem>
				<PropertyItemLabel>{label}</PropertyItemLabel>
				<PropertyItemValue>
					<Select
						value={type}
						onValueChange={(value) =>
							update({
								history: true,
								updates: { [typeKey]: value as MediaAnimationType },
							})
						}
					>
						<SelectTrigger className="h-8 text-xs" aria-label={label}>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{CLIP_ANIMATION_OPTIONS.map(([value, labelKey]) => (
								<SelectItem key={value} value={value}>
									{t(labelKey)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</PropertyItemValue>
			</PropertyItem>
			{type === "none" ? null : (
				<NumberControl
					label={t("mediaProperties.animation.duration", { name: label })}
					value={duration}
					min={0.05}
					max={5}
					step={0.05}
					suffix="s"
					onChange={(value) =>
						update({
							updates: {
								[durationKey]: clamp({ value, min: 0.05, max: 5 }),
							},
						})
					}
					onInteractionStart={onInteractionStart}
					onInteractionEnd={onInteractionEnd}
				/>
			)}
		</div>
	);
}

export function StickerAnimationProperties({
	animationInDuration,
	animationInType,
	animationLoopIntensity,
	animationLoopType,
	animationOutDuration,
	animationOutType,
	onInteractionEnd,
	onInteractionStart,
	update,
}: {
	animationInDuration: number;
	animationInType: MediaAnimationType;
	animationLoopIntensity: number;
	animationLoopType: StickerAnimationLoopType;
	animationOutDuration: number;
	animationOutType: MediaAnimationType;
	onInteractionEnd: () => void;
	onInteractionStart: () => void;
	update: UpdateStickerProperties;
}) {
	const { t } = useTranslation();
	return (
		<>
			<PropertyGroup title={t("mediaProperties.clipAnimation")} defaultExpanded>
				<div className="space-y-4">
					<StickerClipAnimationControl
						label={t("mediaProperties.animation.in")}
						type={animationInType}
						duration={animationInDuration}
						typeKey="animationInType"
						durationKey="animationInDuration"
						update={update}
						onInteractionStart={onInteractionStart}
						onInteractionEnd={onInteractionEnd}
					/>
					<StickerClipAnimationControl
						label={t("mediaProperties.animation.out")}
						type={animationOutType}
						duration={animationOutDuration}
						typeKey="animationOutType"
						durationKey="animationOutDuration"
						update={update}
						onInteractionStart={onInteractionStart}
						onInteractionEnd={onInteractionEnd}
					/>
				</div>
			</PropertyGroup>

			<PropertyGroup title={t("stickerProperties.loop")} defaultExpanded>
				<div className="space-y-4">
					<PropertyItem>
						<PropertyItemLabel>{t("mediaProperties.motion")}</PropertyItemLabel>
						<PropertyItemValue>
							<Select
								value={animationLoopType}
								onValueChange={(value) =>
									update({
										history: true,
										updates: {
											animationLoopType: value as StickerAnimationLoopType,
										},
									})
								}
							>
								<SelectTrigger
									className="h-8 text-xs"
									aria-label={t("stickerProperties.loop")}
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{LOOP_ANIMATION_OPTIONS.map(([value, labelKey]) => (
										<SelectItem key={value} value={value}>
											{t(labelKey)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</PropertyItemValue>
					</PropertyItem>
					{animationLoopType === "none" ? null : (
						<NumberControl
							label={t("mediaProperties.intensity")}
							value={animationLoopIntensity * 100}
							min={0}
							max={100}
							step={0.1}
							suffix="%"
							onChange={(intensity) =>
								update({
									updates: {
										animationLoopIntensity:
											clamp({ value: intensity, min: 0, max: 100 }) / 100,
									},
								})
							}
							onInteractionStart={onInteractionStart}
							onInteractionEnd={onInteractionEnd}
						/>
					)}
				</div>
			</PropertyGroup>
		</>
	);
}
