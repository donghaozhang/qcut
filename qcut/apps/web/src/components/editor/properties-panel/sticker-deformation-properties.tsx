import { Diamond, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/lib/i18n";
import type { MediaPerspective } from "@/types/timeline";
import { PropertyGroup } from "./property-item";
import {
	clamp,
	type StickerKeyframeControls,
	type UpdateStickerProperties,
} from "./sticker-property-types";
import { PERSPECTIVE_FIELDS } from "./visual-property-controls";
import { MaskIconButton } from "./media-mask-controls";

export function StickerDeformationProperties({
	onInteractionEnd,
	onInteractionStart,
	onReset,
	perspective,
	keyframeControls,
	update,
}: {
	keyframeControls: StickerKeyframeControls;
	onInteractionEnd: () => void;
	onInteractionStart: () => void;
	onReset: () => void;
	perspective: MediaPerspective;
	update: UpdateStickerProperties;
}) {
	const { t } = useTranslation();
	return (
		<PropertyGroup title={t("stickerProperties.deformation")} defaultExpanded>
			<div className="space-y-3">
				{PERSPECTIVE_FIELDS.map((field) => (
					<div key={field.labelKey} className="space-y-1">
						<p className="text-[11px] text-muted-foreground">
							{t(field.labelKey)}
						</p>
						<div className="grid grid-cols-2 gap-2">
							{([field.x, field.y] as const).map((key, index) => {
								const axis = index === 0 ? "X" : "Y";
								const label = `${t(field.labelKey)} ${axis}`;
								const keyframed = keyframeControls.isKeyframed({
									property: key,
								});
								const keyframeLabel = t(
									keyframed
										? "mediaProperties.removeKeyframe"
										: "mediaProperties.addKeyframe",
									{ label }
								);
								return (
									<div key={key} className="flex items-center gap-1">
										<span className="w-3 text-[10px] text-muted-foreground">
											{axis}
										</span>
										<Input
											type="number"
											aria-label={t("mediaProperties.value", { label })}
											value={Math.round(perspective[key] * 1000) / 10}
											min={0}
											max={100}
											step={0.1}
											onFocus={onInteractionStart}
											onBlur={onInteractionEnd}
											onChange={(event) => {
												const percent = Number(event.target.value);
												if (!Number.isFinite(percent)) return;
												const value =
													clamp({
														value: percent,
														min: 0,
														max: 100,
													}) / 100;
												const nextPerspective: MediaPerspective = {
													...perspective,
													[key]: value,
												};
												update({
													keyframeValues: { [key]: value },
													updates: { perspective: nextPerspective },
												});
											}}
											className="h-8 min-w-0 text-xs"
										/>
										<MaskIconButton
											label={keyframeLabel}
											onClick={() =>
												keyframeControls.toggleKeyframe({
													property: key,
													value: perspective[key],
												})
											}
											active={keyframed}
										>
											<Diamond
												className={`size-3 ${
													keyframed ? "fill-primary text-primary" : ""
												}`}
											>
												<title>{keyframeLabel}</title>
											</Diamond>
										</MaskIconButton>
									</div>
								);
							})}
						</div>
					</div>
				))}
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={onReset}
					onKeyDown={(event) => event.stopPropagation()}
				>
					<RotateCcw className="size-3.5" />
					{t("mediaProperties.resetPerspective")}
				</Button>
			</div>
		</PropertyGroup>
	);
}
