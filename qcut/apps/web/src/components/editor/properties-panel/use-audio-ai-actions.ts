import { useCallback, useEffect, useRef } from "react";
import type {
	AudioStemName,
	MediaAudioSettings,
	MediaElement,
} from "@/types/timeline";
import type { MediaItem } from "@/stores/media/media-store-types";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { useProjectStore } from "@/stores/project-store";
import {
	convertClipVoice,
	enhanceSpeechAudio,
	separateAudioStems,
} from "@/lib/audio/audio-ai-service";
import type { RemoteAudioFile } from "@/lib/audio/audio-ai-service";
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

async function addSeparatedStemMedia({
	stems,
	projectId,
	element,
	duration,
	signal,
}: {
	stems: Partial<Record<AudioStemName, RemoteAudioFile>>;
	projectId: string;
	element: MediaElement;
	duration: number;
	signal: AbortSignal;
}): Promise<{
	stemMediaIds: Partial<Record<AudioStemName, string>>;
	stemGains: Partial<Record<AudioStemName, number>>;
}> {
	const entries = Object.entries(stems).filter(
		(entry): entry is [AudioStemName, RemoteAudioFile] => entry[1] !== undefined
	);
	const added = await Promise.all(
		entries.map(async ([stem, remote]) => {
			const mediaId = await addRemoteAudioMedia({
				projectId,
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
				signal,
			});
			return [stem, mediaId] as const;
		})
	);
	return {
		stemMediaIds: Object.fromEntries(added),
		stemGains: Object.fromEntries(added.map(([stem]) => [stem, 1] as const)),
	};
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
		element,
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
			const { stemMediaIds, stemGains } = await addSeparatedStemMedia({
				stems,
				projectId: operation.projectId,
				element,
				duration,
				signal: operation.controller.signal,
			});
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
		element,
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
						inputMediaId: element.mediaId,
						sourceStem: undefined,
						error: undefined,
					},
					cover: { ...current.cover, enabled: false },
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
							inputMediaId: element.mediaId,
							sourceStem: undefined,
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

	const runCover = useCallback(
		async ({
			targetVoiceUrl,
			targetVoiceFile,
		}: {
			targetVoiceUrl?: string;
			targetVoiceFile?: File;
		}) => {
			const operation = begin();
			const previous = latestSettings();
			let stage: "separating" | "converting" = "separating";
			persistSettings({
				next: {
					...previous,
					separation: {
						...previous.separation,
						status: "processing",
						error: undefined,
					},
					cover: {
						...previous.cover,
						enabled: false,
						status: "separating",
						error: undefined,
					},
				},
				history: false,
			});
			try {
				const targetVoicePromise = targetVoiceFile
					? audioFileToFalUrl({ file: targetVoiceFile })
					: Promise.resolve(undefined);
				const sourceAudioUrl = await mediaItemToFalAudioUrl({
					mediaItem: operation.mediaItem,
				});
				const [stems, uploadedTargetUrl] = await Promise.all([
					separateAudioStems({
						audioUrl: sourceAudioUrl,
						signal: operation.controller.signal,
					}),
					targetVoicePromise,
				]);
				if (!stems.vocals) {
					throw new Error("Voice separation did not return a vocal stem");
				}
				const { stemMediaIds, stemGains } = await addSeparatedStemMedia({
					stems,
					projectId: operation.projectId,
					element,
					duration,
					signal: operation.controller.signal,
				});
				if (!isCurrentOperation(operation)) return;
				stage = "converting";
				const separated = latestSettings();
				persistSettings({
					next: {
						...separated,
						separation: {
							...separated.separation,
							enabled: true,
							status: "ready",
							stemMediaIds,
							stemGains,
							error: undefined,
						},
						cover: {
							...separated.cover,
							status: "converting",
							error: undefined,
						},
					},
					history: false,
				});
				const convertedVocal = await convertClipVoice({
					sourceAudioUrl: stems.vocals.url,
					targetVoiceAudioUrl:
						uploadedTargetUrl || targetVoiceUrl?.trim() || undefined,
					signal: operation.controller.signal,
				});
				if (!isCurrentOperation(operation)) return;
				const convertedVocalMediaId = await addRemoteAudioMedia({
					projectId: operation.projectId,
					remote: convertedVocal,
					name: `${element.name}-cover-vocals.wav`,
					duration,
					metadata: {
						source: "audio-ai-cover-vocals",
						provider: "fal",
						model: "fal-ai/chatterbox/speech-to-speech",
						sourceMediaId: element.mediaId,
						inputVocalMediaId: stemMediaIds.vocals,
					},
					signal: operation.controller.signal,
				});
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
						},
						voiceConversion: {
							enabled: true,
							status: "ready",
							sourceMediaId: convertedVocalMediaId,
							inputMediaId: stemMediaIds.vocals,
							sourceStem: "vocals",
							provider: "fal",
							model: "fal-ai/chatterbox/speech-to-speech",
						},
						cover: {
							enabled: true,
							status: "ready",
							convertedVocalMediaId,
							targetVoiceLabel:
								targetVoiceFile?.name ||
								(targetVoiceUrl?.trim() ? "Voice URL" : "Default voice"),
							provider: "fal",
							model: "fal-ai/chatterbox/speech-to-speech",
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
						separation:
							stage === "separating"
								? {
										...previous.separation,
										status: "error",
										error: message(error),
									}
								: latest.separation,
						voiceConversion:
							stage === "converting"
								? previous.voiceConversion
								: latest.voiceConversion,
						cover: {
							...previous.cover,
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
			element,
			finishOperation,
			isCurrentOperation,
			latestSettings,
			persistSettings,
		]
	);

	return { runAiDenoise, runSeparation, runVoiceConversion, runCover };
}
