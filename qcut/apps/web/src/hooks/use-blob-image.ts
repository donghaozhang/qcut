import { useState, useEffect } from "react";
import {
  convertToBlob,
  needsBlobConversion,
  revokeBlobUrl,
} from "@/lib/image-utils";

/**
 * Hook to convert external image URLs (like fal.media) to blob URLs
 * This bypasses COEP restrictions that prevent loading cross-origin images
 */
export function useBlobImage(url: string | undefined): {
  blobUrl: string | undefined;
  isLoading: boolean;
  error: string | null;
} {
  const [blobUrl, setBlobUrl] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      setBlobUrl(undefined);
      setIsLoading(false);
      setError(null);
      return;
    }

    // If URL doesn't need blob conversion, use it directly
    if (!needsBlobConversion(url)) {
      setBlobUrl(url);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Convert to blob URL
    setIsLoading(true);
    setError(null);

    convertToBlob(url)
      .then((blob) => {
        setBlobUrl(blob);
        setError(null);
      })
      .catch((err) => {
        console.error("Failed to convert image to blob:", err);
        setError(err.message || "Failed to load image");
        setBlobUrl(url); // Fallback to original URL
      })
      .finally(() => {
        setIsLoading(false);
      });

    // Don't cleanup blob URLs - they're managed globally by the cache
    // This prevents issues where the same image is used in multiple places
    // Blob URLs will be cleaned up when media items are removed from the store
  }, [url]);

  return { blobUrl, isLoading, error };
}
