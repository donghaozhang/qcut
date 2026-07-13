import { useEffect, useRef } from "react";
import { Eye, EyeOff, Pause, Play, RotateCcw } from "lucide-react";
import type {
	AudioKeyframeProperty,
	MediaAudioSettings,
	MediaElement,
	MediaPropertyKeyframe,
} from "@/types/timeline";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useProjectStore } from "@/stores/project-store";
import {
	DEFAULT_MEDIA_AUDIO_SETTINGS,
	buildLegacyAudioFields,
	normalizeMediaAudioSettings,
	resetMediaAudioProcessing,
} from "@/lib/audio/audio-properties";
import {
	getAudioKeyframePropertyValue,
	resolveMediaAudioSettings,
	setAudioKeyframePropertyValue,
	upsertAudioKeyframe,
} from "@/lib/audio/audio-keyframe-properties";
import { getMediaTimelineDuration } from "@/lib/video/video-timing";
import { generateUUID } from "@/types/timeline";
import { useMediaStore } from "@/stores/media/media-store";
import {
	AUDIO_PROPERTIES_TABS,
	type AudioPropertiesTab,
	usePropertiesPanelStore,
} from "@/stores/editor/properties-panel-store";
import { analyzeMediaLoudness } from "@/lib/audio/audio-loudness-analysis";
import { AudioBasicSettings } from "./audio-basic-settings";
import { AudioVoiceSettings } from "./audio-voice-settings";
import { AudioEffectSettings } from "./audio-effect-settings";
import type { AudioSettingsEditorBindings } from "./audio-properties-types";
import { useAudioAiActions } from "./use-audio-ai-actions";
import { AudioLyricsSettings } from "./audio-lyrics-settings";
import { MediaSpeedProperties } from "./media-speed-properties";
import { BeatDetectionPanel } from "./beat-detection-panel";
import { Button } from "@/components/ui/button";
import {
	selectAudioPreviewBypassed,
	useAudioPreviewStore,
} from "@/stores/editor/audio-preview-store";

type MediaUpdates = Parameters<
	ReturnType<typeof useTimelineStore.getState>["updateMediaElement"]
>[2];

export function AudioPropertiesPanel({
	element,
	trackId,
}: {
	element: MediaElement;
	trackId: string;
}) {
	const updateMediaElement = useTimelineStore(
		(state) => state.updateMediaElement
	);
	const pushHistory = useTimelineStore((state) => state.pushHistory);
	const currentTime = usePlaybackStore((state) => state.currentTime);
	const seek = usePlaybackStore((state) => state.seek);
	const isPlaying = usePlaybackStore((state) => state.isPlaying);
	const play = usePlaybackStore((state) => state.play);
	const pause = usePlaybackStore((state) => state.pause);
	const fps = useProjectStore((state) => state.activeProject?.fps ?? 30);
	const mediaItem = useMediaStore((state) =>
		state.mediaItems.find((item) => item.id === element.mediaId)
	);
	const interactionActive = useRef(false);
	const activeTab = usePropertiesPanelStore((state) => state.activeAudioTab);
	const setActiveTab = usePropertiesPanelStore(
		(state) => state.setActiveAudioTab
	);
	const audioRequest = usePropertiesPanelStore((state) => state.audioRequest);
	const previewBypassed = useAudioPreviewStore((state) =>
		selectAudioPreviewBypassed({ state, elementId: element.id })
	);
	const setElementBypassed = useAudioPreviewStore(
		(state) => state.setElementBypassed
	);
	const clearPreviewElement = useAudioPreviewStore(
		(state) => state.clearElement
	);
	const settings = normalizeMediaAudioSettings({ element });
	const resolvedSettings = resolveMediaAudioSettings({
		element,
		currentTime,
		fps,
	});
	const duration = getMediaTimelineDuration(element, fps);
	const durationInFrames = Math.max(1, Math.round(duration * fps));
	const currentFrame = Math.min(
		durationInFrames,
		Math.max(0, Math.round((currentTime - element.startTime) * fps))
	);

	const persistSettings = ({
		next,
		history = !interactionActive.current,
	}: {
		next: MediaAudioSettings;
		history?: boolean;
	}) => {
		const updates: MediaUpdates = {
			audio: next,
			...buildLegacyAudioFields({ settings: next }),
		};
		updateMediaElement(trackId, element.id, updates, history);
	};
	const beginInteraction = () => {
		if (interactionActive.current) return;
		interactionActive.current = true;
		pushHistory();
	};
	const endInteraction = () => {
		interactionActive.current = false;
	};
	const updateProperty = (property: AudioKeyframeProperty, value: number) => {
		const existingKeyframes = settings.keyframes?.[property] ?? [];
		if (existingKeyframes.length === 0) {
			persistSettings({
				next: setAudioKeyframePropertyValue({ settings, property, value }),
			});
			return;
		}
		const existing = existingKeyframes.find(
			(keyframe) => keyframe.frame === currentFrame
		);
		const keyframe: MediaPropertyKeyframe = {
			id: existing?.id ?? `audio-keyframe-${generateUUID()}`,
			frame: currentFrame,
			value,
			easing: existing?.easing ?? "linear",
		};
		persistSettings({
			next: {
				...settings,
				keyframes: {
					...settings.keyframes,
					[property]: upsertAudioKeyframe({
						keyframes: existingKeyframes,
						keyframe,
					}),
				},
			},
		});
	};
	const toggleKeyframe = (property: AudioKeyframeProperty) => {
		const keyframes = settings.keyframes?.[property] ?? [];
		const existing = keyframes.find(
			(keyframe) => keyframe.frame === currentFrame
		);
		const nextKeyframes = existing
			? keyframes.filter((keyframe) => keyframe.id !== existing.id)
			: upsertAudioKeyframe({
					keyframes,
					keyframe: {
						id: `audio-keyframe-${generateUUID()}`,
						frame: currentFrame,
						value: getAudioKeyframePropertyValue({
							settings: resolvedSettings,
							property,
						}),
						easing: "linear",
					},
				});
		persistSettings({
			next: {
				...settings,
				keyframes: { ...settings.keyframes, [property]: nextKeyframes },
			},
		});
	};
	const analyzeLoudness = async () => {
		pushHistory();
		persistSettings({
			next: {
				...settings,
				loudness: {
					...settings.loudness,
					analysisStatus: "analyzing",
					analysisError: undefined,
				},
			},
			history: false,
		});
		try {
			const analysis = await analyzeMediaLoudness({
				file: mediaItem?.file,
				url: mediaItem?.url,
			});
			const latestElement = useTimelineStore
				.getState()
				._tracks.find((track) => track.id === trackId)
				?.elements.find((candidate) => candidate.id === element.id);
			const latestSettings =
				latestElement?.type === "media"
					? normalizeMediaAudioSettings({ element: latestElement })
					: settings;
			persistSettings({
				next: {
					...latestSettings,
					loudness: {
						...latestSettings.loudness,
						measuredLufs: analysis.integratedLufs,
						measuredTruePeakDb: analysis.truePeakDb,
						analysisStatus: "ready",
						analysisError: undefined,
					},
				},
				history: false,
			});
		} catch (error) {
			persistSettings({
				next: {
					...settings,
					loudness: {
						...settings.loudness,
						analysisStatus: "error",
						analysisError:
							error instanceof Error ? error.message : "Analysis failed",
					},
				},
				history: false,
			});
		}
	};
	const audioAiActions = useAudioAiActions({
		element,
		trackId,
		mediaItem,
		duration,
		settings,
		persistSettings,
	});
	const resetAllProcessing = () => {
		persistSettings({ next: resetMediaAudioProcessing({ settings }) });
		setElementBypassed({ elementId: element.id, bypassed: false });
	};
	const toggleAudition = () => {
		if (isPlaying) {
			pause();
			return;
		}
		const clipEnd = element.startTime + duration;
		if (currentTime < element.startTime || currentTime >= clipEnd) {
			seek(element.startTime);
		}
		play();
	};

	useEffect(() => {
		if (audioRequest?.elementId !== element.id || !audioRequest.section) {
			return;
		}
		const animationFrame = requestAnimationFrame(() => {
			document
				.querySelector(`[data-testid="audio-module-${audioRequest.section}"]`)
				?.scrollIntoView({ block: "center", behavior: "smooth" });
		});
		return () => cancelAnimationFrame(animationFrame);
	}, [audioRequest, element.id]);
	useEffect(
		() => () => clearPreviewElement({ elementId: element.id }),
		[clearPreviewElement, element.id]
	);
	const bindings: AudioSettingsEditorBindings = {
		settings,
		resolvedSettings,
		currentFrame,
		maxFadeDuration: Math.max(0.1, duration / 2),
		onSettingsChange: (next) => persistSettings({ next }),
		onPropertyChange: updateProperty,
		onToggleKeyframe: toggleKeyframe,
		onSeekFrame: (frame) => seek(element.startTime + frame / fps),
		onAnalyzeLoudness: analyzeLoudness,
		onRunAiDenoise: audioAiActions.runAiDenoise,
		onRunSeparation: audioAiActions.runSeparation,
		onRunVoiceConversion: audioAiActions.runVoiceConversion,
		onRunCover: audioAiActions.runCover,
		onInteractionStart: beginInteraction,
		onInteractionEnd: endInteraction,
	};

	return (
		<div data-testid="audio-properties-panel">
			<div className="flex h-9 items-center gap-1 border-b border-border px-3">
				<span className="text-xs font-medium">声音</span>
				<span className="mx-1 text-xs text-muted-foreground">·</span>
				<span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
					{element.name}
				</span>
				<Button
					type="button"
					variant="text"
					size="icon"
					className="size-7 shrink-0"
					aria-label={isPlaying ? "暂停声音预览" : "预览声音"}
					title={isPlaying ? "暂停声音预览" : "预览声音"}
					data-testid="audio-preview-playback"
					onClick={toggleAudition}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.currentTarget.click();
						}
					}}
				>
					{isPlaying ? (
						<Pause className="size-3.5" />
					) : (
						<Play className="size-3.5" />
					)}
				</Button>
				<Button
					type="button"
					variant={previewBypassed ? "secondary" : "text"}
					size="icon"
					className="size-7 shrink-0"
					aria-label={previewBypassed ? "试听处理后的声音" : "试听原始声音"}
					aria-pressed={previewBypassed}
					title={previewBypassed ? "试听处理后的声音" : "试听原始声音"}
					data-testid="audio-preview-bypass"
					onClick={() =>
						setElementBypassed({
							elementId: element.id,
							bypassed: !previewBypassed,
						})
					}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.currentTarget.click();
						}
					}}
				>
					{previewBypassed ? (
						<Eye className="size-3.5" />
					) : (
						<EyeOff className="size-3.5" />
					)}
				</Button>
				<Button
					type="button"
					variant="text"
					size="icon"
					className="size-7 shrink-0"
					aria-label="重置全部声音处理"
					title="重置全部声音处理"
					data-testid="audio-reset-all"
					onClick={resetAllProcessing}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.currentTarget.click();
						}
					}}
				>
					<RotateCcw className="size-3.5" />
				</Button>
			</div>
			<Tabs
				value={activeTab}
				onValueChange={(value) => {
					if (AUDIO_PROPERTIES_TABS.includes(value as AudioPropertiesTab)) {
						setActiveTab(value as AudioPropertiesTab);
					}
				}}
			>
				<TabsList className="sticky top-0 z-10 grid h-9 w-full grid-cols-5 rounded-none border-b border-border bg-panel p-0">
					<TabsTrigger
						value="basic"
						className="h-9 min-w-0 rounded-none border-b-2 border-transparent px-1 text-[10px] data-[state=active]:border-primary data-[state=active]:bg-transparent"
					>
						基础
					</TabsTrigger>
					<TabsTrigger
						value="voice"
						className="h-9 min-w-0 rounded-none border-b-2 border-transparent px-1 text-[10px] data-[state=active]:border-primary data-[state=active]:bg-transparent"
					>
						人声
					</TabsTrigger>
					<TabsTrigger
						value="effects"
						className="h-9 min-w-0 rounded-none border-b-2 border-transparent px-1 text-[10px] data-[state=active]:border-primary data-[state=active]:bg-transparent"
					>
						音效
					</TabsTrigger>
					<TabsTrigger
						value="speed"
						className="h-9 min-w-0 rounded-none border-b-2 border-transparent px-1 text-[10px] data-[state=active]:border-primary data-[state=active]:bg-transparent"
					>
						变速
					</TabsTrigger>
					<TabsTrigger
						value="lyrics"
						className="h-9 min-w-0 rounded-none border-b-2 border-transparent px-1 text-[10px] data-[state=active]:border-primary data-[state=active]:bg-transparent"
					>
						歌词
					</TabsTrigger>
				</TabsList>
				<TabsContent value="basic" className="m-0 px-3">
					<AudioBasicSettings bindings={bindings} trackId={trackId} />
				</TabsContent>
				<TabsContent value="voice" className="m-0 px-3">
					<AudioVoiceSettings bindings={bindings} />
				</TabsContent>
				<TabsContent value="effects" className="m-0 px-3">
					<AudioEffectSettings bindings={bindings} />
					<BeatDetectionPanel
						elementId={element.id}
						trackId={trackId}
						audioUrl={mediaItem?.url}
					/>
				</TabsContent>
				<TabsContent value="speed" className="m-0 px-3 py-3">
					<MediaSpeedProperties
						element={element}
						trackId={trackId}
						mediaKind={mediaItem?.type === "audio" ? "audio" : "video"}
					/>
				</TabsContent>
				<TabsContent value="lyrics" className="m-0 px-3">
					<AudioLyricsSettings
						element={element}
						trackId={trackId}
						mediaItem={mediaItem}
						bindings={bindings}
					/>
				</TabsContent>
			</Tabs>
		</div>
	);
}

export function defaultAudioUpdates(): MediaUpdates {
	return {
		audio: { ...DEFAULT_MEDIA_AUDIO_SETTINGS },
		...buildLegacyAudioFields({ settings: DEFAULT_MEDIA_AUDIO_SETTINGS }),
	};
}
