"use client";

import React from 'react';
import { useAdjustmentStore } from '@/stores/adjustment-store';

// Export individual components
export { EditHistory } from './edit-history';
export { ImageUploader } from './image-uploader';
export { ModelSelector } from './model-selector';
export { ParameterControls } from './parameter-controls';
export { PreviewPanel } from './preview-panel';

// Import components for main panel
import { EditHistory } from './edit-history';
import { ImageUploader } from './image-uploader';
import { ModelSelector } from './model-selector';
import { ParameterControls } from './parameter-controls';
import { PreviewPanel } from './preview-panel';

// Main adjustment panel component
export function AdjustmentPanel() {
  const { setOriginalImage, originalImageUrl, showHistory } = useAdjustmentStore();

  const handleImageSelect = (file: File) => {
    const url = URL.createObjectURL(file);
    setOriginalImage(file, url);
  };

  return (
    <div className="h-full flex flex-col gap-4 p-4">
      {/* Image Upload Section */}
      <div className="flex-shrink-0">
        <ImageUploader 
          onImageSelect={handleImageSelect}
          uploading={false}
        />
      </div>

      {/* Only show other components if image is loaded */}
      {originalImageUrl && (
        <>
          {/* Model Selection */}
          <div className="flex-shrink-0">
            <ModelSelector />
          </div>

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
            <p className="text-sm">Upload an image to start editing with AI models</p>
          </div>
        </div>
      )}
    </div>
  );
}