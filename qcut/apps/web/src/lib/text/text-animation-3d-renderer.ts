import type {
	TextAnimationFrameState,
	TextAnimationGraphemeLayout,
	TextAnimationPostProcessState,
	TextAnimationProjectionState,
	TextAnimationRect,
	TextAnimationVisualState,
} from "@qcut/editor-core/text-animation";
import {
	BackSide,
	BufferAttribute,
	BufferGeometry,
	CanvasTexture,
	ClampToEdgeWrapping,
	DoubleSide,
	FrontSide,
	Group,
	LinearFilter,
	Mesh,
	MeshBasicMaterial,
	PerspectiveCamera,
	PlaneGeometry,
	RGBAFormat,
	Scene,
	SRGBColorSpace,
	WebGLRenderer,
} from "three";
import { renderTextAnimation3DPostProcess } from "./text-animation-3d-post-process";

type TextAnimation3DCanvas = HTMLCanvasElement | OffscreenCanvas;

export interface TextAnimation3DRenderRequest {
	source: TextAnimation3DCanvas;
	width: number;
	height: number;
	textureBounds: TextAnimationRect;
	state: TextAnimationFrameState;
	graphemes: readonly TextAnimationGraphemeLayout[];
}

interface TextAnimation3DRuntime {
	canvas: TextAnimation3DCanvas;
	renderer: WebGLRenderer;
}

let runtime: TextAnimation3DRuntime | null | undefined;

function createRenderCanvas({
	width,
	height,
}: {
	width: number;
	height: number;
}): TextAnimation3DCanvas | null {
	if (typeof document !== "undefined") {
		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		return canvas;
	}
	return typeof OffscreenCanvas === "undefined"
		? null
		: new OffscreenCanvas(width, height);
}

function createRuntime(): TextAnimation3DRuntime | null {
	const canvas = createRenderCanvas({ width: 1, height: 1 });
	if (!canvas) return null;
	try {
		const renderer = new WebGLRenderer({
			canvas,
			alpha: true,
			antialias: true,
			premultipliedAlpha: true,
			preserveDrawingBuffer: true,
		});
		renderer.outputColorSpace = SRGBColorSpace;
		renderer.setClearColor(0x000000, 0);
		renderer.setPixelRatio(1);
		return { canvas, renderer };
	} catch {
		return null;
	}
}

function getRuntime(): TextAnimation3DRuntime | null {
	if (runtime === undefined) runtime = createRuntime();
	return runtime;
}

export function resetTextAnimation3DRenderer(): void {
	runtime?.renderer.dispose();
	runtime = undefined;
}

function frameProjection({
	state,
}: {
	state: TextAnimationFrameState;
}): TextAnimationProjectionState | undefined {
	return (
		state.container.projection ??
		state.units.find(({ visual }) => visual.projection)?.visual.projection
	);
}

function framePostProcess({
	state,
}: {
	state: TextAnimationFrameState;
}): TextAnimationPostProcessState | undefined {
	return (
		state.container.postProcess ??
		state.units.find(({ visual }) => visual.postProcess)?.visual.postProcess
	);
}

export function requiresTextAnimation3D({
	state,
}: {
	state: TextAnimationFrameState;
}): boolean {
	return frameProjection({ state }) !== undefined;
}

function createTexture({
	source,
}: {
	source: TextAnimation3DCanvas;
}): CanvasTexture<TextAnimation3DCanvas> {
	const texture = new CanvasTexture(source);
	texture.colorSpace = SRGBColorSpace;
	texture.wrapS = ClampToEdgeWrapping;
	texture.wrapT = ClampToEdgeWrapping;
	texture.magFilter = LinearFilter;
	texture.minFilter = LinearFilter;
	texture.format = RGBAFormat;
	texture.generateMipmaps = false;
	texture.needsUpdate = true;
	return texture;
}

function createMaterial({
	texture,
	side = DoubleSide,
	depthTest = true,
}: {
	texture: CanvasTexture<TextAnimation3DCanvas>;
	side?: MeshBasicMaterial["side"];
	depthTest?: boolean;
}): MeshBasicMaterial {
	return new MeshBasicMaterial({
		map: texture,
		transparent: true,
		side,
		depthTest,
		depthWrite: false,
	});
}

function cameraDistance({
	height,
	fovDeg,
}: {
	height: number;
	fovDeg: number;
}): number {
	const halfFovRadians = (fovDeg * Math.PI) / 360;
	return height / (2 * Math.tan(halfFovRadians));
}

function projectedDepth({
	width,
	height,
	projection,
}: {
	width: number;
	height: number;
	projection: TextAnimationProjectionState;
}): number {
	if (projection.kind === "cylinder") {
		const radius = width * projection.radiusRatio;
		const tiltDepth =
			Math.abs(Math.sin((projection.tiltXDeg * Math.PI) / 180)) * (height / 2);
		return radius + tiltDepth;
	}
	const yawDepth =
		Math.abs(Math.sin((projection.groupRotationYDeg * Math.PI) / 180)) *
		(width / 2);
	const pitchDepth =
		Math.abs(Math.sin((projection.groupRotationXDeg * Math.PI) / 180)) *
		(height / 2);
	return yawDepth + pitchDepth;
}

export function resolveTextAnimation3DCameraDistance({
	width,
	height,
	projection,
	additionalDepth = 0,
}: {
	width: number;
	height: number;
	projection: TextAnimationProjectionState;
	additionalDepth?: number;
}): number {
	return (
		cameraDistance({ height, fovDeg: projection.cameraFovDeg }) +
		projectedDepth({ width, height, projection }) +
		Math.max(0, additionalDepth)
	);
}

function createCamera({
	width,
	height,
	projection,
	additionalDepth,
}: {
	width: number;
	height: number;
	projection: TextAnimationProjectionState;
	additionalDepth: number;
}): PerspectiveCamera {
	const distance = resolveTextAnimation3DCameraDistance({
		width,
		height,
		projection,
		additionalDepth,
	});
	const camera = new PerspectiveCamera(
		projection.cameraFovDeg,
		width / Math.max(1, height),
		Math.max(0.1, distance / 100),
		distance * 100
	);
	camera.position.set(0, 0, distance);
	camera.lookAt(0, 0, 0);
	camera.updateProjectionMatrix();
	return camera;
}

function maximumUnitDepth({
	state,
	graphemes,
}: {
	state: TextAnimationFrameState;
	graphemes: readonly TextAnimationGraphemeLayout[];
}): number {
	let maximumDepth = 0;
	for (const grapheme of graphemes) {
		const visual = state.units[grapheme.index]?.visual;
		if (!visual) continue;
		const rotationX = (visual.rotationXDeg * Math.PI) / 180;
		const rotationY = (visual.rotationYDeg * Math.PI) / 180;
		const depth =
			Math.abs(visual.translateZ) +
			Math.abs(Math.sin(rotationY)) * (grapheme.bounds.width / 2) +
			Math.abs(Math.sin(rotationX)) * (grapheme.bounds.height / 2);
		maximumDepth = Math.max(maximumDepth, depth);
	}
	return maximumDepth;
}

function visualDepth({
	visual,
	width,
	height,
}: {
	visual: TextAnimationVisualState;
	width: number;
	height: number;
}): number {
	const rotationX = (visual.rotationXDeg * Math.PI) / 180;
	const rotationY = (visual.rotationYDeg * Math.PI) / 180;
	return (
		Math.abs(visual.translateZ) +
		Math.abs(Math.sin(rotationY)) * (width / 2) +
		Math.abs(Math.sin(rotationX)) * (height / 2)
	);
}

function applyVisualState({
	object,
	visual,
}: {
	object: Mesh | Group;
	visual: TextAnimationVisualState;
}): void {
	object.position.x += visual.translateX;
	object.position.y -= visual.translateY;
	object.position.z += visual.translateZ;
	object.scale.x *= visual.scaleX;
	object.scale.y *= visual.scaleY;
	object.rotation.x += (visual.rotationXDeg * Math.PI) / 180;
	object.rotation.y += (visual.rotationYDeg * Math.PI) / 180;
	object.rotation.z -= (visual.rotationDeg * Math.PI) / 180;
	object.visible = visual.opacity > 0.0001;
}

function applyVisualState3D({
	object,
	visual,
}: {
	object: Mesh | Group;
	visual: TextAnimationVisualState;
}): void {
	object.position.z += visual.translateZ;
	object.rotation.x += (visual.rotationXDeg * Math.PI) / 180;
	object.rotation.y += (visual.rotationYDeg * Math.PI) / 180;
	object.visible = visual.opacity > 0.0001;
}

function createWholeTextPlane({
	width,
	height,
	material,
	visual,
}: {
	width: number;
	height: number;
	material: MeshBasicMaterial;
	visual: TextAnimationVisualState;
}): Mesh {
	const mesh = new Mesh(new PlaneGeometry(width, height), material);
	applyVisualState3D({ object: mesh, visual });
	return mesh;
}

function normalizedTextureCoordinates({
	bounds,
	textureBounds,
}: {
	bounds: TextAnimationRect;
	textureBounds: TextAnimationRect;
}): { left: number; right: number; top: number; bottom: number } {
	const left = (bounds.x - textureBounds.x) / textureBounds.width;
	const right =
		(bounds.x + bounds.width - textureBounds.x) / textureBounds.width;
	const top = 1 - (bounds.y - textureBounds.y) / textureBounds.height;
	const bottom =
		1 - (bounds.y + bounds.height - textureBounds.y) / textureBounds.height;
	return { left, right, top, bottom };
}

function createGlyphGeometry({
	bounds,
	textureBounds,
	mirrorX = false,
}: {
	bounds: TextAnimationRect;
	textureBounds: TextAnimationRect;
	mirrorX?: boolean;
}): BufferGeometry {
	const halfWidth = bounds.width / 2;
	const halfHeight = bounds.height / 2;
	const uv = normalizedTextureCoordinates({ bounds, textureBounds });
	const left = mirrorX ? uv.right : uv.left;
	const right = mirrorX ? uv.left : uv.right;
	const geometry = new BufferGeometry();
	geometry.setAttribute(
		"position",
		new BufferAttribute(
			new Float32Array([
				-halfWidth,
				-halfHeight,
				0,
				halfWidth,
				-halfHeight,
				0,
				-halfWidth,
				halfHeight,
				0,
				halfWidth,
				halfHeight,
				0,
			]),
			3
		)
	);
	geometry.setAttribute(
		"uv",
		new BufferAttribute(
			new Float32Array([
				left,
				uv.bottom,
				right,
				uv.bottom,
				left,
				uv.top,
				right,
				uv.top,
			]),
			2
		)
	);
	geometry.setIndex([0, 1, 2, 2, 1, 3]);
	return geometry;
}

function createGlyphGroup({
	graphemes,
	material,
	state,
	textureBounds,
}: {
	graphemes: readonly TextAnimationGraphemeLayout[];
	material: MeshBasicMaterial;
	state: TextAnimationFrameState;
	textureBounds: TextAnimationRect;
}): Group {
	const group = new Group();
	const textureCenterX = textureBounds.x + textureBounds.width / 2;
	const textureCenterY = textureBounds.y + textureBounds.height / 2;
	for (const grapheme of graphemes) {
		const visual = state.units[grapheme.index]?.visual;
		if (!visual || grapheme.bounds.width <= 0 || grapheme.bounds.height <= 0) {
			continue;
		}
		const mesh = new Mesh(
			createGlyphGeometry({
				bounds: grapheme.bounds,
				textureBounds,
			}),
			material
		);
		mesh.position.set(
			grapheme.bounds.x + grapheme.bounds.width / 2 - textureCenterX,
			-(grapheme.bounds.y + grapheme.bounds.height / 2 - textureCenterY),
			0
		);
		applyVisualState({ object: mesh, visual });
		group.add(mesh);
	}
	return group;
}

function applyPlaneProjection({
	group,
	projection,
}: {
	group: Group;
	projection: Extract<TextAnimationProjectionState, { kind: "plane" }>;
}): void {
	group.rotation.x = (projection.groupRotationXDeg * Math.PI) / 180;
	group.rotation.y = (projection.groupRotationYDeg * Math.PI) / 180;
}

export function createTextAnimation3DCylinder({
	width,
	texture,
	projection,
	graphemes,
	textureBounds,
}: {
	width: number;
	texture: CanvasTexture<TextAnimation3DCanvas>;
	projection: Extract<TextAnimationProjectionState, { kind: "cylinder" }>;
	graphemes: readonly TextAnimationGraphemeLayout[];
	textureBounds: TextAnimationRect;
}): Group {
	const radius = width * projection.radiusRatio;
	const thetaLength = Math.PI * 2 * projection.coverage;
	const frontMaterial = createMaterial({
		texture,
		side: FrontSide,
		depthTest: false,
	});
	const backMaterial = createMaterial({
		texture,
		side: BackSide,
		depthTest: false,
	});
	const textureCenterY = textureBounds.y + textureBounds.height / 2;
	const group = new Group();
	for (const grapheme of graphemes) {
		if (grapheme.bounds.width <= 0 || grapheme.bounds.height <= 0) continue;
		const normalizedCenterX =
			(grapheme.bounds.x + grapheme.bounds.width / 2 - textureBounds.x) /
			textureBounds.width;
		const angle = thetaLength / 2 - normalizedCenterX * thetaLength;
		const x = Math.sin(angle) * radius;
		const y = -(
			grapheme.bounds.y +
			grapheme.bounds.height / 2 -
			textureCenterY
		);
		const z = Math.cos(angle) * radius;
		const front = new Mesh(
			createGlyphGeometry({
				bounds: grapheme.bounds,
				textureBounds,
			}),
			frontMaterial
		);
		const back = new Mesh(
			createGlyphGeometry({
				bounds: grapheme.bounds,
				textureBounds,
				mirrorX: true,
			}),
			backMaterial
		);
		for (const [renderOrder, mesh] of [front, back].entries()) {
			mesh.position.set(x, y, z);
			mesh.rotation.y = angle;
			mesh.renderOrder = renderOrder;
			group.add(mesh);
		}
	}
	group.rotation.order = "YXZ";
	group.rotation.set(
		(-projection.tiltXDeg * Math.PI) / 180,
		(projection.yawDeg * Math.PI) / 180,
		0
	);
	return group;
}

function disposeScene({ scene }: { scene: Scene }): void {
	const geometries = new Set<BufferGeometry>();
	const materials = new Set<MeshBasicMaterial>();
	const textures = new Set<CanvasTexture<TextAnimation3DCanvas>>();
	scene.traverse((object) => {
		if (!(object instanceof Mesh)) return;
		geometries.add(object.geometry);
		const meshMaterials = Array.isArray(object.material)
			? object.material
			: [object.material];
		for (const material of meshMaterials) {
			if (!(material instanceof MeshBasicMaterial)) continue;
			materials.add(material);
			if (material.map instanceof CanvasTexture) {
				textures.add(material.map as CanvasTexture<TextAnimation3DCanvas>);
			}
		}
	});
	for (const geometry of geometries) geometry.dispose();
	for (const material of materials) material.dispose();
	for (const texture of textures) texture.dispose();
}

export function renderTextAnimation3D({
	source,
	width,
	height,
	textureBounds,
	state,
	graphemes,
}: TextAnimation3DRenderRequest): TextAnimation3DCanvas | null {
	const resolvedRuntime = getRuntime();
	const projection = frameProjection({ state });
	if (!resolvedRuntime || !projection || width <= 0 || height <= 0) return null;

	const outputWidth = Math.max(1, Math.ceil(width));
	const outputHeight = Math.max(1, Math.ceil(height));
	const { renderer, canvas } = resolvedRuntime;
	renderer.setSize(outputWidth, outputHeight, false);
	renderer.setClearColor(0x000000, 0);

	const texture = createTexture({ source });
	const scene = new Scene();
	const camera = createCamera({
		width: outputWidth,
		height: outputHeight,
		projection,
		additionalDepth:
			visualDepth({
				visual: state.container,
				width: outputWidth,
				height: outputHeight,
			}) + maximumUnitDepth({ state, graphemes }),
	});

	if (projection.kind === "cylinder") {
		scene.add(
			createTextAnimation3DCylinder({
				width,
				texture,
				projection,
				graphemes,
				textureBounds,
			})
		);
	} else {
		const material = createMaterial({ texture });
		const usesPerGrapheme3D = state.units.some(
			({ visual }) =>
				Math.abs(visual.rotationXDeg) > 0.0001 ||
				Math.abs(visual.rotationYDeg) > 0.0001 ||
				Math.abs(visual.translateZ) > 0.0001 ||
				visual.postProcess !== undefined
		);
		const group = usesPerGrapheme3D
			? createGlyphGroup({
					graphemes,
					material,
					state,
					textureBounds,
				})
			: new Group();
		if (!usesPerGrapheme3D) {
			group.add(
				createWholeTextPlane({
					width,
					height,
					material,
					visual: state.container,
				})
			);
		}
		applyPlaneProjection({ group, projection });
		scene.add(group);
	}

	const postProcess = framePostProcess({ state });
	if (postProcess && postProcess.trailSamples > 1) {
		renderTextAnimation3DPostProcess({
			renderer,
			scene,
			camera,
			width: outputWidth,
			height: outputHeight,
			postProcess,
		});
	} else {
		renderer.setRenderTarget(null);
		renderer.clear();
		renderer.render(scene, camera);
	}

	disposeScene({ scene });
	return canvas;
}
