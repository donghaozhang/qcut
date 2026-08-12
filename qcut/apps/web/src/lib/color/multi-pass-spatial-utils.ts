export type MultiPassEdgeMode = "clamp" | "repeat" | "mirror";

export function clampNumber({
	value,
	min,
	max,
}: {
	value: number;
	min: number;
	max: number;
}) {
	return Math.min(max, Math.max(min, value));
}

export function mixNumber({
	left,
	right,
	amount,
}: {
	left: number;
	right: number;
	amount: number;
}) {
	return left + (right - left) * amount;
}

export function resolveEdgeCoordinate({
	value,
	size,
	edgeMode,
}: {
	value: number;
	size: number;
	edgeMode: MultiPassEdgeMode;
}) {
	if (size <= 1) return 0;
	if (edgeMode === "repeat") {
		return ((value % size) + size) % size;
	}
	if (edgeMode === "mirror") {
		const period = (size - 1) * 2;
		const repeated = ((value % period) + period) % period;
		return repeated <= size - 1 ? repeated : period - repeated;
	}
	return clampNumber({ value, min: 0, max: size - 1 });
}

export function sampleRgbaChannel({
	data,
	width,
	height,
	x,
	y,
	channel,
	edgeMode = "clamp",
}: {
	data: Uint8ClampedArray;
	width: number;
	height: number;
	x: number;
	y: number;
	channel: number;
	edgeMode?: MultiPassEdgeMode;
}) {
	const x0 = Math.floor(x);
	const y0 = Math.floor(y);
	const x1 = x0 + 1;
	const y1 = y0 + 1;
	const fractionX = x - x0;
	const fractionY = y - y0;
	const valueAt = ({
		sampleX,
		sampleY,
	}: {
		sampleX: number;
		sampleY: number;
	}) => {
		const resolvedX = Math.round(
			resolveEdgeCoordinate({ value: sampleX, size: width, edgeMode })
		);
		const resolvedY = Math.round(
			resolveEdgeCoordinate({ value: sampleY, size: height, edgeMode })
		);
		return data[(resolvedY * width + resolvedX) * 4 + channel];
	};
	const top = mixNumber({
		left: valueAt({ sampleX: x0, sampleY: y0 }),
		right: valueAt({ sampleX: x1, sampleY: y0 }),
		amount: fractionX,
	});
	const bottom = mixNumber({
		left: valueAt({ sampleX: x0, sampleY: y1 }),
		right: valueAt({ sampleX: x1, sampleY: y1 }),
		amount: fractionX,
	});
	return mixNumber({ left: top, right: bottom, amount: fractionY });
}

export function resizeRgba({
	data,
	width,
	height,
	targetWidth,
	targetHeight,
	edgeMode = "clamp",
}: {
	data: Uint8ClampedArray;
	width: number;
	height: number;
	targetWidth: number;
	targetHeight: number;
	edgeMode?: MultiPassEdgeMode;
}) {
	if (width === targetWidth && height === targetHeight) return data;
	const output = new Uint8ClampedArray(targetWidth * targetHeight * 4);
	for (let y = 0; y < targetHeight; y += 1) {
		const sourceY = ((y + 0.5) * height) / targetHeight - 0.5;
		for (let x = 0; x < targetWidth; x += 1) {
			const sourceX = ((x + 0.5) * width) / targetWidth - 0.5;
			const destination = (y * targetWidth + x) * 4;
			for (let channel = 0; channel < 4; channel += 1) {
				output[destination + channel] = sampleRgbaChannel({
					data,
					width,
					height,
					x: sourceX,
					y: sourceY,
					channel,
					edgeMode,
				});
			}
		}
	}
	return output;
}

function blurHorizontal({
	data,
	width,
	height,
	radius,
	edgeMode,
}: {
	data: Uint8ClampedArray;
	width: number;
	height: number;
	radius: number;
	edgeMode: MultiPassEdgeMode;
}) {
	const result = new Uint8ClampedArray(data);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const destination = (y * width + x) * 4;
			for (let channel = 0; channel < 3; channel += 1) {
				let sum = 0;
				for (let offset = -radius; offset <= radius; offset += 1) {
					const sourceX = Math.round(
						resolveEdgeCoordinate({
							value: x + offset,
							size: width,
							edgeMode,
						})
					);
					sum += data[(y * width + sourceX) * 4 + channel];
				}
				result[destination + channel] = sum / (radius * 2 + 1);
			}
		}
	}
	return result;
}

export function boxBlurRgba({
	data,
	width,
	height,
	radius,
	edgeMode = "clamp",
}: {
	data: Uint8ClampedArray;
	width: number;
	height: number;
	radius: number;
	edgeMode?: MultiPassEdgeMode;
}) {
	if (radius <= 0 || width < 2 || height < 2) return data;
	const horizontal = blurHorizontal({ data, width, height, radius, edgeMode });
	const result = new Uint8ClampedArray(horizontal);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const destination = (y * width + x) * 4;
			for (let channel = 0; channel < 3; channel += 1) {
				let sum = 0;
				for (let offset = -radius; offset <= radius; offset += 1) {
					const sourceY = Math.round(
						resolveEdgeCoordinate({
							value: y + offset,
							size: height,
							edgeMode,
						})
					);
					sum += horizontal[(sourceY * width + x) * 4 + channel];
				}
				result[destination + channel] = sum / (radius * 2 + 1);
			}
		}
	}
	return result;
}
