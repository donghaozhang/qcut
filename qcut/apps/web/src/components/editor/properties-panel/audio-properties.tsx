import { MediaElement } from "@/types/timeline";
import {
	PropertyGroup,
	PropertyItem,
	PropertyItemLabel,
	PropertyItemValue,
} from "./property-item";
import { VolumeControl } from "./volume-control";
import { BeatDetectionPanel } from "./beat-detection-panel";
import { useMediaStore } from "@/stores/media/media-store";

export function AudioProperties({
	element,
	trackId,
}: {
	element: MediaElement;
	trackId: string;
}) {
	const mediaItem = useMediaStore((s) =>
		s.mediaItems.find((m) => m.id === element.mediaId),
	);

	return (
		<div className="space-y-4 p-5">
			<VolumeControl element={element} trackId={trackId} />

			<BeatDetectionPanel
				elementId={element.id}
				trackId={trackId}
				audioUrl={mediaItem?.url}
			/>

			<PropertyGroup title="Audio Info" defaultExpanded={false}>
				<PropertyItem direction="column">
					<PropertyItemLabel>Element Name</PropertyItemLabel>
					<PropertyItemValue>
						<span className="text-xs">{element.name}</span>
					</PropertyItemValue>
				</PropertyItem>
				<PropertyItem direction="column">
					<PropertyItemLabel>Duration</PropertyItemLabel>
					<PropertyItemValue>
						<span className="text-xs">
							{(element.duration / 1000).toFixed(2)}s
						</span>
					</PropertyItemValue>
				</PropertyItem>
			</PropertyGroup>
		</div>
	);
}
