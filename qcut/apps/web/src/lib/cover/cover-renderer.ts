import {
	assertCoverCanvas,
	assertCoverDesign,
	COVER_MAX_BYTES,
	type CoverDesignV1,
	type CoverAssetRefV1,
} from "@qcut/editor-core/cover";
import { paintCoverText } from "./cover-text-renderer";

export function encodeCoverCanvas({
	canvas,
	mimeType,
}: {
	canvas: HTMLCanvasElement;
	mimeType: "image/png" | "image/webp";
}): Promise<Blob> {
	return new Promise((resolve, reject) =>
		canvas.toBlob(
			(blob) => {
				if (!blob || blob.type !== mimeType) {
					reject(new Error(`Unable to encode ${mimeType}`));
					return;
				}
				resolve(blob);
			},
			mimeType,
			0.9
		)
	);
}

function createCanvas({ width, height }: { width: number; height: number }) {
	assertCoverCanvas({ width, height });
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Unable to create cover canvas");
	return { canvas, ctx };
}

export function getCoverImageRect({
	source,
	target,
	fit,
	position = { x: 0.5, y: 0.5, zoom: 1 },
}: {
	source: { width: number; height: number };
	target: { width: number; height: number };
	fit: "cover" | "contain";
	position?: { x: number; y: number; zoom: number };
}) {
	assertCoverCanvas(source);
	assertCoverCanvas(target);
	const scale =
		fit === "contain"
			? Math.min(target.width / source.width, target.height / source.height)
			: Math.max(target.width / source.width, target.height / source.height);
	const width = source.width * scale * position.zoom;
	const height = source.height * scale * position.zoom;
	return {
		x: (target.width - width) * position.x,
		y: (target.height - height) * position.y,
		width,
		height,
	};
}

export async function normalizeCoverImage({
	blob,
}: {
	blob: Blob;
}): Promise<{ blob: Blob; width: number; height: number }> {
	if (
		!["image/png", "image/jpeg", "image/webp"].includes(blob.type) ||
		blob.size > COVER_MAX_BYTES ||
		blob.size === 0
	)
		throw new Error("Choose a PNG, JPEG or WebP image up to 32 MB");
	const image = await createImageBitmap(blob);
	try {
		const { canvas, ctx } = createCanvas(image);
		ctx.drawImage(image, 0, 0);
		return {
			blob: await encodeCoverCanvas({ canvas, mimeType: "image/png" }),
			width: image.width,
			height: image.height,
		};
	} finally {
		image.close();
	}
}

export async function paintCoverDesign({
	design,
	resolveAsset,
	maxWidth,
}: {
	design: CoverDesignV1;
	resolveAsset: (options: { asset: CoverAssetRefV1 }) => Promise<Blob>;
	maxWidth?: number;
}): Promise<HTMLCanvasElement> {
	assertCoverDesign({ design });
	const scale = maxWidth
		? Math.min(
				1,
				maxWidth / design.canvas.width,
				maxWidth / design.canvas.height
			)
		: 1;
	const { canvas, ctx } = createCanvas({
		width: Math.max(2, Math.round(design.canvas.width * scale)),
		height: Math.max(2, Math.round(design.canvas.height * scale)),
	});
	ctx.scale(
		canvas.width / design.canvas.width,
		canvas.height / design.canvas.height
	);
	ctx.fillStyle = design.canvas.backgroundColor;
	ctx.fillRect(0, 0, design.canvas.width, design.canvas.height);
	const layer = design.layers[0];
	const image = await createImageBitmap(
		await resolveAsset({ asset: layer.asset })
	);
	try {
		if (
			image.width !== layer.asset.width ||
			image.height !== layer.asset.height
		)
			throw new Error("Cover image dimensions do not match metadata");
		const rect = getCoverImageRect({
			source: image,
			target: design.canvas,
			fit: layer.fit,
			position: layer.position,
		});
		ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
	} finally {
		image.close();
	}
	await document.fonts?.ready;
	for (const text of design.layers.slice(1)) {
		if (text.kind === "text")
			paintCoverText({ ctx, canvas: design.canvas, layer: text });
	}
	return canvas;
}

export async function renderCoverDesign({
	design,
	resolveAsset,
}: {
	design: CoverDesignV1;
	resolveAsset: (options: { asset: CoverAssetRefV1 }) => Promise<Blob>;
}): Promise<{ render: Blob; thumbnail: Blob }> {
	const canvas = await paintCoverDesign({ design, resolveAsset });
	const preview = createCanvas({ width: 640, height: 360 });
	preview.ctx.fillStyle = design.canvas.backgroundColor;
	preview.ctx.fillRect(0, 0, 640, 360);
	const rect = getCoverImageRect({
		source: canvas,
		target: preview.canvas,
		fit: "contain",
	});
	preview.ctx.drawImage(canvas, rect.x, rect.y, rect.width, rect.height);
	const [render, thumbnail] = await Promise.all([
		encodeCoverCanvas({ canvas, mimeType: "image/png" }),
		encodeCoverCanvas({ canvas: preview.canvas, mimeType: "image/webp" }),
	]);
	return { render, thumbnail };
}
