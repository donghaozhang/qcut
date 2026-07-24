import {
	Video,
	TypeIcon,
	Music,
	Sticker,
	FileText,
	Captions,
	SlidersHorizontal,
	Sparkles,
	CodeXml,
} from "lucide-react";
import type { TrackType } from "@/types/timeline";

interface TrackIconProps {
	type: TrackType;
}

export function TrackIcon({ type }: TrackIconProps) {
	switch (type) {
		case "effect":
			return <Sparkles className="w-4 h-4 shrink-0 text-muted-foreground" />;
		case "text":
			return <TypeIcon className="w-4 h-4 shrink-0 text-muted-foreground" />;
		case "audio":
			return <Music className="w-4 h-4 shrink-0 text-muted-foreground" />;
		case "sticker":
			return <Sticker className="w-4 h-4 shrink-0 text-muted-foreground" />;
		case "captions":
			return <Captions className="w-4 h-4 shrink-0 text-muted-foreground" />;
		case "adjustment":
			return (
				<SlidersHorizontal className="w-4 h-4 shrink-0 text-muted-foreground" />
			);
		case "markdown":
			return <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />;
		case "hyperframes":
			return <CodeXml className="w-4 h-4 shrink-0 text-emerald-400" />;
		default:
			return <Video className="w-4 h-4 shrink-0 text-muted-foreground" />;
	}
}
