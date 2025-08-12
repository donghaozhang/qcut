/**
 * Sticker Download Helper
 * 
 * Downloads SVG content from Iconify API and returns as File object
 * to avoid blob URL issues in Electron by using OPFS storage pattern
 */

import { downloadIconSvg } from './iconify-api';

/**
 * Downloads a sticker from Iconify API and returns it as a File object
 * 
 * @param iconId - The icon identifier in format "collection:icon" (e.g., "simple-icons:github")
 * @param name - Optional custom name for the file (defaults to iconId)
 * @returns Promise<File> - The SVG content as a File object ready for storage
 */
export async function downloadStickerAsFile(
  iconId: string,
  name?: string
): Promise<File> {
  try {
    // Parse the iconId to get collection and icon name
    const [collection, icon] = iconId.split(':');
    
    if (!collection || !icon) {
      throw new Error(`Invalid icon ID format: ${iconId}. Expected format: "collection:icon"`);
    }

    // Download SVG content from Iconify API
    // Using standard size for consistency with existing sticker handling
    const svgContent = await downloadIconSvg(collection, icon, {
      color: 'currentColor',
      width: 512,
      height: 512,
    });

    if (!svgContent) {
      throw new Error(`Failed to download SVG content for ${iconId}`);
    }

    // Generate filename
    // Use provided name or fallback to iconId with proper sanitization
    const fileName = name 
      ? `${name}.svg`
      : `${collection}-${icon}.svg`;

    // Sanitize filename (remove special characters that could cause issues)
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9-_.]/g, '-');

    // Create File object from SVG content
    // Using Blob constructor first, then File to ensure proper MIME type
    const svgBlob = new Blob([svgContent], { type: 'image/svg+xml' });
    const svgFile = new File([svgBlob], sanitizedFileName, {
      type: 'image/svg+xml',
      lastModified: Date.now(),
    });

    // Log for debugging (can be removed in production)
    console.log(`[Sticker Downloader] Downloaded ${iconId} as File:`, {
      name: svgFile.name,
      size: svgFile.size,
      type: svgFile.type,
    });

    return svgFile;
  } catch (error) {
    // Enhanced error handling with context
    const errorMessage = error instanceof Error 
      ? error.message 
      : 'Unknown error occurred';
    
    console.error(`[Sticker Downloader] Failed to download ${iconId}:`, error);
    
    // Re-throw with more context
    throw new Error(`Failed to download sticker "${iconId}": ${errorMessage}`);
  }
}

/**
 * Downloads multiple stickers in parallel
 * 
 * @param iconIds - Array of icon identifiers
 * @returns Promise<File[]> - Array of File objects
 */
export async function downloadMultipleStickersAsFiles(
  iconIds: string[]
): Promise<File[]> {
  try {
    const downloadPromises = iconIds.map(iconId => downloadStickerAsFile(iconId));
    const files = await Promise.all(downloadPromises);
    
    console.log(`[Sticker Downloader] Downloaded ${files.length} stickers as Files`);
    
    return files;
  } catch (error) {
    console.error('[Sticker Downloader] Failed to download multiple stickers:', error);
    throw error;
  }
}

/**
 * Validates if an icon ID exists before downloading
 * 
 * @param iconId - The icon identifier to validate
 * @returns Promise<boolean> - True if icon exists, false otherwise
 */
export async function validateStickerExists(iconId: string): Promise<boolean> {
  try {
    const [collection, icon] = iconId.split(':');
    
    if (!collection || !icon) {
      return false;
    }

    // Try to download with minimal size to check existence
    const svgContent = await downloadIconSvg(collection, icon, {
      width: 24,
      height: 24,
    });

    return !!svgContent && svgContent.length > 0;
  } catch (error) {
    console.warn(`[Sticker Downloader] Icon ${iconId} validation failed:`, error);
    return false;
  }
}