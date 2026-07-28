import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "@/lib/i18n";
import {
	applyTextAnimationPreset,
	filterTextAnimationPresets,
	getTextAnimationPhase,
	getTextAnimationPhaseIntensity,
	textAnimationPresetSupportsIntensity,
	type TextAnimationPhase,
	type TextAnimationPresetDefinition,
	updateTextAnimationPhaseIntensity,
	updateTextAnimationPhaseTiming,
} from "@/lib/text/text-animation-presets";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { TextAnimationsV1, TextElement } from "@/types/timeline";
import { TextAnimationPresetGrid } from "./text-animation-preset-grid";
import {
	getSelectedTextAnimationPresetForProperties,
	resolveTextAnimationsForProperties,
} from "./text-animation-properties-compat";
import { NumberControl } from "./visual-property-controls";

const PHASE_LABEL_KEYS = {
	entrance: "textProperties.animationPhase.entrance",
	exit: "textProperties.animationPhase.exit",
	loop: "textProperties.animationPhase.loop",
} as const;

function animationPreviewWindow({
	element,
	phase,
	phaseDuration,
	phaseDelay,
	playhead,
}: {
	element: TextElement;
	phase: TextAnimationPhase;
	phaseDuration: number;
	phaseDelay: number;
	playhead: number;
}): { start: number; end: number } {
	const visibleStart = element.startTime + element.trimStart;
	const visibleEnd = Math.max(
		visibleStart + 0.1,
		element.startTime + element.duration - element.trimEnd
	);
	const previewDuration = Math.min(
		Math.max(0.1, phaseDuration + phaseDelay),
		visibleEnd - visibleStart
	);

	if (phase === "entrance") {
		return {
			start: visibleStart,
			end: Math.min(visibleEnd, visibleStart + previewDuration),
		};
	}

	if (phase === "exit") {
		return {
			start: Math.max(visibleStart, visibleEnd - previewDuration),
			end: visibleEnd,
		};
	}

	const latestStart = Math.max(visibleStart, visibleEnd - previewDuration);
	const start =
		playhead >= visibleStart && playhead <= latestStart
			? playhead
			: visibleStart;
	return { start, end: Math.min(visibleEnd, start + previewDuration) };
}

export function TextAnimationProperties({
	element,
	fps = 30,
	trackId,
}: {
	element: TextElement;
	fps?: number;
	trackId: string;
}) {
	const { t } = useTranslation();
	const [activePhase, setActivePhase] =
		useState<TextAnimationPhase>("entrance");
	const [query, setQuery] = useState("");
	const interactionActive = useRef(false);
	const previewTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
	const previewScope = `${element.id}:${activePhase}`;
	const previewScopeRef = useRef(previewScope);
	const updateTextElement = useTimelineStore(
		(state) => state.updateTextElement
	);
	const pushHistory = useTimelineStore((state) => state.pushHistory);
	const currentTime = usePlaybackStore((state) => state.currentTime);
	const pause = usePlaybackStore((state) => state.pause);
	const play = usePlaybackStore((state) => state.play);
	const seek = usePlaybackStore((state) => state.seek);
	const resolvedAnimations = resolveTextAnimationsForProperties({
		element,
		fps,
	});
	const effectiveAnimations = resolvedAnimations.animations;
	const selectedPreset = getSelectedTextAnimationPresetForProperties({
		animations: effectiveAnimations,
		phase: activePhase,
	});
	const phaseConfig =
		getTextAnimationPhase({
			animations: effectiveAnimations,
			phase: activePhase,
		}) ?? undefined;
	const filteredPresets = useMemo(
		() =>
			filterTextAnimationPresets({
				phase: activePhase,
				query,
				translate: t,
			}),
		[activePhase, query, t]
	);
	const intensity = getTextAnimationPhaseIntensity({
		animations: effectiveAnimations,
		phase: activePhase,
	});

	useEffect(() => {
		if (previewScopeRef.current !== previewScope && previewTimeout.current) {
			clearTimeout(previewTimeout.current);
			previewTimeout.current = null;
		}
		previewScopeRef.current = previewScope;
		return () => {
			if (!previewTimeout.current) return;
			clearTimeout(previewTimeout.current);
			previewTimeout.current = null;
		};
	}, [previewScope]);

	if (resolvedAnimations.unsupportedSchemaVersion !== undefined) {
		return (
			<p
				className="text-xs leading-relaxed text-muted-foreground"
				data-testid="text-animation-unsupported-schema"
			>
				{t("textProperties.animation.unsupportedSchema", {
					version: String(resolvedAnimations.unsupportedSchemaVersion),
				})}
			</p>
		);
	}

	const updateAnimations = ({
		animations,
		history = true,
	}: {
		animations: TextAnimationsV1;
		history?: boolean;
	}) => {
		updateTextElement(
			trackId,
			element.id,
			{
				animationType: "none",
				textAnimations: animations,
			},
			history
		);
	};

	const beginInteraction = () => {
		if (interactionActive.current) return;
		interactionActive.current = true;
		pushHistory();
	};

	const endInteraction = () => {
		interactionActive.current = false;
	};

	const applyPreset = ({
		preset,
	}: {
		preset: TextAnimationPresetDefinition;
	}) => {
		updateAnimations({
			animations: applyTextAnimationPreset({
				animations: effectiveAnimations,
				preset,
			}),
		});
	};

	const previewAtPlayhead = () => {
		const animation =
			getTextAnimationPhase({
				animations: effectiveAnimations,
				phase: activePhase,
			}) ??
			applyTextAnimationPreset({
				animations: undefined,
				preset: selectedPreset,
			})[activePhase];
		if (!animation || selectedPreset.id === "none") return;

		if (previewTimeout.current) clearTimeout(previewTimeout.current);
		const preview = animationPreviewWindow({
			element,
			phase: activePhase,
			phaseDuration: animation.timing.duration,
			phaseDelay: animation.timing.delay,
			playhead: currentTime,
		});
		pause();
		seek(preview.start);
		play();
		previewTimeout.current = setTimeout(
			() => {
				pause();
				previewTimeout.current = null;
			},
			Math.max(100, (preview.end - preview.start) * 1000)
		);
	};

	const phasePanel = (
		<div className="space-y-3">
			<div className="relative">
				<Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground">
					<title>{t("textProperties.animation.search")}</title>
				</Search>
				<Input
					type="search"
					value={query}
					aria-label={t("textProperties.animation.search")}
					placeholder={t("textProperties.animation.searchPlaceholder")}
					className="h-8 pl-8 text-xs"
					onChange={(event) => setQuery(event.target.value)}
				/>
			</div>

			<TextAnimationPresetGrid
				ariaLabel={t("textProperties.animation.presetGrid", {
					phase: t(PHASE_LABEL_KEYS[activePhase]),
				})}
				presets={filteredPresets}
				selectedPresetId={selectedPreset.id}
				emptyLabel={t("textProperties.animation.noResults")}
				translate={t}
				onSelect={applyPreset}
			/>

			{selectedPreset.id === "none" ? null : (
				<div className="space-y-3 border-t border-border pt-3">
					<NumberControl
						label={t("textProperties.label.duration")}
						value={
							phaseConfig?.timing.duration ?? selectedPreset.defaultDuration
						}
						min={0.1}
						max={10}
						step={0.05}
						suffix="s"
						onInteractionStart={beginInteraction}
						onInteractionEnd={endInteraction}
						onChange={(duration) =>
							updateAnimations({
								animations: updateTextAnimationPhaseTiming({
									animations: effectiveAnimations,
									phase: activePhase,
									duration,
								}),
								history: false,
							})
						}
					/>
					<NumberControl
						label={t("textProperties.label.delay")}
						value={phaseConfig?.timing.delay ?? selectedPreset.defaultDelay}
						min={0}
						max={5}
						step={0.05}
						suffix="s"
						onInteractionStart={beginInteraction}
						onInteractionEnd={endInteraction}
						onChange={(delay) =>
							updateAnimations({
								animations: updateTextAnimationPhaseTiming({
									animations: effectiveAnimations,
									phase: activePhase,
									delay,
								}),
								history: false,
							})
						}
					/>
					{textAnimationPresetSupportsIntensity({
						preset: selectedPreset,
					}) ? (
						<NumberControl
							label={t("textProperties.animation.intensity")}
							value={intensity * 100}
							min={0}
							max={100}
							step={1}
							suffix="%"
							onInteractionStart={beginInteraction}
							onInteractionEnd={endInteraction}
							onChange={(nextIntensity) =>
								updateAnimations({
									animations: updateTextAnimationPhaseIntensity({
										animations: effectiveAnimations,
										phase: activePhase,
										intensity: nextIntensity / 100,
									}),
									history: false,
								})
							}
						/>
					) : null}
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="w-full"
						onClick={previewAtPlayhead}
					>
						<Play className="mr-2 size-3.5" aria-hidden="true" />
						{t("textProperties.animation.preview")}
					</Button>
				</div>
			)}
		</div>
	);

	return (
		<div data-testid="text-animation-properties">
			<Tabs
				value={activePhase}
				onValueChange={(value) => setActivePhase(value as TextAnimationPhase)}
			>
				<TabsList className="grid h-8 w-full grid-cols-3 rounded-sm p-0.5">
					{(["entrance", "exit", "loop"] as const).map((phase) => (
						<TabsTrigger
							key={phase}
							value={phase}
							className="min-w-0 rounded-sm px-1 text-xs"
							data-testid={`text-animation-phase-${phase}`}
							onClick={() => setActivePhase(phase)}
						>
							{t(PHASE_LABEL_KEYS[phase])}
						</TabsTrigger>
					))}
				</TabsList>
				{(["entrance", "exit", "loop"] as const).map((phase) => (
					<TabsContent
						key={phase}
						value={phase}
						forceMount
						className="mt-3 data-[state=inactive]:hidden"
					>
						{phase === activePhase ? phasePanel : null}
					</TabsContent>
				))}
			</Tabs>
		</div>
	);
}
