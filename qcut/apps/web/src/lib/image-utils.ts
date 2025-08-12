/**
 * Image utility functions for the adjustment panel
 */

import { debugLog, debugError } from "@/lib/debug-config";

export interface ImageInfo {
  width: number;
  height: number;
  size: number;
  type: string;
  aspectRatio: number;
}

/**
 * Get image information from a File
 */
export async function getImageInfo(file: File): Promise<ImageInfo> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    img.onload = () => {
      const info: ImageInfo = {
        width: img.naturalWidth,
        height: img.naturalHeight,
        size: file.size,
        type: file.type,
        aspectRatio: img.naturalWidth / img.naturalHeight,
      };
      resolve(info);
    };

    img.onerror = () => {
      reject(new Error("Failed to load image"));
    };

    reader.onloadend = () => {
      img.src = reader.result as string;
    };

    reader.onerror = () => {
      reject(new Error("Failed to read image file"));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Validate image file
 */
export function validateImageFile(file: File): {
  valid: boolean;
  error?: string;
} {
  // Check file type
  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: "Unsupported file type. Please use JPEG, PNG, or WebP.",
    };
  }

  // Check file size (max 50MB)
  const maxSize = 50 * 1024 * 1024;
  if (file.size > maxSize) {
    return {
      valid: false,
      error: "File too large. Maximum size is 50MB.",
    };
  }

  return { valid: true };
}

/**
 * Resize image to fit within max dimensions while maintaining aspect ratio
 */
export async function resizeImage(
  file: File,
  maxWidth: number,
  maxHeight: number,
  quality = 0.8
): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      reject(new Error("Failed to get canvas context"));
      return;
    }

    img.onload = () => {
      // Calculate new dimensions
      let { width, height } = img;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.floor(width * ratio);
        height = Math.floor(height * ratio);
      }

      // Set canvas size and draw image
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const resizedFile = new File([blob], file.name, {
              type: file.type,
              lastModified: Date.now(),
            });
            resolve(resizedFile);
          } else {
            reject(new Error("Failed to resize image"));
          }
        },
        file.type,
        quality
      );
    };

    img.onerror = () => reject(new Error("Failed to load image"));
    
    // Use data URL instead of blob URL to avoid Electron issues
    const reader = new FileReader();
    reader.onloadend = () => {
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Convert image to data URL
 */
export function imageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        resolve(e.target.result as string);
      } else {
        reject(new Error("Failed to read file"));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Download image from URL
 */
export async function downloadImage(
  url: string,
  filename: string
): Promise<void> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();

    // Convert to data URL for download to avoid Electron blob URL issues
    const reader = new FileReader();
    reader.onloadend = () => {
      const link = document.createElement("a");
      link.href = reader.result as string;
      link.download = filename;
      link.style.display = "none";

      document.body.appendChild(link);

      // Use setTimeout to ensure proper download without navigation
      setTimeout(() => {
        link.click();
        document.body.removeChild(link);
      }, 10);
    };
    reader.onerror = () => {
      throw new Error("Failed to convert blob to data URL");
    };
    reader.readAsDataURL(blob);
  } catch (error) {
    throw new Error(`Failed to download image: ${error}`);
  }
}

/**
 * Cache for blob URLs to avoid creating multiple blob URLs for the same image
 * Also tracks blob URL to original URL mapping for cleanup
 */
const blobUrlCache = new Map<string, string>();
const blobToOriginalUrl = new Map<string, string>();

/**
 * Convert an image URL to a blob URL that bypasses COEP restrictions
 * Useful for displaying images from external domains like fal.media
 */
export async function convertToBlob(url: string): Promise<string> {
  // If it's already a blob URL, return it as-is
  if (url.startsWith("blob:")) {
    return url;
  }

  // Return cached blob URL if available
  if (blobUrlCache.has(url)) {
    const cachedUrl = blobUrlCache.get(url)!;
    debugLog(`[convertToBlob] Using cached blob URL for ${url}: ${cachedUrl}`);
    return cachedUrl;
  }

  try {
    debugLog(`[convertToBlob] Fetching image with CORS headers: ${url}`);
    const response = await fetch(url, {
      mode: "cors",
      headers: {
        "Accept": "image/*",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const blob = await response.blob();
    
    // Convert blob to data URL instead of blob URL to avoid Electron issues
    const reader = new FileReader();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    // ENHANCED LOGGING for data URL conversion
    console.log('✅ [IMAGE-UTILS] Created data URL:', {
      originalUrl: url,
      dataUrlPrefix: dataUrl.substring(0, 50),
      blobSize: blob.size,
      blobType: blob.type
    });

    // Cache the data URL
    blobUrlCache.set(url, dataUrl);
    blobToOriginalUrl.set(dataUrl, url);
    debugLog(`[convertToBlob] Created new data URL for ${url}`);

    return dataUrl;
  } catch (error) {
    debugError(`Failed to convert image to blob URL: ${url}`, error);
    // Return original URL as fallback
    return url;
  }
}

/**
 * Clean up cached data URL
 */
export function revokeBlobUrl(originalUrl: string): void {
  const dataUrl = blobUrlCache.get(originalUrl);
  if (dataUrl) {
    debugLog(
      `[revokeBlobUrl] Removing cached data URL for ${originalUrl}`
    );
    // Data URLs don't need to be revoked, just remove from cache
    blobUrlCache.delete(originalUrl);
    blobToOriginalUrl.delete(dataUrl);
  }
}

/**
 * Get all cached blob URLs (for debugging)
 */
export function getCachedBlobUrls(): Map<string, string> {
  return new Map(blobUrlCache);
}

/**
 * Check if a URL is from fal.media domains and needs blob conversion
 */
export function needsBlobConversion(url: string): boolean {
  // Skip blob URLs as they're already converted
  if (url.startsWith("blob:")) {
    return false;
  }
  return url.includes("fal.media") || url.includes("v3.fal.media");
}

/**
 * Download image from URL and convert to File object for media library
 */
export async function downloadImageAsFile(
  url: string,
  filename: string
): Promise<File> {
  try {
    debugLog(`[convertToBlob] Downloading image from: ${url}`);

    // Enhanced fetch with CORS handling for FAL.ai URLs
    const response = await fetch(url, {
      mode: "cors",
      headers: {
        "Accept": "image/*",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const blob = await response.blob();
    debugLog(
      `[convertToBlob] Downloaded blob: ${blob.size} bytes, type: ${blob.type}`
    );

    // Determine MIME type from blob or URL
    let mimeType = blob.type;
    if (!mimeType) {
      // Fallback: guess from URL extension
      const extension = url.split(".").pop()?.toLowerCase();
      switch (extension) {
        case "jpg":
        case "jpeg":
          mimeType = "image/jpeg";
          break;
        case "png":
          mimeType = "image/png";
          break;
        case "webp":
          mimeType = "image/webp";
          break;
        default:
          mimeType = "image/jpeg"; // Default fallback
      }
    }

    // Create File object
    const file = new File([blob], filename, {
      type: mimeType,
      lastModified: Date.now(),
    });

    return file;
  } catch (error) {
    throw new Error(`Failed to download image as file: ${error}`);
  }
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / k ** i).toFixed(2)) + " " + sizes[i];
}

/**
 * Get optimal image dimensions for display
 */
export function getDisplayDimensions(
  originalWidth: number,
  originalHeight: number,
  containerWidth: number,
  containerHeight: number
): { width: number; height: number } {
  const ratio = originalWidth / originalHeight;
  const containerRatio = containerWidth / containerHeight;

  let width: number, height: number;

  if (ratio > containerRatio) {
    // Image is wider than container
    width = containerWidth;
    height = containerWidth / ratio;
  } else {
    // Image is taller than container
    height = containerHeight;
    width = containerHeight * ratio;
  }

  return { width, height };
}
