// Adapted from OpenReel Video (MIT License)

/**
 * Karaoke Renderer — renders word-by-word highlighted captions in the preview.
 *
 * Computes per-word animation state via getKaraokeSegments(), then renders
 * each word as a <span> with CSS transforms, opacity, and gradient fills.
 */

import { useMemo } from "react";
import type { SubtitleStyle } from "@/types/timeline";
import type { WordItem } from "@/types/word-timeline";
import { subtitleStyleToCSS } from "@/lib/captions/subtitle-style";
import { getKaraokeSegments } from "@/lib/captions/karaoke-utils";
import type { KaraokeMode } from "@/lib/captions/karaoke-types";

interface KaraokeRendererProps {
	/** Word items within the current caption segment */
	words: WordItem[];
	/** Current playback time in seconds */
	currentTime: number;
	/** Resolved subtitle style */
	style: SubtitleStyle;
}

export function KaraokeRenderer({
	words,
	currentTime,
	style,
}: KaraokeRendererProps) {
	const mode: KaraokeMode = style.karaokeMode ?? "none";
	const highlightColor = style.highlightColor ?? "#ffff00";
	const upcomingColor = style.upcomingColor ?? "rgba(255, 255, 255, 0.5)";

	const segments = useMemo(
		() =>
			getKaraokeSegments(
				words,
				currentTime,
				mode,
				highlightColor,
				upcomingColor
			),
		[words, currentTime, mode, highlightColor, upcomingColor]
	);

	if (segments.length === 0) return null;

	const baseCSS = subtitleStyleToCSS(style);

	return (
		<div
			style={{
				...baseCSS,
				display: "inline-flex",
				flexWrap: "wrap",
				gap: "4px",
			}}
		>
			{segments.map((seg, i) => {
				const isGradient = seg.color?.startsWith("linear-gradient");
				return (
					<span
						key={seg.wordId || i}
						style={{
							display: "inline-block",
							transform: `scale(${seg.scale}) translateY(${seg.offsetY}px)`,
							opacity: seg.opacity,
							transition: "transform 0.1s ease-out, opacity 0.1s ease-out",
							...(isGradient
								? {
										background: seg.color,
										WebkitBackgroundClip: "text",
										WebkitTextFillColor: "transparent",
									}
								: {
										color: seg.color ?? style.fontColor,
									}),
						}}
					>
						{seg.text}
					</span>
				);
			})}
		</div>
	);
}
