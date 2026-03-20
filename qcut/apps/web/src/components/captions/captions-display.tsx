import { useMemo, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { TranscriptionSegment } from "@/types/captions";
import type { SubtitleStyle } from "@/types/timeline";
import type { WordItem } from "@/types/word-timeline";
import {
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
}

export function CaptionsDisplay({
	segments,
	currentTime,
	isVisible = true,
	className,
	style,
	subtitleStyle,
	words,
}: CaptionsDisplayProps) {
	const resolved = resolveSubtitleStyle(subtitleStyle);
	const captionCSS = subtitleStyleToCSS(resolved);
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
			{useKaraoke ? (
				<KaraokeRenderer
					words={segmentWords}
					currentTime={currentTime}
					style={resolved}
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
	);
}

export default CaptionsDisplay;
