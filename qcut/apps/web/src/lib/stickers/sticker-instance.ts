import { generateUUID } from "@/lib/utils";
import type { CreateTimelineElement, TimelineElement } from "@/types/timeline";

type StickerIdentityElement = TimelineElement | CreateTimelineElement;

export function createStickerInstanceId(): string {
	return `sticker-${generateUUID()}`;
}

export function assignNewStickerInstanceId<
	TElement extends StickerIdentityElement,
>({
	element,
	newStickerId,
}: {
	element: TElement;
	newStickerId: string;
}): TElement {
	if (element.type !== "sticker") return element;

	return {
		...element,
		stickerId: newStickerId,
	} as TElement;
}
