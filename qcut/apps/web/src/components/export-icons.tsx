import React from "react";
import {
  Youtube,
  Instagram,
  Music2,
  Twitter,
  Linkedin,
  Globe,
  Star,
  LucideIcon,
} from "lucide-react";

// Platform icon mapping
export const PlatformIcons: Record<string, LucideIcon> = {
  "youtube-hd": Youtube,
  "instagram-story": Instagram,
  "instagram-post": Instagram,
  "tiktok": Music2,
  "twitter": Twitter,
  "linkedin": Linkedin,
  "web-optimized": Globe,
  "high-quality": Star,
};

// Get icon component by preset ID
export function getPlatformIcon(presetId: string): LucideIcon {
  return PlatformIcons[presetId] || Star;
}

// Icon component with consistent styling
interface PlatformIconProps {
  presetId: string;
  className?: string;
}

export function PlatformIcon({
  presetId,
  className = "size-4",
}: PlatformIconProps) {
  const Icon = getPlatformIcon(presetId);
  return <Icon className={className} />;
}
