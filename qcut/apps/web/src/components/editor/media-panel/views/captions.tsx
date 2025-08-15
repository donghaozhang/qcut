"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { LanguageSelect } from "@/components/captions/language-select";
import { UploadProgress } from "@/components/captions/upload-progress";
import { 
  Upload, 
  Download, 
  FileAudio, 
  FileVideo, 
  Loader2, 
  CheckCircle, 
  AlertCircle,
  Play,
  Pause,
  Plus
} from "lucide-react";
import { toast } from "sonner";
import { useDragDrop } from "@/hooks/use-drag-drop";
import { cn } from "@/lib/utils";
import { isTranscriptionConfigured } from "@/lib/transcription/transcription-utils";
import type { TranscriptionResult, TranscriptionSegment } from "@/types/captions";
import { extractAudio } from "@/lib/ffmpeg-utils";
import { encryptWithRandomKey } from "@/lib/transcription/zk-encryption";
import { r2Client } from "@/lib/storage/r2-client";
import { useTimelineStore } from "@/stores/timeline-store";
import { useCaptionsStore } from "@/stores/captions-store";

interface TranscriptionState {
  isUploading: boolean;
  isTranscribing: boolean;
  uploadProgress: number;
  transcriptionProgress: number;
  result: TranscriptionResult | null;
  error: string | null;
  currentFile: File | null;
}

export function CaptionsView() {
  const [selectedLanguage, setSelectedLanguage] = useState("auto");
  const [state, setState] = useState<TranscriptionState>({
    isUploading: false,
    isTranscribing: false,
    uploadProgress: 0,
    transcriptionProgress: 0,
    result: null,
    error: null,
    currentFile: null,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Timeline and captions store hooks
  const { addTrack, addElementToTrack } = useTimelineStore();
  const { createCaptionElements, completeTranscriptionJob, startTranscriptionJob } = useCaptionsStore();

  // Check if transcription is configured
  const { configured, missingVars } = isTranscriptionConfigured();

  const updateState = useCallback((updates: Partial<TranscriptionState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const addCaptionsToTimeline = useCallback((result: TranscriptionResult) => {
    try {
      // Create caption elements from transcription result
      const captionElements = createCaptionElements(result);
      
      if (captionElements.length === 0) {
        toast.warning("No captions were generated from the transcription");
        return;
      }

      // Create or find a captions track
      const trackId = addTrack("captions");

      // Add all caption elements to the track
      captionElements.forEach((captionElement) => {
        addElementToTrack(trackId, captionElement);
      });

      toast.success(`Added ${captionElements.length} caption segments to timeline`);
    } catch (error) {
      console.error("Failed to add captions to timeline:", error);
      toast.error("Failed to add captions to timeline");
    }
  }, [createCaptionElements, addTrack, addElementToTrack]);

  const stopTranscription = useCallback(() => {
    updateState({
      isUploading: false,
      isTranscribing: false,
      uploadProgress: 0,
      transcriptionProgress: 0,
      error: "Transcription cancelled by user",
    });
    toast.info("Transcription cancelled");
  }, []);

  // Performance: Simple cache for transcription results
  const getCachedTranscription = useCallback((fileKey: string): TranscriptionResult | null => {
    try {
      const cached = localStorage.getItem(`transcription-${fileKey}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        // Cache valid for 24 hours
        if (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
          return parsed.result;
        }
        localStorage.removeItem(`transcription-${fileKey}`);
      }
    } catch (error) {
      console.warn('Cache read error:', error);
    }
    return null;
  }, []);

  const handleFileSelect = useCallback((files: FileList) => {
    const file = files[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['video/', 'audio/'];
    const isValidType = validTypes.some(type => file.type.startsWith(type));
    
    if (!isValidType) {
      toast.error("Please select a video or audio file");
      return;
    }

    // Performance: Check cache first
    const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
    const cachedResult = getCachedTranscription(fileKey);
    
    if (cachedResult) {
      toast.success("Found cached transcription!");
      setState(prev => ({ ...prev, result: cachedResult }));
      return;
    }

    // Enhanced file size validation with optimization hints
    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      if (file.size > 500 * 1024 * 1024) { // 500MB hard limit
        toast.error("File too large (max 500MB). Please use a smaller file.");
        return;
      }
      toast.info("Large file detected. This may take longer to process...");
    }

    startTranscription(file, fileKey);
  }, [getCachedTranscription]);

  const startTranscription = async (file: File, fileKey?: string) => {
    if (!configured) {
      toast.error(`Transcription not configured. Missing: ${missingVars.join(", ")}`);
      return;
    }

    updateState({
      isUploading: true,
      uploadProgress: 0,
      error: null,
      result: null,
      currentFile: file,
    });

    try {
      // Start transcription job in store
      const jobId = startTranscriptionJob({
        fileName: file.name,
        language: selectedLanguage,
      });

      // Step 1: Extract audio from video file (if needed)
      let audioFile: File;
      if (file.type.startsWith('video/')) {
        toast.info("Extracting audio from video...");
        updateState({ uploadProgress: 10 });
        
        const audioBlob = await extractAudio(file, "wav");
        audioFile = new File([audioBlob], `${file.name}.wav`, { type: "audio/wav" });
        updateState({ uploadProgress: 30 });
      } else {
        audioFile = file;
        updateState({ uploadProgress: 20 });
      }

      // Step 2: Encrypt the audio file using zero-knowledge encryption
      toast.info("Encrypting audio file...");
      const { encryptedData, key, iv } = await encryptWithRandomKey(await audioFile.arrayBuffer());
      updateState({ uploadProgress: 50 });

      // Step 3: Upload encrypted file to R2
      toast.info("Uploading to secure storage...");
      const r2Key = r2Client.generateTranscriptionKey(audioFile.name);
      await r2Client.uploadFile(r2Key, encryptedData, "application/octet-stream");
      updateState({ uploadProgress: 70 });

      // Step 4: Call transcription API
      toast.info("Starting transcription...");
      updateState({
        isUploading: false,
        uploadProgress: 100,
        isTranscribing: true,
        transcriptionProgress: 10,
      });

      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename: r2Key,
          language: selectedLanguage,
          decryptionKey: key,
          iv: iv,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Transcription failed");
      }

      updateState({ transcriptionProgress: 90 });

      const result: TranscriptionResult = await response.json();
      
      // Complete transcription job in store
      completeTranscriptionJob(jobId, result);
      
      updateState({
        isTranscribing: false,
        transcriptionProgress: 100,
        result,
      });

      toast.success(`Transcription completed! Found ${result.segments.length} segments.`);
      
      // Performance: Cache the result for future use
      if (fileKey) {
        try {
          const cacheData = { result, timestamp: Date.now() };
          localStorage.setItem(`transcription-${fileKey}`, JSON.stringify(cacheData));
        } catch (error) {
          console.warn('Failed to cache transcription:', error);
        }
      }

    } catch (error) {
      console.error("Transcription error:", error);
      const errorMessage = error instanceof Error ? error.message : "Transcription failed";
      
      updateState({
        isUploading: false,
        isTranscribing: false,
        error: errorMessage,
      });
      
      // Enhanced error messaging with actionable suggestions
      if (errorMessage.includes("rate limit") || errorMessage.includes("429")) {
        toast.error("Rate limit exceeded. Please wait a moment before trying again.");
      } else if (errorMessage.includes("503") || errorMessage.includes("not configured")) {
        toast.error("Transcription service not configured. Check environment variables.");
      } else if (errorMessage.includes("network") || errorMessage.includes("fetch")) {
        toast.error("Network error. Check your internet connection and try again.");
      } else if (errorMessage.includes("413") || errorMessage.includes("too large")) {
        toast.error("File too large. Please use a file smaller than 100MB.");
      } else {
        toast.error(`Transcription failed: ${errorMessage}`);
      }
    }
  };

  const { isDragOver, dragProps } = useDragDrop({
    onDrop: (files) => handleFileSelect(files),
  });

  const isProcessing = state.isUploading || state.isTranscribing;

  return (
    <div className="h-full flex flex-col p-4 space-y-4">
      {/* Configuration Warning */}
      {!configured && (
        <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
          <AlertCircle className="size-4 text-yellow-500" />
          <div className="text-sm">
            <p className="font-medium">Transcription Not Configured</p>
            <p className="text-muted-foreground">
              Missing environment variables: {missingVars.join(", ")}
            </p>
          </div>
        </div>
      )}

      {/* Language Selection */}
      <div className="space-y-2">
        <Label htmlFor="language">Transcription Language</Label>
        <LanguageSelect
          selectedCountry={selectedLanguage}
          onSelect={setSelectedLanguage}
          containerRef={containerRef}
        />
      </div>

      {/* Upload Area */}
      <div
        ref={containerRef}
        className={cn(
          "relative border-2 border-dashed rounded-lg p-6 transition-colors",
          isDragOver 
            ? "border-primary bg-primary/5" 
            : "border-muted-foreground/25 hover:border-muted-foreground/50",
          isProcessing && "pointer-events-none opacity-50"
        )}
        {...dragProps}
      >
        <div className="text-center space-y-4">
          {!isProcessing && !state.result && (
            <>
              <div className="mx-auto size-12 rounded-full bg-muted flex items-center justify-center">
                <Upload className="size-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Drop video or audio files here</p>
                <p className="text-xs text-muted-foreground">
                  Supports MP4, MOV, MP3, WAV, M4A (max 100MB)
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={!configured}
              >
                <Plus className="size-4 mr-2" />
                Choose File
              </Button>
            </>
          )}
          
          {/* Loading Skeleton for Processing */}
          {isProcessing && !state.result && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Skeleton className="size-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
              
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <Skeleton className="h-3 w-16" />
                <div className="space-y-2">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              </div>
              
              <Skeleton className="h-8 w-full" />
            </div>
          )}

          {/* Progress Display */}
          {(state.isUploading || state.isTranscribing) && (
            <UploadProgress
              isUploading={state.isUploading}
              isTranscribing={state.isTranscribing}
              uploadProgress={state.uploadProgress}
              transcriptionProgress={state.transcriptionProgress}
              isEncrypted={true}
              fileName={state.currentFile?.name}
              onCancel={stopTranscription}
            />
          )}

          {/* Success State */}
          {state.result && (
            <div className="space-y-3">
              <CheckCircle className="size-8 mx-auto text-green-500" />
              <div>
                <p className="text-sm font-medium">Transcription Complete</p>
                <p className="text-xs text-muted-foreground">
                  Found {state.result.segments.length} segments
                </p>
              </div>
            </div>
          )}

          {/* Error State with Enhanced UX */}
          {state.error && (
            <div className="space-y-3">
              <AlertCircle className="size-8 mx-auto text-red-500" />
              <div>
                <p className="text-sm font-medium text-red-500">Transcription Failed</p>
                <p className="text-xs text-muted-foreground">{state.error}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    updateState({ error: null });
                    toast.info("Ready to try again");
                  }}
                  className="flex-1"
                >
                  Try Again
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    updateState({ error: null });
                    toast.info("Error cleared");
                  }}
                >
                  Clear
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Transcription Result */}
      {state.result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Transcription Result</Label>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => state.result && addCaptionsToTimeline(state.result)}
            >
              <Download className="size-4 mr-2" />
              Add to Timeline
            </Button>
          </div>
          
          <ScrollArea className="h-40 w-full border rounded-md p-3">
            <div className="space-y-2">
              {state.result.segments.map((segment) => (
                <div key={segment.id} className="text-sm">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <span>{segment.start.toFixed(1)}s - {segment.end.toFixed(1)}s</span>
                  </div>
                  <p>{segment.text}</p>
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="text-xs text-muted-foreground">
            Language: {state.result.language} • {state.result.segments.length} segments
          </div>
        </div>
      )}

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="video/*,audio/*"
        onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
      />
    </div>
  );
}