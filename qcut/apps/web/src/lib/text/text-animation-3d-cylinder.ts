import type { TextAnimationProjectionState } from "@qcut/editor-core/text-animation";
import {
	BackSide,
	BufferAttribute,
	BufferGeometry,
	type CanvasTexture,
	FrontSide,
	Group,
	Mesh,
	MeshBasicMaterial,
	type PerspectiveCamera,
	type Scene,
	type WebGLRenderer,
} from "three";

type TextAnimation3DCanvas = HTMLCanvasElement | OffscreenCanvas;

export interface TextAnimation3DCylinderPasses {
	group: Group;
	front: Mesh<BufferGeometry, MeshBasicMaterial>;
	back: Mesh<BufferGeometry, MeshBasicMaterial>;
}

function createCylinderGeometry({
	width,
	height,
	radius,
}: {
	width: number;
	height: number;
	radius: number;
}): BufferGeometry {
	const segmentCount = Math.max(64, Math.ceil(width / 4));
	const positions = new Float32Array((segmentCount + 1) * 2 * 3);
	const textureCoordinates = new Float32Array((segmentCount + 1) * 2 * 2);
	const indices: number[] = [];
	const halfHeight = height / 2;

	for (let segment = 0; segment <= segmentCount; segment += 1) {
		const progress = segment / segmentCount;
		const angle = Math.PI - progress * Math.PI * 2;
		const x = Math.sin(angle) * radius;
		const z = Math.cos(angle) * radius;
		const bottomVertex = segment * 2;
		const topVertex = bottomVertex + 1;

		positions.set([x, -halfHeight, z], bottomVertex * 3);
		positions.set([x, halfHeight, z], topVertex * 3);
		textureCoordinates.set([progress, 0], bottomVertex * 2);
		textureCoordinates.set([progress, 1], topVertex * 2);

		if (segment === segmentCount) continue;
		const nextBottomVertex = bottomVertex + 2;
		const nextTopVertex = topVertex + 2;
		indices.push(
			bottomVertex,
			topVertex,
			nextBottomVertex,
			topVertex,
			nextTopVertex,
			nextBottomVertex
		);
	}

	const geometry = new BufferGeometry();
	geometry.setAttribute("position", new BufferAttribute(positions, 3));
	geometry.setAttribute("uv", new BufferAttribute(textureCoordinates, 2));
	geometry.setIndex(indices);
	geometry.computeVertexNormals();
	geometry.computeBoundingSphere();
	return geometry;
}

function createCylinderMaterial({
	texture,
	side,
}: {
	texture: CanvasTexture<TextAnimation3DCanvas>;
	side: MeshBasicMaterial["side"];
}): MeshBasicMaterial {
	return new MeshBasicMaterial({
		map: texture,
		transparent: true,
		side,
		depthTest: false,
		depthWrite: false,
	});
}

export function createTextAnimation3DCylinder({
	width,
	height,
	texture,
	projection,
}: {
	width: number;
	height: number;
	texture: CanvasTexture<TextAnimation3DCanvas>;
	projection: Extract<TextAnimationProjectionState, { kind: "cylinder" }>;
}): TextAnimation3DCylinderPasses {
	const radius = width * projection.radiusRatio;
	const geometry = createCylinderGeometry({ width, height, radius });
	const uvScale = 1 / projection.coverage;
	texture.repeat.set(uvScale, 1);
	texture.offset.set((1 - uvScale) / 2, 0);
	texture.needsUpdate = true;

	const front = new Mesh(
		geometry,
		createCylinderMaterial({ texture, side: FrontSide })
	);
	const back = new Mesh(
		geometry,
		createCylinderMaterial({ texture, side: BackSide })
	);
	const group = new Group();
	group.add(back, front);
	group.rotation.order = "XYZ";
	group.rotation.set(
		(projection.tiltXDeg * Math.PI) / 180,
		(projection.yawDeg * Math.PI) / 180,
		0
	);
	return { group, front, back };
}

export function renderTextAnimation3DCylinderPasses({
	renderer,
	scene,
	camera,
	passes,
}: {
	renderer: WebGLRenderer;
	scene: Scene;
	camera: PerspectiveCamera;
	passes: TextAnimation3DCylinderPasses;
}): void {
	const previousAutoClear = renderer.autoClear;
	const previousFrontVisibility = passes.front.visible;
	const previousBackVisibility = passes.back.visible;

	renderer.autoClear = false;
	try {
		renderer.clear();
		passes.front.visible = false;
		passes.back.visible = true;
		renderer.render(scene, camera);

		renderer.clearDepth();
		passes.front.visible = true;
		passes.back.visible = false;
		renderer.render(scene, camera);
	} finally {
		passes.front.visible = previousFrontVisibility;
		passes.back.visible = previousBackVisibility;
		renderer.autoClear = previousAutoClear;
	}
}
