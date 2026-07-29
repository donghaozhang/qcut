import type { TextAnimationPostProcessState } from "@qcut/editor-core/text-animation";
import {
	Mesh,
	OrthographicCamera,
	PlaneGeometry,
	RGBAFormat,
	Scene,
	ShaderMaterial,
	WebGLRenderTarget,
	type PerspectiveCamera,
	type WebGLRenderer,
} from "three";

const VERTEX_SHADER = `
	varying vec2 vUv;

	void main() {
		vUv = uv;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`;

const FRAGMENT_SHADER = `
	uniform sampler2D sourceTexture;
	uniform int trailSamples;
	uniform float trailStrength;
	uniform float trapezoidAmount;
	varying vec2 vUv;

	vec2 trapezoidUv(vec2 uv) {
		float widthScale = 1.0 + trapezoidAmount * (uv.y * 2.0 - 1.0);
		return vec2((uv.x - 0.5) / max(0.05, widthScale) + 0.5, uv.y);
	}

	void main() {
		vec2 warped = trapezoidUv(vUv);
		vec4 accumulated = vec4(0.0);
		float totalWeight = 0.0;

		for (int index = 0; index < 64; index++) {
			if (index >= trailSamples) {
				break;
			}
			float ratio = trailSamples <= 1
				? 0.0
				: float(index) / float(trailSamples - 1);
			float weight = 1.0 - ratio * 0.72;
			vec2 radial = (warped - vec2(0.5)) * ratio * trailStrength * 0.08;
			vec2 sampleUv = warped - radial;
			if (
				sampleUv.x >= 0.0 &&
				sampleUv.x <= 1.0 &&
				sampleUv.y >= 0.0 &&
				sampleUv.y <= 1.0
			) {
				accumulated += texture2D(sourceTexture, sampleUv) * weight;
				totalWeight += weight;
			}
		}

		gl_FragColor = accumulated / max(totalWeight, 0.0001);
	}
`;

export function renderTextAnimation3DPostProcess({
	renderer,
	scene,
	camera,
	width,
	height,
	postProcess,
	renderSource,
}: {
	renderer: WebGLRenderer;
	scene: Scene;
	camera: PerspectiveCamera;
	width: number;
	height: number;
	postProcess: TextAnimationPostProcessState;
	renderSource?: ({
		renderer,
		scene,
		camera,
	}: {
		renderer: WebGLRenderer;
		scene: Scene;
		camera: PerspectiveCamera;
	}) => void;
}): void {
	const target = new WebGLRenderTarget(width, height, {
		format: RGBAFormat,
		depthBuffer: true,
		stencilBuffer: false,
	});
	renderer.setRenderTarget(target);
	if (renderSource) {
		renderSource({ renderer, scene, camera });
	} else {
		renderer.clear();
		renderer.render(scene, camera);
	}

	const material = new ShaderMaterial({
		transparent: true,
		depthWrite: false,
		uniforms: {
			sourceTexture: { value: target.texture },
			trailSamples: { value: postProcess.trailSamples },
			trailStrength: { value: postProcess.trailStrength },
			trapezoidAmount: { value: postProcess.trapezoidAmount },
		},
		vertexShader: VERTEX_SHADER,
		fragmentShader: FRAGMENT_SHADER,
	});
	const postScene = new Scene();
	const quad = new Mesh(new PlaneGeometry(2, 2), material);
	postScene.add(quad);
	const postCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

	renderer.setRenderTarget(null);
	renderer.clear();
	renderer.render(postScene, postCamera);

	quad.geometry.dispose();
	material.dispose();
	target.dispose();
}
