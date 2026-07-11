import { MediaElement } from "@/types/timeline";
import {
	PropertyGroup,
	PropertyItem,
	PropertyItemLabel,
	PropertyItemValue,
} from "./property-item";
import { AudioPropertiesPanel } from "./audio-properties-panel";
import { getMediaTimelineDuration } from "@/lib/video/video-timing";

export function AudioProperties({
	element,
	trackId,
}: {
	element: MediaElement;
	trackId: string;
}) {
	return (
		<div className="space-y-3">
			<AudioPropertiesPanel element={element} trackId={trackId} />

			<div className="px-3 pb-3">
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
								{getMediaTimelineDuration(element).toFixed(2)}s
							</span>
						</PropertyItemValue>
					</PropertyItem>
				</PropertyGroup>
			</div>
		</div>
	);
}
