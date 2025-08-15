import React from "react";
import { cn } from "@/lib/utils";
import type { TranscriptionSegment } from "@/types/captions";

interface CaptionsDisplayProps {
  segments: TranscriptionSegment[];
  currentTime: number;
  isVisible?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

interface CaptionStyle {
  fontSize: string;
  fontFamily: string;
  color: string;
  backgroundColor: string;
  textAlign: "left" | "center" | "right";
  padding: string;
  borderRadius: string;
  margin: string;
  lineHeight: string;
  fontWeight: string;
  textShadow: string;
  maxWidth: string;
}

const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  fontSize: "18px",
  fontFamily: "Arial, sans-serif",
  color: "#ffffff",
  backgroundColor: "rgba(0, 0, 0, 0.8)",
  textAlign: "center",
  padding: "8px 16px",
  borderRadius: "4px",
  margin: "0 auto 20px auto",
  lineHeight: "1.4",
  fontWeight: "500",
  textShadow: "1px 1px 2px rgba(0, 0, 0, 0.8)",
  maxWidth: "80%",
};

export function CaptionsDisplay({
  segments,
  currentTime,
  isVisible = true,
  className,
  style,
}: CaptionsDisplayProps) {
  if (!isVisible || !segments.length) {
    return null;
  }

  // Find the active caption segment based on current time
  const activeSegment = segments.find(
    segment => currentTime >= segment.start && currentTime <= segment.end
  );

  if (!activeSegment) {
    return null;
  }

  return (
    <div
      className={cn(
        "absolute bottom-0 left-0 right-0 z-10 pointer-events-none",
        className
      )}
      style={{
        ...style,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-end",
        padding: "20px",
      }}
    >
      <div
        style={{
          ...DEFAULT_CAPTION_STYLE,
          wordWrap: "break-word",
          overflowWrap: "break-word",
          hyphens: "auto",
        }}
      >
        {activeSegment.text}
      </div>
    </div>
  );
}

export default CaptionsDisplay;