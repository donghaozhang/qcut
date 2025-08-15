import { create } from "zustand";
import type {
  TranscriptionResult,
  TranscriptionSegment,
  TranscriptionStatus,
} from "@/types/captions";
import type { CreateCaptionElement } from "@/types/timeline";
import { generateUUID } from "@/lib/utils";

interface CaptionTrack {
  id: string;
  name: string;
  language: string;
  segments: TranscriptionSegment[];
  isActive: boolean;
  source: "transcription" | "manual" | "imported";
  createdAt: string;
}

interface TranscriptionJob {
  id: string;
  fileName: string;
  language: string;
  status: TranscriptionStatus;
  progress: number;
  result?: TranscriptionResult;
  error?: string;
  createdAt: string;
}

interface CaptionsStore {
  // Caption tracks management
  captionTracks: CaptionTrack[];
  activeCaptionTrack: string | null;

  // Transcription jobs management
  transcriptionJobs: TranscriptionJob[];
  activeJob: string | null;

  // Actions
  addCaptionTrack: (track: Omit<CaptionTrack, "id" | "createdAt">) => string;
  removeCaptionTrack: (trackId: string) => void;
  updateCaptionTrack: (trackId: string, updates: Partial<CaptionTrack>) => void;
  setActiveCaptionTrack: (trackId: string | null) => void;

  // Transcription job actions
  startTranscriptionJob: (
    job: Omit<TranscriptionJob, "id" | "createdAt" | "status" | "progress">
  ) => string;
  updateTranscriptionJob: (
    jobId: string,
    updates: Partial<TranscriptionJob>
  ) => void;
  completeTranscriptionJob: (
    jobId: string,
    result: TranscriptionResult
  ) => void;
  failTranscriptionJob: (jobId: string, error: string) => void;
  removeTranscriptionJob: (jobId: string) => void;

  // Convert transcription to timeline elements
  createCaptionElements: (
    transcriptionResult: TranscriptionResult
  ) => CreateCaptionElement[];

  // Utility functions
  getCaptionTrackById: (trackId: string) => CaptionTrack | undefined;
  getTranscriptionJobById: (jobId: string) => TranscriptionJob | undefined;
  getActiveTranscriptionJob: () => TranscriptionJob | undefined;

  // Cleanup
  clearCompletedJobs: () => void;
  reset: () => void;
}

export const useCaptionsStore = create<CaptionsStore>((set, get) => ({
  // Initial state
  captionTracks: [],
  activeCaptionTrack: null,
  transcriptionJobs: [],
  activeJob: null,

  // Caption tracks actions
  addCaptionTrack: (track) => {
    const id = generateUUID();
    const newTrack: CaptionTrack = {
      ...track,
      id,
      createdAt: new Date().toISOString(),
    };

    set((state) => ({
      captionTracks: [...state.captionTracks, newTrack],
      activeCaptionTrack: state.activeCaptionTrack || id,
    }));

    return id;
  },

  removeCaptionTrack: (trackId) => {
    set((state) => ({
      captionTracks: state.captionTracks.filter(
        (track) => track.id !== trackId
      ),
      activeCaptionTrack:
        state.activeCaptionTrack === trackId ? null : state.activeCaptionTrack,
    }));
  },

  updateCaptionTrack: (trackId, updates) => {
    set((state) => ({
      captionTracks: state.captionTracks.map((track) =>
        track.id === trackId ? { ...track, ...updates } : track
      ),
    }));
  },

  setActiveCaptionTrack: (trackId) => {
    set({ activeCaptionTrack: trackId });
  },

  // Transcription job actions
  startTranscriptionJob: (job) => {
    const id = generateUUID();
    const newJob: TranscriptionJob = {
      ...job,
      id,
      status: "preparing",
      progress: 0,
      createdAt: new Date().toISOString(),
    };

    set((state) => ({
      transcriptionJobs: [...state.transcriptionJobs, newJob],
      activeJob: id,
    }));

    return id;
  },

  updateTranscriptionJob: (jobId, updates) => {
    set((state) => ({
      transcriptionJobs: state.transcriptionJobs.map((job) =>
        job.id === jobId ? { ...job, ...updates } : job
      ),
    }));
  },

  completeTranscriptionJob: (jobId, result) => {
    const { addCaptionTrack } = get();

    // Create a caption track from the transcription result
    const trackId = addCaptionTrack({
      name: `Captions (${result.language})`,
      language: result.language,
      segments: result.segments,
      isActive: true,
      source: "transcription",
    });

    // Update the job status
    set((state) => ({
      transcriptionJobs: state.transcriptionJobs.map((job) =>
        job.id === jobId
          ? {
              ...job,
              status: "completed" as TranscriptionStatus,
              progress: 100,
              result,
            }
          : job
      ),
      activeJob: null,
    }));
  },

  failTranscriptionJob: (jobId, error) => {
    set((state) => ({
      transcriptionJobs: state.transcriptionJobs.map((job) =>
        job.id === jobId
          ? { ...job, status: "error" as TranscriptionStatus, error }
          : job
      ),
      activeJob: state.activeJob === jobId ? null : state.activeJob,
    }));
  },

  removeTranscriptionJob: (jobId) => {
    set((state) => ({
      transcriptionJobs: state.transcriptionJobs.filter(
        (job) => job.id !== jobId
      ),
      activeJob: state.activeJob === jobId ? null : state.activeJob,
    }));
  },

  // Convert transcription result to timeline elements
  createCaptionElements: (transcriptionResult) => {
    return transcriptionResult.segments.map(
      (segment): CreateCaptionElement => ({
        type: "captions",
        name: `Caption ${segment.id}`,
        duration: segment.end - segment.start,
        startTime: segment.start,
        trimStart: 0,
        trimEnd: segment.end - segment.start,
        text: segment.text,
        language: transcriptionResult.language,
        confidence: 1 - segment.no_speech_prob, // Convert no_speech_prob to confidence
        source: "transcription",
      })
    );
  },

  // Utility functions
  getCaptionTrackById: (trackId) => {
    return get().captionTracks.find((track) => track.id === trackId);
  },

  getTranscriptionJobById: (jobId) => {
    return get().transcriptionJobs.find((job) => job.id === jobId);
  },

  getActiveTranscriptionJob: () => {
    const { activeJob, transcriptionJobs } = get();
    return activeJob
      ? transcriptionJobs.find((job) => job.id === activeJob)
      : undefined;
  },

  // Cleanup
  clearCompletedJobs: () => {
    set((state) => ({
      transcriptionJobs: state.transcriptionJobs.filter(
        (job) => job.status !== "completed" && job.status !== "error"
      ),
    }));
  },

  reset: () => {
    set({
      captionTracks: [],
      activeCaptionTrack: null,
      transcriptionJobs: [],
      activeJob: null,
    });
  },
}));
