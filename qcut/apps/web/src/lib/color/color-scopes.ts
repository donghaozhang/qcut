export type ColorScopeMode =
	| "histogram"
	| "waveform"
	| "vectorscope"
	| "parade";

function setupCanvas({
	canvas,
	width,
	height,
}: {
	canvas: HTMLCanvasElement;
	width: number;
	height: number;
}): CanvasRenderingContext2D {
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Unable to create scope canvas");
	context.fillStyle = "#090909";
	context.fillRect(0, 0, width, height);
	context.strokeStyle = "rgba(255,255,255,0.10)";
	context.lineWidth = 1;
	for (let index = 1; index < 4; index += 1) {
		const y = (height * index) / 4;
		context.beginPath();
		context.moveTo(0, y);
		context.lineTo(width, y);
		context.stroke();
	}
	return context;
}

function drawHistogram({
	canvas,
	imageData,
}: {
	canvas: HTMLCanvasElement;
	imageData: ImageData;
}) {
	const context = setupCanvas({ canvas, width: 360, height: 210 });
	const channels = [
		new Uint32Array(256),
		new Uint32Array(256),
		new Uint32Array(256),
	];
	let maximum = 1;
	for (let index = 0; index < imageData.data.length; index += 16) {
		for (let channel = 0; channel < 3; channel += 1) {
			const value = imageData.data[index + channel];
			channels[channel][value] += 1;
			maximum = Math.max(maximum, channels[channel][value]);
		}
	}
	for (const [channel, color] of [
		[channels[0], "rgba(255,70,70,0.85)"],
		[channels[1], "rgba(70,255,120,0.75)"],
		[channels[2], "rgba(70,130,255,0.85)"],
	] as const) {
		context.beginPath();
		for (let index = 0; index < 256; index += 1) {
			const x = (index / 255) * canvas.width;
			const y =
				canvas.height -
				(Math.log1p(channel[index]) / Math.log1p(maximum)) * canvas.height;
			if (index === 0) context.moveTo(x, y);
			else context.lineTo(x, y);
		}
		context.strokeStyle = color;
		context.lineWidth = 1.5;
		context.stroke();
	}
}

function drawWaveform({
	canvas,
	imageData,
}: {
	canvas: HTMLCanvasElement;
	imageData: ImageData;
}) {
	const context = setupCanvas({ canvas, width: 360, height: 210 });
	context.fillStyle = "rgba(135,255,190,0.10)";
	const xStep = Math.max(1, Math.floor(imageData.width / canvas.width));
	const yStep = Math.max(1, Math.floor(imageData.height / 96));
	for (let sourceX = 0; sourceX < imageData.width; sourceX += xStep) {
		const x = (sourceX / imageData.width) * canvas.width;
		for (let sourceY = 0; sourceY < imageData.height; sourceY += yStep) {
			const index = (sourceY * imageData.width + sourceX) * 4;
			const luma =
				(imageData.data[index] * 0.2126 +
					imageData.data[index + 1] * 0.7152 +
					imageData.data[index + 2] * 0.0722) /
				255;
			context.fillRect(x, (1 - luma) * canvas.height, 1.5, 1.5);
		}
	}
}

function drawVectorscope({
	canvas,
	imageData,
}: {
	canvas: HTMLCanvasElement;
	imageData: ImageData;
}) {
	const context = setupCanvas({ canvas, width: 360, height: 210 });
	const centerX = canvas.width / 2;
	const centerY = canvas.height / 2;
	const radius = Math.min(canvas.width, canvas.height) * 0.43;
	context.strokeStyle = "rgba(255,255,255,0.24)";
	context.beginPath();
	context.arc(centerX, centerY, radius, 0, Math.PI * 2);
	context.stroke();
	for (let index = 0; index < imageData.data.length; index += 32) {
		const red = imageData.data[index] / 255;
		const green = imageData.data[index + 1] / 255;
		const blue = imageData.data[index + 2] / 255;
		const cb = (blue - (red * 0.2126 + green * 0.7152 + blue * 0.0722)) * 0.565;
		const cr = (red - (red * 0.2126 + green * 0.7152 + blue * 0.0722)) * 0.713;
		context.fillStyle = `rgba(${imageData.data[index]},${imageData.data[index + 1]},${imageData.data[index + 2]},0.16)`;
		context.fillRect(
			centerX + cb * radius * 2,
			centerY - cr * radius * 2,
			1.5,
			1.5
		);
	}
}

function drawParade({
	canvas,
	imageData,
}: {
	canvas: HTMLCanvasElement;
	imageData: ImageData;
}) {
	const context = setupCanvas({ canvas, width: 360, height: 210 });
	const sectionWidth = canvas.width / 3;
	const colors = [
		"rgba(255,70,70,0.12)",
		"rgba(70,255,120,0.12)",
		"rgba(70,130,255,0.12)",
	];
	const xStep = Math.max(1, Math.floor(imageData.width / sectionWidth));
	const yStep = Math.max(1, Math.floor(imageData.height / 80));
	for (let channel = 0; channel < 3; channel += 1) {
		context.fillStyle = colors[channel];
		for (let sourceX = 0; sourceX < imageData.width; sourceX += xStep) {
			const x =
				channel * sectionWidth + (sourceX / imageData.width) * sectionWidth;
			for (let sourceY = 0; sourceY < imageData.height; sourceY += yStep) {
				const index = (sourceY * imageData.width + sourceX) * 4;
				const value = imageData.data[index + channel] / 255;
				context.fillRect(x, (1 - value) * canvas.height, 1.5, 1.5);
			}
		}
	}
}

export function drawColorScope({
	canvas,
	imageData,
	mode,
}: {
	canvas: HTMLCanvasElement;
	imageData: ImageData;
	mode: ColorScopeMode;
}) {
	if (mode === "histogram") drawHistogram({ canvas, imageData });
	if (mode === "waveform") drawWaveform({ canvas, imageData });
	if (mode === "vectorscope") drawVectorscope({ canvas, imageData });
	if (mode === "parade") drawParade({ canvas, imageData });
}
