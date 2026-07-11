import { useCallback, useEffect, useRef } from "react";
import type { MediaAudioSettings, MediaElement } from "@/types/timeline";
import type { MediaItem } from "@/stores/media/media-store-types";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { useProjectStore } from "@/stores/project-store";
import {
	convertClipVoice,
	enhanceSpeechAudio,
	separateAudioStems,
} from "@/lib/audio/audio-ai-service";
import {
	addRemoteAudioMedia,
	audioFileToFalUrl,
	mediaItemToFalAudioUrl,
} from "@/lib/audio/audio-ai-media";
import { normalizeMediaAudioSettings } from "@/lib/audio/audio-properties";

type PersistSettings = ({
	next,
	history,
}: {
	next: MediaAudioSettings;
	history?: boolean;
}) => void;

function message(error: unknown): string {
	return error instanceof Error ? error.message : "Audio AI processing failed";
}

export function useAudioAiActions({
	element,
	trackId,
	mediaItem,
	duration,
	settings,
	persistSettings,
}: {
	element: MediaElement;
	trackId: string;
	mediaItem: MediaItem | undefined;
	duration: number;
	settings: MediaAudioSettings;
	persistSettings: PersistSettings;
}) {
	const projectId = useProjectStore((state) => state.activeProject?.id);
	const pushHistory = useTimelineStore((state) => state.pushHistory);
	const controllerRef = useRef<AbortController | null>(null);

	useEffect(
		() => () => {
			controllerRef.current?.abort();
		},
		[]
	);

	const latestSettings = useCallback(() => {
		const latest = useTimelineStore
			.getState()
			._tracks.find((track) => track.id === trackId)
			?.elements.find((candidate) => candidate.id === element.id);
		return latest?.type === "media"
			? normalizeMediaAudioSettings({ element: latest })
			: settings;
	}, [element.id, settings, trackId]);

	const begin = useCallback(() => {
		if (!projectId || !mediaItem) {
			throw new Error(
				"The selected clip is not available in the media library"
			);
		}
		controllerRef.current?.abort();
		const controller = new AbortController();
		controllerRef.current = controller;
		pushHistory();
		return { controller, mediaItem, projectId };
	}, [mediaItem, projectId, pushHistory]);
	const isCurrentOperation = useCallback(
		({ controller }: { controller: AbortController }) =>
			controllerRef.current === controller && !controller.signal.aborted,
		[]
	);
	const finishOperation = useCallback(
		({ controller }: { controller: AbortController }) => {
			if (controllerRef.current === controller) controllerRef.current = null;
		},
		[]
	);

	const runAiDenoise = useCallback(async () => {
		let operation: ReturnType<typeof begin>;
		try {
			operation = begin();
		} catch (error) {
			throw new Error(message(error));
		}
		const current = latestSettings();
		persistSettings({
			next: {
				...current,
				denoise: {
					...current.denoise,
					enabled: true,
					mode: "ai",
					status: "processing",
					error: undefined,
				},
			},
			history: false,
		});
		try {
			const audioUrl = await mediaItemToFalAudioUrl({
				mediaItem: operation.mediaItem,
			});
			const remote = await enhanceSpeechAudio({
				audioUrl,
				signal: operation.controller.signal,
			});
			if (!isCurrentOperation(operation)) return;
			const processedMediaId = await addRemoteAudioMedia({
				projectId: operation.projectId,
				remote,
				name: `${element.name}-ai-denoised.wav`,
				duration,
				metadata: {
					source: "audio-ai-denoise",
					provider: "fal",
					model: "fal-ai/deepfilternet3",
					sourceMediaId: element.mediaId,
				},
				signal: operation.controller.signal,
			});
			if (!isCurrentOperation(operation)) return;
			const latest = latestSettings();
			persistSettings({
				next: {
					...latest,
					denoise: {
						...latest.denoise,
						enabled: true,
						mode: "ai",
						status: "ready",
						processedMediaId,
						error: undefined,
					},
				},
				history: false,
			});
			finishOperation(operation);
		} catch (error) {
			if (!isCurrentOperation(operation)) return;
			const latest = latestSettings();
			persistSettings({
				next: {
					...latest,
					denoise: {
						...latest.denoise,
						mode: "ai",
						status: "error",
						error: message(error),
					},
				},
				history: false,
			});
			finishOperation(operation);
			throw error;
		}
	}, [
		begin,
		duration,
		element.mediaId,
		element.name,
		finishOperation,
		isCurrentOperation,
		latestSettings,
		persistSettings,
	]);

	const runSeparation = useCallback(async () => {
		const operation = begin();
		const current = latestSettings();
		persistSettings({
			next: {
				...current,
				separation: {
					...current.separation,
					enabled: true,
					status: "processing",
					error: undefined,
				},
			},
			history: false,
		});
		try {
			const audioUrl = await mediaItemToFalAudioUrl({
				mediaItem: operation.mediaItem,
			});
			const stems = await separateAudioStems({
				audioUrl,
				signal: operation.controller.signal,
			});
			if (!isCurrentOperation(operation)) return;
			const entries = Object.entries(stems).filter(
				(
					entry
				): entry is [
					keyof typeof stems,
					NonNullable<(typeof stems)[keyof typeof stems]>,
				] => entry[1] !== undefined
			);
			const added = await Promise.all(
				entries.map(async ([stem, remote]) => {
					const mediaId = await addRemoteAudioMedia({
						projectId: operation.projectId,
						remote,
						name: `${element.name}-${stem}.wav`,
						duration,
						metadata: {
							source: "audio-stem-separation",
							provider: "fal",
							model: "fal-ai/demucs",
							stem,
							sourceMediaId: element.mediaId,
						},
						signal: operation.controller.signal,
					});
					return [stem, mediaId] as const;
				})
			);
			const stemMediaIds = Object.fromEntries(added);
			const stemGains = Object.fromEntries(
				added.map(([stem]) => [stem, 1] as const)
			);
			if (!isCurrentOperation(operation)) return;
			const latest = latestSettings();
			persistSettings({
				next: {
					...latest,
					separation: {
						...latest.separation,
						enabled: true,
						status: "ready",
						stemMediaIds,
						stemGains,
						error: undefined,
					},
				},
				history: false,
			});
			finishOperation(operation);
		} catch (error) {
			if (!isCurrentOperation(operation)) return;
			const latest = latestSettings();
			persistSettings({
				next: {
					...latest,
					separation: {
						...latest.separation,
						status: "error",
						error: message(error),
					},
				},
				history: false,
			});
			finishOperation(operation);
			throw error;
		}
	}, [
		begin,
		duration,
		element.mediaId,
		element.name,
		finishOperation,
		isCurrentOperation,
		latestSettings,
		persistSettings,
	]);

	const runVoiceConversion = useCallback(
		async ({
			targetVoiceUrl,
			targetVoiceFile,
		}: {
			targetVoiceUrl?: string;
			targetVoiceFile?: File;
		}) => {
			const operation = begin();
			const current = latestSettings();
			persistSettings({
				next: {
					...current,
					voiceConversion: {
						...current.voiceConversion,
						enabled: true,
						status: "processing",
						provider: "fal",
						model: "fal-ai/chatterbox/speech-to-speech",
						error: undefined,
					},
				},
				history: false,
			});
			try {
				const [sourceAudioUrl, uploadedTargetUrl] = await Promise.all([
					mediaItemToFalAudioUrl({ mediaItem: operation.mediaItem }),
					targetVoiceFile
						? audioFileToFalUrl({ file: targetVoiceFile })
						: Promise.resolve(undefined),
				]);
				const remote = await convertClipVoice({
					sourceAudioUrl,
					targetVoiceAudioUrl:
						uploadedTargetUrl || targetVoiceUrl?.trim() || undefined,
					signal: operation.controller.signal,
				});
				if (!isCurrentOperation(operation)) return;
				const sourceMediaId = await addRemoteAudioMedia({
					projectId: operation.projectId,
					remote,
					name: `${element.name}-voice-converted.wav`,
					duration,
					metadata: {
						source: "audio-voice-conversion",
						provider: "fal",
						model: "fal-ai/chatterbox/speech-to-speech",
						sourceMediaId: element.mediaId,
					},
					signal: operation.controller.signal,
				});
				if (!isCurrentOperation(operation)) return;
				const latest = latestSettings();
				persistSettings({
					next: {
						...latest,
						voiceConversion: {
							...latest.voiceConversion,
							enabled: true,
							status: "ready",
							sourceMediaId,
							provider: "fal",
							model: "fal-ai/chatterbox/speech-to-speech",
							error: undefined,
						},
					},
					history: false,
				});
				finishOperation(operation);
			} catch (error) {
				if (!isCurrentOperation(operation)) return;
				const latest = latestSettings();
				persistSettings({
					next: {
						...latest,
						voiceConversion: {
							...latest.voiceConversion,
							status: "error",
							error: message(error),
						},
					},
					history: false,
				});
				finishOperation(operation);
				throw error;
			}
		},
		[
			begin,
			duration,
			element.mediaId,
			element.name,
			finishOperation,
			isCurrentOperation,
			latestSettings,
			persistSettings,
		]
	);

	return { runAiDenoise, runSeparation, runVoiceConversion };
}
