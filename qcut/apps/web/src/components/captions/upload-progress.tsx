import { Loader2, Shield, Upload, CheckCircle, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface UploadProgressProps {
  isUploading?: boolean;
  isTranscribing?: boolean;
  uploadProgress?: number;
  transcriptionProgress?: number;
  isEncrypted?: boolean;
  fileName?: string;
  className?: string;
  onCancel?: () => void;
}

export function UploadProgress({
  isUploading = false,
  isTranscribing = false,
  uploadProgress = 0,
  transcriptionProgress = 0,
  isEncrypted = false,
  fileName,
  className,
  onCancel,
}: UploadProgressProps) {
  const isProcessing = isUploading || isTranscribing;
  
  if (!isProcessing) return null;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Current Status */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">
              {isUploading ? "Uploading file..." : "Transcribing audio..."}
            </p>
            {isEncrypted && (
              <Shield className="size-4 text-green-500 flex-shrink-0" />
            )}
          </div>
          {fileName && (
            <p className="text-xs text-muted-foreground truncate">{fileName}</p>
          )}
        </div>
        {onCancel && (
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="h-8 w-8 p-0 flex-shrink-0"
          >
            <X className="size-4" />
          </Button>
        )}
      </div>

      {/* Upload Progress */}
      {isUploading && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {isEncrypted ? "Encrypting and uploading" : "Uploading"}
            </span>
            <span className="font-medium">{uploadProgress}%</span>
          </div>
          <Progress value={uploadProgress} className="h-2" />
          
          {/* Encryption Status */}
          {isEncrypted && uploadProgress > 0 && (
            <div className="flex items-center gap-2 text-xs text-green-600">
              <Shield className="size-3" />
              <span>File encrypted with zero-knowledge encryption</span>
            </div>
          )}
        </div>
      )}

      {/* Transcription Progress */}
      {isTranscribing && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Processing with AI transcription</span>
            <span className="font-medium">{transcriptionProgress}%</span>
          </div>
          <Progress value={transcriptionProgress} className="h-2" />
          
          {/* Processing Steps */}
          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <CheckCircle className="size-3 text-green-500" />
              <span>Audio extracted from file</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="size-3 text-green-500" />
              <span>Sent to transcription service</span>
            </div>
            <div className="flex items-center gap-2">
              {transcriptionProgress > 50 ? (
                <CheckCircle className="size-3 text-green-500" />
              ) : (
                <Loader2 className="size-3 animate-spin" />
              )}
              <span>AI processing audio...</span>
            </div>
            {transcriptionProgress > 80 && (
              <div className="flex items-center gap-2">
                <Loader2 className="size-3 animate-spin" />
                <span>Generating captions...</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default UploadProgress;