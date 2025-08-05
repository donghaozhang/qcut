import React from "react";
import { useBlobImage } from "@/hooks/use-blob-image";
import { Loader2 } from "lucide-react";

interface BlobImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string; // Make alt required for accessibility
  fallback?: React.ReactNode;
}

/**
 * Image component that automatically converts external URLs to blob URLs
 * to bypass COEP restrictions (useful for fal.media images)
 */
export function BlobImage({
  src,
  alt,
  fallback,
  className,
  ...props
}: BlobImageProps) {
  const { blobUrl, isLoading, error } = useBlobImage(src);

  if (isLoading) {
    return (
      <div
        className={`flex items-center justify-center bg-muted ${className || ""}`}
      >
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && fallback) {
    return <>{fallback}</>;
  }

  return (
    <img src={blobUrl || src} alt={alt} className={className} {...props} />
  );
}
