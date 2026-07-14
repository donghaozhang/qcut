const TIMELINE_ENTITY_SELECTOR =
	".timeline-element, [data-gap-indicator], [data-transition-marker]";

export function isTimelineEntityTarget({
	target,
}: {
	target: HTMLElement;
}): boolean {
	return target.closest(TIMELINE_ENTITY_SELECTOR) !== null;
}
