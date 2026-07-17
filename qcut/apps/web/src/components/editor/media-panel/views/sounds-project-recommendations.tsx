import { AudioLines, Loader2, ScanSearch, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
	ProjectAudioRecommendations,
	ProjectAudioSignal,
} from "@/lib/audio/audio-project-recommendations";
import { useTranslation, type TranslationKey } from "@/lib/i18n";

const SIGNAL_LABELS: Record<ProjectAudioSignal, TranslationKey> = {
	cinematic: "audioLibrary.recommendation.signal.cinematic",
	dialogue: "audioLibrary.recommendation.signal.dialogue",
	dynamic: "audioLibrary.recommendation.signal.dynamic",
	emotional: "audioLibrary.recommendation.signal.emotional",
	graduation: "audioLibrary.recommendation.signal.graduation",
	healing: "audioLibrary.recommendation.signal.healing",
	kpop: "audioLibrary.recommendation.signal.kpop",
	nature: "audioLibrary.recommendation.signal.nature",
	project: "audioLibrary.recommendation.signal.project",
	transitions: "audioLibrary.recommendation.signal.transitions",
	travel: "audioLibrary.recommendation.signal.travel",
	tutorial: "audioLibrary.recommendation.signal.tutorial",
	winter: "audioLibrary.recommendation.signal.winter",
};

export function ProjectAudioRecommendationSummary({
	canAnalyzeVisuals,
	isAnalyzingVisuals,
	isPlacing,
	onAnalyzeVisuals,
	onAutoPlace,
	recommendations,
}: {
	canAnalyzeVisuals: boolean;
	isAnalyzingVisuals: boolean;
	isPlacing: boolean;
	onAnalyzeVisuals: () => void;
	onAutoPlace: () => void;
	recommendations: ProjectAudioRecommendations;
}) {
	const { t } = useTranslation();
	return (
		<div className="mb-3 border-b border-border/60 bg-primary/5 px-1 pb-3">
			<div className="flex items-center gap-1.5 text-xs font-medium">
				<Sparkles className="size-3.5 text-primary" />
				{t("audioLibrary.section.projectRecommended")}
			</div>
			<p className="mt-1 text-[10px] leading-4 text-muted-foreground">
				{t("audioLibrary.recommendation.summary", {
					clips: recommendations.visualClipCount,
					captions: recommendations.captionCount,
				})}
			</p>
			<div className="mt-2 flex items-center justify-between gap-2">
				<p className="min-w-0 text-[9px] text-muted-foreground">
					{recommendations.visionAnalyzedCount > 0
						? t("audioLibrary.recommendation.visionReady", {
								count: recommendations.visionAnalyzedCount,
							})
						: t("audioLibrary.recommendation.visionDescription")}
				</p>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="h-7 shrink-0 text-[10px]"
					disabled={!canAnalyzeVisuals || isAnalyzingVisuals}
					title={
						canAnalyzeVisuals
							? undefined
							: t("audioLibrary.recommendation.visionUnavailable")
					}
					onClick={onAnalyzeVisuals}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							onAnalyzeVisuals();
						}
					}}
				>
					{isAnalyzingVisuals ? (
						<Loader2 className="size-3 animate-spin" />
					) : (
						<ScanSearch className="size-3" />
					)}
					{isAnalyzingVisuals
						? t("audioLibrary.recommendation.visionAnalyzing")
						: recommendations.visionAnalyzedCount > 0
							? t("audioLibrary.recommendation.visionRefresh")
							: t("audioLibrary.recommendation.visionAnalyze")}
				</Button>
			</div>
			<div className="mt-2 flex flex-wrap gap-1">
				{recommendations.signals.map((signal) => (
					<span
						key={signal}
						className="rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[9px] text-primary"
					>
						{t(SIGNAL_LABELS[signal])}
					</span>
				))}
			</div>
			{recommendations.cues.length > 0 ? (
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="mt-2 h-7 text-[10px]"
					disabled={isPlacing}
					onClick={onAutoPlace}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							onAutoPlace();
						}
					}}
				>
					{isPlacing ? (
						<Loader2 className="size-3 animate-spin" />
					) : (
						<AudioLines className="size-3" />
					)}
					{isPlacing
						? t("audioLibrary.recommendation.placing")
						: t("audioLibrary.recommendation.autoPlace", {
								count: recommendations.cues.length,
							})}
				</Button>
			) : (
				<p className="mt-2 text-[9px] text-muted-foreground">
					{t("audioLibrary.recommendation.noCues")}
				</p>
			)}
		</div>
	);
}
