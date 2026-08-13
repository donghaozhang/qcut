type RgbaColorChannel = "r" | "g" | "b";

function unpremultiplyExpression({ channel }: { channel: RgbaColorChannel }) {
	return `if(gt(alpha(X,Y),0),${channel}(X,Y)*255/alpha(X,Y)+0.5,0)`;
}

export function buildJianyingTextRawFrameFilter({
	opacity,
	rotationRadians,
	outputWidth,
	outputHeight,
}: {
	opacity: number;
	rotationRadians: number;
	outputWidth: number;
	outputHeight: number;
}) {
	const unpremultiply = (["r", "g", "b"] as const)
		.map((channel) => `${channel}='${unpremultiplyExpression({ channel })}'`)
		.concat("a='alpha(X,Y)'")
		.join(":");
	return [
		"format=rgba",
		`rotate=${rotationRadians}:c=none:ow=${outputWidth}:oh=${outputHeight}`,
		`geq=${unpremultiply}`,
		`colorchannelmixer=aa=${opacity}`,
		"format=rgba",
	].join(",");
}
