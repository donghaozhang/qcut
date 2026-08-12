import type {
	MediaColorSettings,
	MediaElement,
	TimelineTrack,
} from "@/types/timeline";

function requiresLocalColorRuntime({
	color,
}: {
	color?: MediaColorSettings;
}): boolean {
	if (!color?.enabled) return false;
	const multiPass = color.multiPass;
	if (
		multiPass?.enabled &&
		multiPass.fidelity === "native-local" &&
		multiPass.nativeEffect?.provider === "jianying-local-effect-v1"
	) {
		return true;
	}
	return Boolean(
		color.lut.enabled &&
			color.lut.dual?.maskKind === "skin-segmentation-v1" &&
			color.lut.dual.resourceId
	);
}

function mediaRequiresLocalColorRuntime({
	element,
}: {
	element: MediaElement;
}): boolean {
	if (requiresLocalColorRuntime({ color: element.color })) return true;
	return Boolean(
		element.compound?.clips.some((clip) =>
			mediaRequiresLocalColorRuntime({ element: clip.element })
		)
	);
}

export function requiresJianyingLocalColorExport({
	tracks,
}: {
	tracks: readonly TimelineTrack[];
}): boolean {
	for (const track of tracks) {
		for (const element of track.elements) {
			if (
				element.type === "media" &&
				mediaRequiresLocalColorRuntime({ element })
			) {
				return true;
			}
			if (
				element.type === "adjustment" &&
				requiresLocalColorRuntime({ color: element.color })
			) {
				return true;
			}
		}
	}
	return false;
}
