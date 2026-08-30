import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { MediaEnhancements } from "@/types/timeline";
import {
	PropertyGroup,
	PropertyItem,
	PropertyItemLabel,
} from "./property-item";
import { NumberControl } from "./visual-property-controls";

const SMART_ACTIONS = [
	["mediaProperties.lab.smartMotion", "smart-motion"],
	["mediaProperties.lab.smartCrop", "smart-crop"],
	["mediaProperties.lab.cameraTracking", "camera-tracking"],
] as const satisfies ReadonlyArray<
	readonly [TranslationKey, "smart-motion" | "smart-crop" | "camera-tracking"]
>;

export function MediaLabProperties({
	enhancements,
	hasLocalTracking,
	onChange,
	onApplySmartAction,
	onInteractionStart,
	onInteractionEnd,
}: {
	enhancements: MediaEnhancements;
	hasLocalTracking: boolean;
	onChange: (enhancements: MediaEnhancements, history?: boolean) => void;
	onApplySmartAction: ({
		action,
	}: {
		action: "smart-motion" | "smart-crop" | "camera-tracking";
	}) => void;
	onInteractionStart: () => void;
	onInteractionEnd: () => void;
}) {
	const { t } = useTranslation();
	const updateAmount = ({
		property,
		value,
	}: {
		property: "labDeflicker" | "labOpticalFlowMotionBlur" | "labEyeCorrection";
		value: number;
	}) => onChange({ ...enhancements, [property]: value }, false);

	return (
		<PropertyGroup
			title={t("mediaProperties.lab.title")}
			defaultExpanded
			testId="media-lab-properties-toggle"
		>
			<div className="space-y-4" data-testid="media-lab-properties">
				<NumberControl
					label={t("mediaProperties.lab.deflicker")}
					value={enhancements.labDeflicker ?? 0}
					min={0}
					max={100}
					suffix="%"
					onChange={(value) =>
						updateAmount({ property: "labDeflicker", value })
					}
					onInteractionStart={onInteractionStart}
					onInteractionEnd={onInteractionEnd}
				/>
				<NumberControl
					label={t("mediaProperties.lab.motionBlur")}
					value={enhancements.labOpticalFlowMotionBlur ?? 0}
					min={0}
					max={100}
					suffix="%"
					onChange={(value) =>
						updateAmount({ property: "labOpticalFlowMotionBlur", value })
					}
					onInteractionStart={onInteractionStart}
					onInteractionEnd={onInteractionEnd}
				/>
				<NumberControl
					label={t("mediaProperties.lab.eyeCorrection")}
					value={enhancements.labEyeCorrection ?? 0}
					min={0}
					max={100}
					suffix="%"
					onChange={(value) =>
						updateAmount({ property: "labEyeCorrection", value })
					}
					onInteractionStart={onInteractionStart}
					onInteractionEnd={onInteractionEnd}
				/>
				<PropertyItem>
					<PropertyItemLabel>
						{t("mediaProperties.lab.localSuperResolution")}
					</PropertyItemLabel>
					<Select
						value={String(enhancements.labLocalSuperResolution ?? 0)}
						onValueChange={(value) =>
							onChange({
								...enhancements,
								labLocalSuperResolution: Number(value) as 0 | 2 | 4,
							})
						}
					>
						<SelectTrigger
							className="h-8 w-24 text-xs"
							aria-label={t("mediaProperties.lab.localSuperResolution")}
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="0">{t("mediaProperties.off")}</SelectItem>
							<SelectItem value="2">2x</SelectItem>
							<SelectItem value="4">4x</SelectItem>
						</SelectContent>
					</Select>
				</PropertyItem>

				<div className="grid grid-cols-1 gap-2">
					{SMART_ACTIONS.map(([labelKey, action]) => (
						<Button
							key={action}
							type="button"
							variant="outline"
							size="sm"
							className="w-full justify-start"
							disabled={!hasLocalTracking}
							title={
								hasLocalTracking
									? t(labelKey)
									: t("mediaProperties.lab.trackingRequired")
							}
							onClick={() => onApplySmartAction({ action })}
							onKeyDown={(event) => {
								if (event.key !== "Enter" && event.key !== " ") return;
								event.preventDefault();
								onApplySmartAction({ action });
							}}
						>
							<Sparkles className="size-3.5" />
							{t(labelKey)}
						</Button>
					))}
				</div>
			</div>
		</PropertyGroup>
	);
}
