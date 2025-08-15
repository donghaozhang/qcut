"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
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

  // Check if transcription is configured
  const { configured, missingVars } = isTranscriptionConfigured();

  const updateState = useCallback((updates: Partial<TranscriptionState>) => {
    setState(prev => ({ ...prev, ...updates }));
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

    // Validate file size (max 100MB)
    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error("File size must be less than 100MB");
      return;
    }

    startTranscription(file);
  }, []);

  const startTranscription = async (file: File) => {
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
      // Simulate upload progress
      const uploadInterval = setInterval(() => {
        setState(prev => ({
          ...prev,
          uploadProgress: Math.min(prev.uploadProgress + 10, 90),
        }));
      }, 200);

      // In a real implementation, you would:
      // 1. Encrypt the file using zk-encryption
      // 2. Upload to R2 using r2-client
      // 3. Call the transcription API
      
      // For now, simulate the process
      await new Promise(resolve => setTimeout(resolve, 2000));
      clearInterval(uploadInterval);

      updateState({
        isUploading: false,
        uploadProgress: 100,
        isTranscribing: true,
        transcriptionProgress: 0,
      });

      // Simulate transcription progress
      const transcriptionInterval = setInterval(() => {
        setState(prev => ({
          ...prev,
          transcriptionProgress: Math.min(prev.transcriptionProgress + 15, 90),
        }));
      }, 500);

      // Simulate completion
      await new Promise(resolve => setTimeout(resolve, 3000));
      clearInterval(transcriptionInterval);

      // Mock result for demonstration
      const mockResult: TranscriptionResult = {
        text: "This is a sample transcription result. The audio has been processed and converted to text.",
        segments: [
          {
            id: 1,
            seek: 0,
            start: 0.0,
            end: 2.5,
            text: "This is a sample transcription result.",
            tokens: [1, 2, 3],
            temperature: 0.0,
            avg_logprob: -0.5,
            compression_ratio: 1.2,
            no_speech_prob: 0.1,
          },
          {
            id: 2,
            seek: 2500,
            start: 2.5,
            end: 5.0,
            text: "The audio has been processed and converted to text.",
            tokens: [4, 5, 6],
            temperature: 0.0,
            avg_logprob: -0.4,
            compression_ratio: 1.1,
            no_speech_prob: 0.2,
          },
        ],
        language: selectedLanguage === "auto" ? "en" : selectedLanguage,
      };

      updateState({
        isTranscribing: false,
        transcriptionProgress: 100,
        result: mockResult,
      });

      toast.success("Transcription completed successfully!");

    } catch (error) {
      updateState({
        isUploading: false,
        isTranscribing: false,
        error: error instanceof Error ? error.message : "Transcription failed",
      });
      toast.error("Transcription failed. Please try again.");
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

          {/* Progress Display */}
          {(state.isUploading || state.isTranscribing) && (
            <UploadProgress
              isUploading={state.isUploading}
              isTranscribing={state.isTranscribing}
              uploadProgress={state.uploadProgress}
              transcriptionProgress={state.transcriptionProgress}
              isEncrypted={true}
              fileName={state.currentFile?.name}
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

          {/* Error State */}
          {state.error && (
            <div className="space-y-3">
              <AlertCircle className="size-8 mx-auto text-red-500" />
              <div>
                <p className="text-sm font-medium text-red-500">Error</p>
                <p className="text-xs text-muted-foreground">{state.error}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateState({ error: null })}
              >
                Try Again
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Transcription Result */}
      {state.result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Transcription Result</Label>
            <Button size="sm" variant="outline">
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