"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { buildIconSvgUrl } from "@/lib/iconify-api";
import { cn } from "@/lib/utils";
import type { StickerItemProps } from "../types/stickers.types";

// Debug utility for conditional logging
const debugLog = (message: string, ...args: any[]) => {
  if (import.meta.env.DEV) {
    console.log(message, ...args);
  }
};

export function StickerItem({
  icon,
  name,
  collection,
  onSelect,
  isSelected,
}: StickerItemProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [imageUrl, setImageUrl] = useState<string>("");

  useEffect(() => {
    // Reset state for new icon
    setIsLoading(true);
    setHasError(false);

    try {
      const svgUrl = buildIconSvgUrl(collection, icon, {
        // Remove color to keep transparency
        width: 32,
        height: 32,
      });
      setImageUrl(svgUrl);
    } catch (error) {
      debugLog(`[StickerItem] Failed to build SVG URL for ${collection}:${icon}:`, error);
      setHasError(true);
      setIsLoading(false);
    }
  }, [icon, collection]);

  const handleClick = () => {
    const iconId = `${collection}:${icon}`;
    onSelect(iconId, name || icon);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative flex h-16 w-16 flex-col items-center justify-center rounded-lg border-2 border-border bg-background transition-all hover:border-primary hover:bg-accent",
            isSelected && "border-primary bg-accent"
          )}
          onClick={handleClick}
          disabled={hasError || !imageUrl}
        >
          {isLoading && (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          )}
          {hasError && !isLoading && (
            <AlertCircle className="h-6 w-6 text-destructive" />
          )}
          {imageUrl && (
            <img
              src={imageUrl}
              alt={name || icon}
              className={cn(
                "h-8 w-8 object-contain",
                (isLoading || hasError) && "hidden"
              )}
              onLoad={() => setIsLoading(false)}
              onError={() => {
                setHasError(true);
                setIsLoading(false);
              }}
            />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="text-sm font-medium">
          {name || icon} ({collection})
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
