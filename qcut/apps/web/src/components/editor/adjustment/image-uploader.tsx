"use client";

import { useCallback, useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Image as ImageIcon, Loader2, FileImage } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageUploaderProps {
  onImageSelect: (file: File) => void;
  uploading?: boolean;
}

export function ImageUploader({
  onImageSelect,
  uploading,
}: ImageUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        const file = e.dataTransfer.files[0];
        if (file.type.startsWith("image/")) {
          onImageSelect(file);
        }
      }
    },
    [onImageSelect]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      e.preventDefault();
      if (e.target.files && e.target.files[0]) {
        onImageSelect(e.target.files[0]);
      }
    },
    [onImageSelect]
  );

  const openFileDialog = useCallback(() => {
    inputRef.current?.click();
  }, []);

  return (
    <Card>
      <CardContent className="p-4">
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer",
            dragActive
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/25",
            uploading && "pointer-events-none opacity-50"
          )}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={openFileDialog}
        >
          <input
            ref={inputRef}
            type="file"
            multiple={false}
            className="hidden"
            accept="image/*"
            onChange={handleChange}
            disabled={uploading}
          />

          {uploading ? (
            <div className="flex flex-col items-center gap-2 py-2">
              <Loader2 className="size-6 text-primary animate-spin" />
              <div>
                <p className="text-sm font-medium">Loading image...</p>
                <p className="text-xs text-muted-foreground">
                  Please wait while we process your image
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-2">
              <div className="flex items-center justify-center size-12 rounded-full bg-muted/50">
                {dragActive ? (
                  <FileImage className="size-6 text-primary" />
                ) : (
                  <Upload className="size-6 text-muted-foreground" />
                )}
              </div>

              <div>
                <p className="text-sm font-medium">
                  {dragActive ? "Drop image here" : "Upload an image to edit"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Drag & drop or click to browse • JPEG, PNG, WebP
                </p>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="mt-1 h-7 text-xs !bg-transparent !border-transparent"
              >
                <ImageIcon className="size-3 mr-1.5" />
                Choose Image
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
