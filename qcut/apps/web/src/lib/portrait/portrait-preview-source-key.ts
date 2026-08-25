export function portraitPreviewSourceKey({
	elementId,
	mediaId,
	sourceSessionId,
	sourceLocation,
	sourceSelector,
}: {
	elementId?: string;
	mediaId?: string;
	sourceSessionId?: string;
	sourceLocation: string;
	sourceSelector: string;
}) {
	const elementIdentity = elementId
		? `element=${elementId}`
		: `location=${sourceLocation}`;
	const sessionIdentity = sourceSessionId ? `session=${sourceSessionId}:` : "";
	return `preview:${sessionIdentity}${elementIdentity}:media=${mediaId ?? sourceSelector}`.slice(
		0,
		512
	);
}
