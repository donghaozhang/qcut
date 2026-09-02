import { ChevronLeft, ChevronRight, Diamond } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { MaskIconButton } from "./media-mask-controls";

/**
 * Previous / toggle / next keyframe controls for one or more properties that
 * share a timeline row, e.g. a section header or an X+Y pair.
 */
export function MediaKeyframeNav({
	label,
	frames,
	currentFrame,
	keyframed,
	onToggle,
	onSeekFrame,
	testId,
}: {
	label: string;
	/** Union of keyframe frames across the covered properties. */
	frames: number[];
	currentFrame: number;
	keyframed: boolean;
	onToggle: () => void;
	onSeekFrame: (frame: number) => void;
	testId?: string;
}) {
	const { t } = useTranslation();
	const sorted = [...new Set(frames)].sort((left, right) => left - right);
	const previousFrame = [...sorted]
		.reverse()
		.find((frame) => frame < currentFrame);
	const nextFrame = sorted.find((frame) => frame > currentFrame);
	const toggleLabel = t(
		keyframed
			? "mediaProperties.removeKeyframe"
			: "mediaProperties.addKeyframe",
		{ label }
	);
	return (
		<div className="flex items-center" data-testid={testId}>
			<MaskIconButton
				label={t("mediaProperties.previousKeyframe", { label })}
				disabled={previousFrame === undefined}
				onClick={() => {
					if (previousFrame !== undefined) onSeekFrame(previousFrame);
				}}
			>
				<ChevronLeft className="size-3" />
			</MaskIconButton>
			<MaskIconButton label={toggleLabel} active={keyframed} onClick={onToggle}>
				<Diamond
					className={`size-3 ${keyframed ? "fill-primary text-primary" : ""}`}
				/>
			</MaskIconButton>
			<MaskIconButton
				label={t("mediaProperties.nextKeyframe", { label })}
				disabled={nextFrame === undefined}
				onClick={() => {
					if (nextFrame !== undefined) onSeekFrame(nextFrame);
				}}
			>
				<ChevronRight className="size-3" />
			</MaskIconButton>
		</div>
	);
}
