import React from "react";
import { cn } from "@/lib/utils";
import type { TranscriptionSegment } from "@/types/captions";
import type { SubtitleStyle } from "@/types/timeline";
import {
	resolveSubtitleStyle,
	subtitleStyleToCSS,
} from "@/lib/captions/subtitle-style";

interface CaptionsDisplayProps {
	segments: TranscriptionSegment[];
	currentTime: number;
	isVisible?: boolean;
	className?: string;
	style?: React.CSSProperties;
	subtitleStyle?: Partial<SubtitleStyle>;
}

export function CaptionsDisplay({
	segments,
	currentTime,
	isVisible = true,
	className,
	style,
	subtitleStyle,
}: CaptionsDisplayProps) {
	if (!isVisible || !segments.length) {
		return null;
	}

	// Find the active caption segment based on current time
	const activeSegment = segments.find(
		(segment) => currentTime >= segment.start && currentTime <= segment.end
	);

	if (!activeSegment) {
		return null;
	}

	const resolved = resolveSubtitleStyle(subtitleStyle);
	const captionCSS = subtitleStyleToCSS(resolved);

	const alignMap: Record<SubtitleStyle["position"]["align"], string> = {
		top: "flex-start",
		center: "center",
		bottom: "flex-end",
	};

	return (
		<div
			className={cn(
				"absolute bottom-0 left-0 right-0 top-0 z-10 pointer-events-none",
				className
			)}
			style={{
				...style,
				display: "flex",
				justifyContent: "center",
				alignItems: alignMap[resolved.position.align],
				padding: "20px",
			}}
		>
			<div
				style={{
					...captionCSS,
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
