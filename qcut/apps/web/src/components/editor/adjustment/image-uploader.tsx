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
            <div className="flex items-center gap-3 py-1">
              <Loader2 className="size-5 text-primary animate-spin" />
              <div className="text-left">
                <p className="text-sm font-medium">Loading image...</p>
                <p className="text-xs text-muted-foreground">
                  Processing your image
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 py-1">
              <div className="flex items-center justify-center size-10 rounded-full bg-muted/50 shrink-0">
                {dragActive ? (
                  <FileImage className="size-5 text-primary" />
                ) : (
                  <Upload className="size-5 text-muted-foreground" />
                )}
              </div>

              <div className="text-left flex-1">
                <p className="text-sm font-medium leading-tight">
                  {dragActive ? "Drop image here" : "Upload an image to edit"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Drag & drop or click • JPEG, PNG, WebP
                </p>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs !bg-transparent !border-transparent shrink-0"
              >
                <ImageIcon className="size-3 mr-1" />
                Browse
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
