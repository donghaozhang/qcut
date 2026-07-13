import { create } from "zustand";

export interface VideoAudioGenerationRequest {
	id: string;
	sourceVideo: File;
	previewUrl?: string;
	targetElementId?: string;
	sourceStart?: number;
	sourceEnd?: number;
	soundEffectPrompt?: string;
	backgroundMusicPrompt?: string;
	autoStart: boolean;
}

interface VideoEditRequestStore {
	audioGenerationRequest?: VideoAudioGenerationRequest;
	requestAudioGeneration: (request: VideoAudioGenerationRequest) => void;
	clearAudioGenerationRequest: ({ id }: { id: string }) => void;
}

export const useVideoEditRequestStore = create<VideoEditRequestStore>(
	(set) => ({
		requestAudioGeneration: (audioGenerationRequest) =>
			set({ audioGenerationRequest }),
		clearAudioGenerationRequest: ({ id }) =>
			set((state) =>
				state.audioGenerationRequest?.id === id
					? { audioGenerationRequest: undefined }
					: state
			),
	})
);
