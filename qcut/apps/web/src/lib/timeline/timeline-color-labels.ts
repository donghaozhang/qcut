export const TIMELINE_COLOR_LABELS = [
	{ value: "violet", color: "#8b5cf6" },
	{ value: "blue", color: "#3b82f6" },
	{ value: "green", color: "#22c55e" },
	{ value: "yellow", color: "#eab308" },
	{ value: "red", color: "#ef4444" },
	{ value: "rose", color: "#f43f5e" },
	{ value: "orange", color: "#f97316" },
	{ value: "mango", color: "#fb923c" },
] as const;

export type TimelineColorLabel =
	(typeof TIMELINE_COLOR_LABELS)[number]["value"];

export function resolveTimelineColorLabel({
	value,
}: {
	value: unknown;
}): TimelineColorLabel | undefined {
	if (typeof value !== "string") return undefined;
	return TIMELINE_COLOR_LABELS.find((label) => label.value === value)?.value;
}

export function parseTimelineColorLabel({
	value,
}: {
	value: unknown;
}): TimelineColorLabel | undefined {
	if (value === undefined || value === null || value === "") return undefined;
	const colorLabel = resolveTimelineColorLabel({ value });
	if (colorLabel) return colorLabel;

	throw new Error(
		`colorLabel must be one of: ${TIMELINE_COLOR_LABELS.map((label) => label.value).join(", ")}`
	);
}

export function getTimelineColorLabelColor({
	colorLabel,
}: {
	colorLabel?: TimelineColorLabel;
}): string | undefined {
	return TIMELINE_COLOR_LABELS.find((label) => label.value === colorLabel)
		?.color;
}
