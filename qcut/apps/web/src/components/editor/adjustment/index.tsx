"use client";

import React from "react";
import { useAdjustmentStore } from "@/stores/adjustment-store";
import { useAsyncMediaStoreActions } from "@/hooks/use-async-media-store";
import { useParams } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Wand2, Loader2 } from "lucide-react";
import {
  editImage,
  uploadImageToFAL,
  type ImageEditRequest,
} from "@/lib/image-edit-client";
import { downloadImageAsFile, getImageInfo } from "@/lib/image-utils";

// Export individual components
export { EditHistory } from "./edit-history";
export { ImageUploader } from "./image-uploader";
export { ModelSelector } from "./model-selector";
export { ParameterControls } from "./parameter-controls";
export { PreviewPanel } from "./preview-panel";

// Import components for main panel
import { EditHistory } from "./edit-history";
import { ImageUploader } from "./image-uploader";
import { ModelSelector } from "./model-selector";
import { ParameterControls } from "./parameter-controls";
import { PreviewPanel } from "./preview-panel";

// Main adjustment panel component
export function AdjustmentPanel() {
  const params = useParams({ from: "/editor/$project_id" });
  const projectId = params.project_id;

  const {
    setOriginalImage,
    originalImageUrl,
    originalImage,
    showHistory,
    prompt,
    selectedModel,
    parameters,
    isProcessing,
    setProcessingState,
    addToHistory,
  } = useAdjustmentStore();

  const {
    addMediaItem,
    loading: mediaStoreLoading,
    error: mediaStoreError,
  } = useAsyncMediaStoreActions();

  const handleImageSelect = (file: File) => {
    const url = URL.createObjectURL(file);
    setOriginalImage(file, url);
  };

  const handleGenerateEdit = async () => {
    if (!prompt.trim()) {
      alert("Please enter a prompt describing the changes you want to make.");
      return;
    }

    if (!originalImage || !originalImageUrl) {
      alert("Please upload an image first.");
      return;
    }

    try {
      const startTime = Date.now();

      // Set initial processing state
      setProcessingState({
        isProcessing: true,
        progress: 0,
        statusMessage: "Uploading image...",
        elapsedTime: 0,
      });

      // Upload image to FAL
      console.log("🔄 Uploading image to FAL...");
      const uploadedImageUrl = await uploadImageToFAL(originalImage);

      setProcessingState({
        isProcessing: true,
        progress: 25,
        statusMessage: "Processing edit...",
        elapsedTime: (Date.now() - startTime) / 1000,
      });

      // Build edit request
      const editRequest: ImageEditRequest = {
        imageUrl: uploadedImageUrl,
        prompt: prompt.trim(),
        model: selectedModel,
        guidanceScale: parameters.guidanceScale,
        steps: parameters.steps,
        seed: parameters.seed,
        safetyTolerance: parameters.safetyTolerance,
        numImages: parameters.numImages,
      };

      console.log("🎨 Generating edit with:", editRequest);

      // Process edit with progress callback
      const result = await editImage(editRequest, (status) => {
        const elapsed = (Date.now() - startTime) / 1000;
        setProcessingState({
          isProcessing: true,
          progress: status.progress || 50,
          statusMessage: status.message || "Processing...",
          elapsedTime: elapsed,
          estimatedTime: status.estimatedTime,
        });
      });

      // Handle successful result
      if (result.status === "completed" && result.result_url) {
        const totalTime = (Date.now() - startTime) / 1000;

        // Download and add to media library first to get blob URL
        let blobUrl: string | undefined;
        try {
          console.log("📥 Downloading edited image to media library...", {
            resultUrl: result.result_url,
            projectId,
          });

          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const filename = `edited_${selectedModel}_${timestamp}.jpg`;

          console.log("🔄 Starting download process...", { filename });
          const downloadedFile = await downloadImageAsFile(
            result.result_url,
            filename
          );
          console.log("✅ Download completed:", {
            fileName: downloadedFile.name,
            fileSize: downloadedFile.size,
            fileType: downloadedFile.type,
          });

          // Create blob URL for display (avoids CORS/COEP issues)
          blobUrl = URL.createObjectURL(downloadedFile);
          console.log("🔗 Created blob URL for display:", blobUrl);

          console.log("🔍 Getting image info...");
          const imageInfo = await getImageInfo(downloadedFile);
          console.log("✅ Image info retrieved:", imageInfo);

          const mediaItem = {
            name: filename,
            type: "image" as const,
            file: downloadedFile,
            url: blobUrl,
            width: imageInfo.width,
            height: imageInfo.height,
            metadata: {
              source: "image_edit",
              model: selectedModel,
              prompt: prompt.trim(),
              originalImageUrl,
              processingTime: totalTime,
              seedUsed: result.seed_used,
            },
          };

          console.log("💾 Adding to media store...", {
            projectId,
            mediaItem: { ...mediaItem, file: "[File object]" },
          });
          if (!addMediaItem) {
            throw new Error("Media store not ready");
          }
          await addMediaItem(projectId, mediaItem);

          console.log(
            "✅ Edited image successfully added to media library:",
            filename
          );
        } catch (error) {
          console.error(
            "❌ Failed to add edited image to media library:",
            error
          );
          console.error("Error details:", {
            name: error instanceof Error ? error.name : "Unknown",
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });
          // Don't fail the whole operation, just log the error
        }

        // Add to edit history with blob URL (avoids CORS/COEP display issues)
        addToHistory({
          originalUrl: originalImageUrl,
          editedUrl: blobUrl || result.result_url, // Use blob URL if available, fallback to FAL URL
          prompt: prompt.trim(),
          model: selectedModel,
          parameters: { ...parameters },
          processingTime: totalTime,
        });

        setProcessingState({
          isProcessing: false,
          progress: 100,
          statusMessage: "Edit completed and added to media!",
          elapsedTime: totalTime,
        });

        console.log("✅ Edit completed successfully!", {
          resultUrl: result.result_url,
          blobUrl: blobUrl,
          processingTime: totalTime,
          seedUsed: result.seed_used,
        });
      } else {
        throw new Error(result.message || "Edit generation failed");
      }
    } catch (error) {
      console.error("❌ Edit generation failed:", error);

      setProcessingState({
        isProcessing: false,
        progress: 0,
        statusMessage: "Edit failed",
        elapsedTime: 0,
      });

      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      alert(`Edit generation failed: ${errorMessage}`);
    }
  };

  const canGenerateEdit = originalImageUrl && prompt.trim() && !isProcessing;

  // Handle media store loading/error states
  if (mediaStoreError) {
    return (
      <div className="h-full flex flex-col gap-4 p-4">
        <div className="flex items-center justify-center flex-1">
          <div className="text-center">
            <div className="text-red-500 mb-2">Failed to load media store</div>
            <div className="text-sm text-muted-foreground">
              {mediaStoreError.message}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mediaStoreLoading) {
    return (
      <div className="h-full flex flex-col gap-4 p-4">
        <div className="flex items-center justify-center flex-1">
          <div className="flex items-center space-x-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading image editor...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-4 p-4">
      {/* Generate Edit Button - Always at top */}
      <div className="flex-shrink-0">
        <Button
          onClick={handleGenerateEdit}
          disabled={!canGenerateEdit}
          className="w-full"
          size="lg"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4 mr-2" />
              Generate Edit
            </>
          )}
        </Button>
      </div>

      {/* Model Selection - Second */}
      <div className="flex-shrink-0">
        <ModelSelector />
      </div>

      {/* Image Upload Section - Third */}
      <div className="flex-shrink-0">
        <ImageUploader onImageSelect={handleImageSelect} uploading={false} />
      </div>

      {/* Only show other components if image is loaded */}
      {originalImageUrl && (
        <>
          {/* Parameter Controls */}
          <div className="flex-shrink-0">
            <ParameterControls />
          </div>

          {/* Preview Panel */}
          <div className="flex-1 min-h-0">
            <PreviewPanel />
          </div>

          {/* Edit History (conditionally rendered) */}
          {showHistory && (
            <div className="flex-1 min-h-0">
              <EditHistory />
            </div>
          )}
        </>
      )}

      {/* Empty state when no image */}
      {!originalImageUrl && (
        <div className="flex-1 flex items-center justify-center text-center text-muted-foreground">
          <div>
            <div className="text-6xl mb-4">🎨</div>
            <h3 className="text-lg font-medium mb-2">AI Image Editing</h3>
            <p className="text-sm">
              Upload an image to start editing with AI models
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
