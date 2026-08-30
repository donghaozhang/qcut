type JsonRecord = Record<string, unknown>;

/** A manifest element together with the timeline span it will occupy. */
export interface LanedElement {
	element: JsonRecord;
	start: number;
	end: number;
}

/**
 * Partitions elements into non-overlapping lanes and emits one track per
 * lane. QCut tracks refuse overlapping elements, but overlapping compose
 * operations (layered sound effects, simultaneous stickers) are legitimate —
 * they belong on parallel tracks, the way an editor would lay them out.
 */
export function lanedComposeTracks({
	alias,
	type,
	name,
	entries,
}: {
	alias: string;
	type: string;
	name: string;
	entries: LanedElement[];
}): JsonRecord[] {
	const sorted = [...entries].sort(
		(left, right) => left.start - right.start || left.end - right.end
	);
	const lanes: Array<{ end: number; elements: JsonRecord[] }> = [];
	for (const entry of sorted) {
		const lane = lanes.find((candidate) => candidate.end <= entry.start);
		if (lane) {
			lane.end = entry.end;
			lane.elements.push(entry.element);
		} else {
			lanes.push({ end: entry.end, elements: [entry.element] });
		}
	}
	return lanes.map((lane, index) => ({
		alias: index === 0 ? alias : `${alias}-${index + 1}`,
		type,
		name: index === 0 ? name : `${name} ${index + 1}`,
		elements: lane.elements,
	}));
}
