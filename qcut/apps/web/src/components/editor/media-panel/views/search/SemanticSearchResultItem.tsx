/**
 * SemanticSearchResultItem — single result in the semantic search panel.
 *
 * Shows thumbnail, media name, time range, and similarity score.
 *
 * @module components/editor/media-panel/views/search/SemanticSearchResultItem
 */

import type { VideoSearchResult } from "@/stores/video-search-store";

interface Props {
	result: VideoSearchResult;
	onClick: (startTime: number) => void;
}

function formatTime(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${m}:${s.toString().padStart(2, "0")}`;
}

function scoreColor(score: number): string {
	if (score >= 0.8) return "text-green-400";
	if (score >= 0.5) return "text-yellow-400";
	return "text-muted-foreground";
}

export function SemanticSearchResultItem({ result, onClick }: Props) {
	const scorePercent = Math.round(result.score * 100);

	return (
		<button
			type="button"
			onClick={() => onClick(result.startTime)}
			className="w-full flex items-start gap-2.5 px-3 py-2 hover:bg-foreground/5 transition-colors text-left border-b border-border/10"
			data-testid="semantic-search-result"
			aria-label={`${result.mediaName} at ${formatTime(result.startTime)}, ${scorePercent}% match`}
		>
			{/* Thumbnail */}
			<div className="w-16 h-9 bg-foreground/10 rounded overflow-hidden shrink-0">
				{result.thumbnailPath ? (
					<img
						src={`file://${result.thumbnailPath}`}
						alt=""
						className="w-full h-full object-cover"
						loading="lazy"
					/>
				) : (
					<div className="w-full h-full flex items-center justify-center text-[0.5rem] text-muted-foreground/50">
						No preview
					</div>
				)}
			</div>

			{/* Info */}
			<div className="flex-1 min-w-0">
				<div className="text-xs font-medium truncate">
					{result.mediaName}
				</div>
				<div className="flex items-center gap-2 mt-0.5">
					<span className="text-[0.6rem] text-muted-foreground">
						{formatTime(result.startTime)}–{formatTime(result.endTime)}
					</span>
					<span className={`text-[0.6rem] font-medium ${scoreColor(result.score)}`}>
						{scorePercent}%
					</span>
				</div>
			</div>
		</button>
	);
}
