interface VideoDisplaySideData {
	rotation?: unknown;
}

interface VideoDisplayTags {
	rotate?: unknown;
}

function finiteRotation({ value }: { value: unknown }) {
	if (typeof value !== "number" && typeof value !== "string") return null;
	const rotation = Number(value);
	return Number.isFinite(rotation) ? rotation : null;
}

function normalizedQuarterTurn({ rotation }: { rotation: number }) {
	const quarterTurns = Math.round(rotation / 90);
	if (Math.abs(rotation - quarterTurns * 90) > 0.01) return 0;
	return ((quarterTurns % 4) + 4) % 4;
}

export function resolveAutorotatedVideoDimensions({
	height,
	sideDataList,
	tags,
	width,
}: {
	height: number;
	sideDataList?: VideoDisplaySideData[];
	tags?: VideoDisplayTags;
	width: number;
}) {
	const displayMatrixRotation = sideDataList
		?.map(({ rotation }) => finiteRotation({ value: rotation }))
		.find((rotation) => rotation !== null);
	const tagRotation = finiteRotation({ value: tags?.rotate });
	const rotation = displayMatrixRotation ?? tagRotation ?? 0;
	const quarterTurn = normalizedQuarterTurn({ rotation });
	return quarterTurn % 2 === 1
		? { height: width, width: height }
		: { height, width };
}
