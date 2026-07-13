import { useMemo, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { TranscriptionSegment } from "@/types/captions";
import type { SubtitleStyle } from "@/types/timeline";
import type { WordItem } from "@/types/word-timeline";
import {
	getCaptionAnimationState,
	resolveSubtitleStyle,
	subtitleStyleToCSS,
} from "@/lib/captions/subtitle-style";
import { KaraokeRenderer } from "@/components/editor/preview-panel/karaoke-renderer";

interface CaptionsDisplayProps {
	segments: TranscriptionSegment[];
	currentTime: number;
	isVisible?: boolean;
	className?: string;
	style?: CSSProperties;
	subtitleStyle?: Partial<SubtitleStyle>;
	/** Word-level timing data for karaoke rendering */
	words?: WordItem[];
	canvasScale?: number;
}

/** Renders active caption text with optional karaoke word highlighting. */
export function CaptionsDisplay({
	segments,
	currentTime,
	isVisible = true,
	className,
	style,
	subtitleStyle,
	words,
	canvasScale = 1,
}: CaptionsDisplayProps) {
	const resolved = resolveSubtitleStyle(subtitleStyle);
	const captionCSS = subtitleStyleToCSS({ style: resolved, canvasScale });
	const karaokeMode = resolved.karaokeMode ?? "none";

	// Find the active caption segment based on current time
	const activeSegment = segments.find(
		(segment) => currentTime >= segment.start && currentTime <= segment.end
	);

	// Filter words within the active segment's time range for karaoke
	// Must be called unconditionally (React hooks rule)
	const segmentWords = useMemo(() => {
		if (
			karaokeMode === "none" ||
			!words ||
			words.length === 0 ||
			!activeSegment
		)
			return [];
		return words.filter(
			(w) =>
				w.type === "word" &&
				w.start >= activeSegment.start - 0.05 &&
				w.end <= activeSegment.end + 0.05
		);
	}, [karaokeMode, words, activeSegment]);

	if (!isVisible || !segments.length || !activeSegment) {
		return null;
	}

	const alignMap: Record<SubtitleStyle["position"]["align"], string> = {
		top: "flex-start",
		center: "center",
		bottom: "flex-end",
	};

	const useKaraoke = karaokeMode !== "none" && segmentWords.length > 0;
	const animation = getCaptionAnimationState({
		style: resolved,
		startTime: activeSegment.start,
		currentTime,
	});
	const horizontalAlignMap: Record<SubtitleStyle["textAlign"], string> = {
		left: "flex-start",
		center: "center",
		right: "flex-end",
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
				justifyContent: horizontalAlignMap[resolved.textAlign],
				alignItems: alignMap[resolved.position.align],
				padding: `${20 * canvasScale}px`,
			}}
		>
			<div
				data-testid="caption-layout"
				style={{
					display: "flex",
					justifyContent: horizontalAlignMap[resolved.textAlign],
					width: "100%",
					opacity: animation.opacity,
					transform: `translate(${animation.offsetX * canvasScale}px, ${animation.offsetY * canvasScale}px)`,
				}}
			>
				{useKaraoke ? (
					<KaraokeRenderer
						words={segmentWords}
						currentTime={currentTime}
						style={resolved}
						canvasScale={canvasScale}
					/>
				) : (
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
				)}
			</div>
		</div>
	);
}

export default CaptionsDisplay;
