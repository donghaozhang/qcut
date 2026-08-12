function nextToken({ bytes, offset }: { bytes: Uint8Array; offset: number }) {
	let cursor = offset;
	while (cursor < bytes.length) {
		const value = bytes[cursor];
		if (value === 35) {
			while (cursor < bytes.length && bytes[cursor] !== 10) cursor += 1;
			continue;
		}
		if (value > 32) break;
		cursor += 1;
	}
	const start = cursor;
	while (cursor < bytes.length && bytes[cursor] > 32) cursor += 1;
	if (cursor === start) throw new Error("Portable image header is truncated");
	return {
		token: Buffer.from(bytes.subarray(start, cursor)).toString("ascii"),
		offset: cursor,
	};
}

function portableImage({
	bytes,
	magic,
	channels,
}: {
	bytes: Uint8Array;
	magic: "P5" | "P6";
	channels: 1 | 3;
}) {
	const magicToken = nextToken({ bytes, offset: 0 });
	const widthToken = nextToken({ bytes, offset: magicToken.offset });
	const heightToken = nextToken({ bytes, offset: widthToken.offset });
	const maximumToken = nextToken({ bytes, offset: heightToken.offset });
	const width = Number(widthToken.token);
	const height = Number(heightToken.token);
	if (
		magicToken.token !== magic ||
		!Number.isSafeInteger(width) ||
		!Number.isSafeInteger(height) ||
		width <= 0 ||
		height <= 0 ||
		maximumToken.token !== "255"
	) {
		throw new Error(`Invalid ${magic} portable image`);
	}
	let payloadOffset = maximumToken.offset;
	if (bytes[payloadOffset] === 13 && bytes[payloadOffset + 1] === 10) {
		payloadOffset += 2;
	} else if (bytes[payloadOffset] <= 32) {
		payloadOffset += 1;
	} else {
		throw new Error(`${magic} header has no payload separator`);
	}
	const expectedBytes = width * height * channels;
	const pixels = bytes.subarray(payloadOffset);
	if (pixels.length !== expectedBytes) {
		throw new Error(`${magic} pixel payload has the wrong size`);
	}
	return { width, height, pixels: new Uint8Array(pixels) };
}

export function encodePpm({
	rgba,
	width,
	height,
}: {
	rgba: Uint8Array;
	width: number;
	height: number;
}) {
	if (rgba.length !== width * height * 4) {
		throw new Error("RGBA frame has the wrong size");
	}
	const header = Buffer.from(`P6\n${width} ${height}\n255\n`, "ascii");
	const rgb = Buffer.allocUnsafe(width * height * 3);
	let destination = 0;
	for (let source = 0; source < rgba.length; source += 4) {
		rgb[destination] = rgba[source];
		rgb[destination + 1] = rgba[source + 1];
		rgb[destination + 2] = rgba[source + 2];
		destination += 3;
	}
	return Buffer.concat([header, rgb]);
}

export function decodePpm({ bytes }: { bytes: Uint8Array }) {
	const image = portableImage({ bytes, magic: "P6", channels: 3 });
	const rgba = new Uint8Array(image.width * image.height * 4);
	let destination = 0;
	for (let source = 0; source < image.pixels.length; source += 3) {
		rgba[destination] = image.pixels[source];
		rgba[destination + 1] = image.pixels[source + 1];
		rgba[destination + 2] = image.pixels[source + 2];
		rgba[destination + 3] = 255;
		destination += 4;
	}
	return { width: image.width, height: image.height, rgba };
}

export function decodePgm({ bytes }: { bytes: Uint8Array }) {
	const image = portableImage({ bytes, magic: "P5", channels: 1 });
	return { width: image.width, height: image.height, bytes: image.pixels };
}
