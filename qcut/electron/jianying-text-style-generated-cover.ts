import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
	readJianyingCachedImage,
	type JianyingCachedImage,
} from "./jianying-image-cache.js";
import type { JianyingTextStyleCatalogEntry } from "./jianying-text-style-lab-catalog.js";
import { renderJianyingText } from "./jianying-text-runtime/render.js";

const COVER_SIZE = 256;
const COVER_FRAME_COUNT = 3;
const COVER_FPS = 1;
const GENERATED_COVER_CACHE_VERSION = 3;
const MINIMUM_CONTENT_AREA_RATIO = 0.002;
const MINIMUM_CONTENT_BOUND_RATIO = 0.08;

let renderQueue: Promise<void> = Promise.resolve();

function queueRender<T>({ task }: { task: () => Promise<T> }) {
	const result = renderQueue.then(task, task);
	renderQueue = result.then(
		() => undefined,
		() => undefined
	);
	return result;
}

function middleFramePath({ pattern }: { pattern: string }) {
	if (!pattern.includes("%06d")) {
		throw new Error("剪映花字封面帧路径格式无效");
	}
	return pattern.replace("%06d", "000001");
}

async function hasUsefulCoverContent({ bytes }: { bytes: Buffer }) {
	const image = await loadImage(bytes);
	if (image.width <= 0 || image.height <= 0) return false;
	const canvas = createCanvas(image.width, image.height);
	const context = canvas.getContext("2d");
	context.drawImage(image, 0, 0);
	const pixels = context.getImageData(0, 0, image.width, image.height).data;
	let visiblePixels = 0;
	let minimumX = image.width;
	let minimumY = image.height;
	let maximumX = -1;
	let maximumY = -1;
	for (let y = 0; y < image.height; y += 1) {
		for (let x = 0; x < image.width; x += 1) {
			if (pixels[(y * image.width + x) * 4 + 3] < 16) continue;
			visiblePixels += 1;
			minimumX = Math.min(minimumX, x);
			minimumY = Math.min(minimumY, y);
			maximumX = Math.max(maximumX, x);
			maximumY = Math.max(maximumY, y);
		}
	}
	const minimumDimension = Math.min(image.width, image.height);
	const contentWidth = maximumX - minimumX + 1;
	const contentHeight = maximumY - minimumY + 1;
	return (
		visiblePixels >= image.width * image.height * MINIMUM_CONTENT_AREA_RATIO &&
		contentWidth >= minimumDimension * MINIMUM_CONTENT_BOUND_RATIO &&
		contentHeight >= minimumDimension * MINIMUM_CONTENT_BOUND_RATIO
	);
}

async function renderCover({
	entry,
	render,
}: {
	entry: JianyingTextStyleCatalogEntry;
	render: typeof renderJianyingText;
}) {
	if (!entry.runtimeReference) {
		throw new Error("该花字没有可生成封面的运行时引用");
	}
	const requestHash = createHash("sha256")
		.update(`cover\0${entry.styleId}`)
		.digest("hex")
		.slice(0, 16);
	const result = await render({
		request: {
			requestId: `text-style-cover-${requestHash}`,
			reference: entry.runtimeReference,
			content: "花字",
			fontSize: 48,
			canvasWidth: COVER_SIZE,
			canvasHeight: COVER_SIZE,
			transform: {
				x: 0,
				y: 0,
				width: COVER_SIZE,
				height: COVER_SIZE,
				rotation: 0,
				opacity: 1,
			},
			sourceStart: 0,
			elementDuration: COVER_FRAME_COUNT / COVER_FPS,
			frameCount: COVER_FRAME_COUNT,
			fps: COVER_FPS,
			previewVideo: false,
		},
	});
	if (result.source.kind !== "image-sequence") {
		throw new Error("剪映花字封面渲染没有返回图片序列");
	}
	const bytes = await readFile(
		middleFramePath({ pattern: result.source.path })
	);
	if (!(await hasUsefulCoverContent({ bytes }))) {
		throw new Error("剪映花字封面有效内容过小");
	}
	return bytes;
}

function renderFallbackCover({
	entry,
}: {
	entry: JianyingTextStyleCatalogEntry;
}) {
	const hue =
		Number.parseInt(
			createHash("sha256").update(entry.styleId).digest("hex").slice(0, 6),
			16
		) % 360;
	const canvas = createCanvas(COVER_SIZE, COVER_SIZE);
	const context = canvas.getContext("2d");
	context.clearRect(0, 0, COVER_SIZE, COVER_SIZE);
	context.font = "bold 72px sans-serif";
	context.textAlign = "center";
	context.textBaseline = "middle";
	context.lineJoin = "round";
	context.strokeStyle = "rgba(8, 10, 14, 0.96)";
	context.lineWidth = 15;
	context.shadowColor = `hsla(${hue}, 95%, 62%, 0.9)`;
	context.shadowBlur = 20;
	context.strokeText("花字", COVER_SIZE / 2, COVER_SIZE / 2);
	const gradient = context.createLinearGradient(56, 72, 200, 184);
	gradient.addColorStop(0, `hsl(${hue}, 96%, 76%)`);
	gradient.addColorStop(1, `hsl(${(hue + 48) % 360}, 92%, 54%)`);
	context.fillStyle = gradient;
	context.fillText("花字", COVER_SIZE / 2, COVER_SIZE / 2);
	return canvas.toBuffer("image/png");
}

async function generateCover({
	entry,
	render,
}: {
	entry: JianyingTextStyleCatalogEntry;
	render: typeof renderJianyingText;
}) {
	try {
		return await renderCover({ entry, render });
	} catch {
		return renderFallbackCover({ entry });
	}
}

export function readJianyingTextStyleGeneratedCover({
	cacheRoot,
	entry,
	render = renderJianyingText,
}: {
	cacheRoot: string;
	entry: JianyingTextStyleCatalogEntry;
	render?: typeof renderJianyingText;
}): Promise<JianyingCachedImage> {
	return readJianyingCachedImage({
		cacheRoot: path.join(cacheRoot, "generated"),
		label: "剪映花字生成封面",
		maximumBytes: 4 * 1024 * 1024,
		source: {
			cacheKey: `v${GENERATED_COVER_CACHE_VERSION}:${entry.styleId}`,
			produce: () =>
				queueRender({ task: () => generateCover({ entry, render }) }),
		},
	});
}
