import { assertCoverTextStyle, type CoverTextStyleV1 } from "./text-style.js";

export interface CoverAssetRefV1 {
	assetId: string;
	relativePath: string;
	sha256: string;
	mimeType: "image/png" | "image/webp";
	width: number;
	height: number;
	byteLength: number;
}

export type CoverSourceV1 =
	| {
			kind: "timeline-frame";
			sceneId: string;
			frame: number;
			fps: number;
			timeSeconds: number;
	  }
	| { kind: "local-image"; originalName: string };

export interface CoverImageLayerV1 {
	id: string;
	kind: "image";
	asset: CoverAssetRefV1;
	fit: "contain" | "cover";
	position?: { x: number; y: number; zoom: number };
}

export interface CoverTextLayerV1 {
	id: string;
	kind: "text";
	content: string;
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number;
	fontSize: number;
	fontFamily: "sans-serif" | "serif" | "monospace";
	color: string;
	bold: boolean;
	italic: boolean;
	underline: boolean;
	align: "left" | "center" | "right";
	stroke: boolean;
	shadow: boolean;
	background: boolean;
	textStyle?: Partial<CoverTextStyleV1>;
	templateId?: string;
}

export interface CoverDesignV1 {
	schema: "qcut.cover-design";
	schemaVersion: 1;
	id: string;
	revision: number;
	canvas: { width: number; height: number; backgroundColor: string };
	source: CoverSourceV1;
	layers: [CoverImageLayerV1, ...CoverTextLayerV1[]];
	templateId?: string;
	createdAt: string;
	updatedAt: string;
}

export interface ProjectCoverBindingV1 {
	schemaVersion: 1;
	designId: string;
	designRevision: number;
	designPath: string;
	render: CoverAssetRefV1;
	thumbnail: CoverAssetRefV1;
	source: CoverSourceV1;
	canvas: { width: number; height: number };
	updatedAt: string;
}

export const COVER_MAX_PIXELS = 33_554_432;
export const COVER_MAX_BYTES = 32 * 1024 * 1024;

export function assertCoverCanvas({
	width,
	height,
}: {
	width: number;
	height: number;
}): void {
	if (
		!Number.isSafeInteger(width) ||
		!Number.isSafeInteger(height) ||
		width < 2 ||
		height < 2 ||
		width > 8192 ||
		height > 8192 ||
		width * height > COVER_MAX_PIXELS
	) {
		throw new Error(
			"Invalid cover dimensions (maximum 8192 per side, 32 megapixels)"
		);
	}
}

export function assertCoverPath({
	relativePath,
}: {
	relativePath: string;
}): void {
	if (
		typeof relativePath !== "string" ||
		!/^cover\/(objects\/[a-f0-9]{64}\.(png|webp)|designs\/[a-zA-Z0-9-]+\/[1-9][0-9]*\.json)$/.test(
			relativePath
		)
	) {
		throw new Error("Invalid cover asset path");
	}
}

export function assertCoverAsset({ asset }: { asset: CoverAssetRefV1 }): void {
	assertCoverPath({ relativePath: asset.relativePath });
	assertCoverCanvas(asset);
	if (
		typeof asset.sha256 !== "string" ||
		!/^[a-f0-9]{64}$/.test(asset.sha256) ||
		asset.assetId !== asset.sha256 ||
		!Number.isSafeInteger(asset.byteLength) ||
		asset.byteLength <= 0 ||
		asset.byteLength > COVER_MAX_BYTES
	) {
		throw new Error("Invalid cover asset metadata");
	}
	const extension =
		asset.mimeType === "image/png"
			? "png"
			: asset.mimeType === "image/webp"
				? "webp"
				: null;
	if (
		!extension ||
		asset.relativePath !== `cover/objects/${asset.sha256}.${extension}`
	) {
		throw new Error("Cover asset path does not match its hash and MIME type");
	}
}

export function assertCoverSource({ source }: { source: CoverSourceV1 }): void {
	if (source.kind === "local-image") {
		if (typeof source.originalName !== "string" || !source.originalName.trim())
			throw new Error("Missing cover image name");
		return;
	}
	if (
		source.kind !== "timeline-frame" ||
		typeof source.sceneId !== "string" ||
		!source.sceneId.trim() ||
		!Number.isSafeInteger(source.frame) ||
		source.frame < 0 ||
		!Number.isFinite(source.fps) ||
		source.fps <= 0 ||
		source.fps > 240 ||
		!Number.isFinite(source.timeSeconds) ||
		Math.abs(source.timeSeconds - source.frame / source.fps) > 1e-6
	) {
		throw new Error("Invalid cover frame source");
	}
}

export function assertCoverDesign({ design }: { design: CoverDesignV1 }): void {
	if (
		design.schema !== "qcut.cover-design" ||
		design.schemaVersion !== 1 ||
		typeof design.id !== "string" ||
		!/^[a-zA-Z0-9-]+$/.test(design.id) ||
		!Number.isSafeInteger(design.revision) ||
		design.revision < 1
	)
		throw new Error("Unsupported cover design");
	assertCoverCanvas(design.canvas);
	assertCoverSource({ source: design.source });
	if (
		!/^#[a-f0-9]{6}$/i.test(design.canvas.backgroundColor) ||
		!Number.isFinite(Date.parse(design.createdAt)) ||
		!Number.isFinite(Date.parse(design.updatedAt))
	)
		throw new Error("Invalid cover design metadata");
	if (
		!Array.isArray(design.layers) ||
		design.layers.length < 1 ||
		design.layers.length > 21 ||
		design.layers[0].kind !== "image"
	)
		throw new Error(
			"A cover requires one background and at most 20 text layers"
		);
	const ids = new Set<string>();
	for (const layer of design.layers) {
		if (
			!layer ||
			typeof layer.id !== "string" ||
			!layer.id.trim() ||
			ids.has(layer.id)
		)
			throw new Error("Invalid or duplicate cover layer ID");
		ids.add(layer.id);
		if (layer.kind === "image") {
			if (
				layer !== design.layers[0] ||
				!["cover", "contain"].includes(layer.fit)
			)
				throw new Error("Unsupported cover image layer");
			assertCoverAsset({ asset: layer.asset });
			if (
				layer.position &&
				(!inRange(layer.position.x, 0, 1) ||
					!inRange(layer.position.y, 0, 1) ||
					!inRange(layer.position.zoom, 1, 4))
			)
				throw new Error("Invalid cover crop");
			continue;
		}
		assertCoverText({ layer });
	}
}

function inRange(value: number, min: number, max: number): boolean {
	return Number.isFinite(value) && value >= min && value <= max;
}

export function assertCoverText({ layer }: { layer: CoverTextLayerV1 }): void {
	if (
		layer.kind !== "text" ||
		typeof layer.content !== "string" ||
		layer.content.length > 2000 ||
		!inRange(layer.x, 0, 1) ||
		!inRange(layer.y, 0, 1) ||
		!inRange(layer.width, 0.05, 1) ||
		!inRange(layer.height, 0.05, 1) ||
		!inRange(layer.fontSize, 8, 512) ||
		!inRange(layer.rotation, -180, 180) ||
		!["sans-serif", "serif", "monospace"].includes(layer.fontFamily) ||
		!["left", "center", "right"].includes(layer.align) ||
		!/^#[a-f0-9]{6}$/i.test(layer.color) ||
		![
			layer.bold,
			layer.italic,
			layer.underline,
			layer.stroke,
			layer.shadow,
			layer.background,
		].every((value) => typeof value === "boolean")
	)
		throw new Error("Invalid cover text layer");
	assertCoverTextStyle({ style: layer.textStyle });
}

export function assertProjectCover({
	cover,
}: {
	cover: ProjectCoverBindingV1;
}): void {
	if (
		cover.schemaVersion !== 1 ||
		typeof cover.designId !== "string" ||
		!Number.isSafeInteger(cover.designRevision) ||
		cover.designRevision < 1 ||
		cover.designPath !==
			`cover/designs/${cover.designId}/${cover.designRevision}.json` ||
		!Number.isFinite(Date.parse(cover.updatedAt))
	)
		throw new Error("Invalid project cover binding");
	assertCoverPath({ relativePath: cover.designPath });
	assertCoverCanvas(cover.canvas);
	assertCoverSource({ source: cover.source });
	assertCoverAsset({ asset: cover.render });
	assertCoverAsset({ asset: cover.thumbnail });
	if (
		cover.render.mimeType !== "image/png" ||
		cover.render.width !== cover.canvas.width ||
		cover.render.height !== cover.canvas.height ||
		cover.thumbnail.mimeType !== "image/webp" ||
		cover.thumbnail.width !== 640 ||
		cover.thumbnail.height !== 360
	)
		throw new Error("Cover output dimensions or formats do not match");
}
