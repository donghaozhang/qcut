export type TransitionLabClipType =
	| "dissolve"
	| "push"
	| "page-flip"
	| "motion-blur"
	| "cube";

export type TransitionLabDirection = "left" | "right" | "up" | "down";
export type TransitionLabEasing = "linear" | "easeInOut" | "easeInOutQuint";

export interface TransitionLabRecipe {
	id: string;
	name: string;
	localizedName: string;
	description: string;
	defaultDuration: number;
	clip: {
		type: TransitionLabClipType;
		direction?: TransitionLabDirection;
		easing: TransitionLabEasing;
		tuning?: {
			intensity?: number;
			frequency?: number;
			tint?: string;
		};
	};
	shader: {
		fragmentSource: string;
		origin: "qcut-clean-room";
		license: "MIT";
		binaryAssets: false;
	};
}

export const TRANSITION_LAB_VERTEX_SHADER = `
attribute vec2 aPosition;
varying vec2 vUv;

void main() {
	vUv = aPosition * 0.5 + 0.5;
	gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

function fragmentShader({
	helpers = "",
	body,
}: {
	helpers?: string;
	body: string;
}): string {
	return `
precision highp float;
uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform float uProgress;
uniform float uIntensity;
uniform vec2 uResolution;
varying vec2 vUv;

${helpers}

void main() {
${body}
}
`;
}

const IN_BOUNDS_GLSL = `
bool inBounds(vec2 uv) {
	return uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0;
}
`;

const CROSSFADE_FRAGMENT = fragmentShader({
	body: `
	vec4 fromColor = texture2D(uFrom, vUv);
	vec4 toColor = texture2D(uTo, vUv);
	gl_FragColor = mix(fromColor, toColor, uProgress);
`,
});

function slideFragment({ direction }: { direction: "left" | "right" }): string {
	const travel = direction === "left" ? "1.0" : "-1.0";
	return fragmentShader({
		helpers: IN_BOUNDS_GLSL,
		body: `
	float travel = ${travel};
	vec2 fromUv = vUv + vec2(uProgress * travel, 0.0);
	vec2 toUv = vUv - vec2((1.0 - uProgress) * travel, 0.0);
	if (inBounds(toUv)) {
		gl_FragColor = texture2D(uTo, toUv);
	} else if (inBounds(fromUv)) {
		gl_FragColor = texture2D(uFrom, fromUv);
	} else {
		gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
	}
`,
	});
}

const PAGE_CURL_FRAGMENT = fragmentShader({
	body: `
	float edge = 1.0 - uProgress;
	float curlWidth = 0.12 + 0.12 * uIntensity;
	float distanceToEdge = vUv.x - edge;
	if (distanceToEdge > 0.0) {
		gl_FragColor = texture2D(uTo, vUv);
		return;
	}
	if (distanceToEdge < -curlWidth) {
		gl_FragColor = texture2D(uFrom, vUv);
		return;
	}
	float curl = clamp((distanceToEdge + curlWidth) / curlWidth, 0.0, 1.0);
	float arc = sin(curl * 3.14159265);
	vec2 warpedUv = vUv;
	warpedUv.x = clamp(edge - curlWidth + curlWidth * curl + arc * curlWidth * 0.32, 0.0, 1.0);
	vec4 paper = texture2D(uFrom, warpedUv);
	vec4 destination = texture2D(uTo, vUv);
	float backside = smoothstep(0.48, 0.82, curl);
	vec3 paperBack = mix(paper.rgb, vec3(dot(paper.rgb, vec3(0.299, 0.587, 0.114))), 0.28);
	float shade = 0.58 + 0.42 * abs(cos(curl * 3.14159265));
	vec3 curledColor = mix(paper.rgb, paperBack, backside) * shade;
	float edgeBlend = smoothstep(0.9, 1.0, curl);
	gl_FragColor = vec4(mix(curledColor, destination.rgb, edgeBlend), 1.0);
`,
});

const MOTION_SMEAR_FRAGMENT = fragmentShader({
	body: `
	float peak = 4.0 * uProgress * (1.0 - uProgress);
	float sourceSwitch = step(13.0 / 24.0, uProgress);
	float texel = 1.0 / max(uResolution.x, 1.0);
	float radius = texel * (5.0 + 28.0 * uIntensity) * peak;
	vec4 color = vec4(0.0);
	for (int index = -4; index <= 4; index++) {
		float offset = float(index) * radius * 0.25;
		vec2 sampleUv = vec2(clamp(vUv.x + offset, 0.0, 1.0), vUv.y);
		vec4 fromColor = texture2D(uFrom, sampleUv);
		vec4 toColor = texture2D(uTo, sampleUv);
		color += mix(fromColor, toColor, sourceSwitch);
	}
	gl_FragColor = color / 9.0;
`,
});

const CUBE_ROTATE_FRAGMENT = fragmentShader({
	body: `
	float angle = uProgress * 1.57079633;
	float fromWidth = max(0.0001, cos(angle));
	float toWidth = max(0.0001, sin(angle));
	float seam = fromWidth / (fromWidth + toWidth);
	if (vUv.x <= seam) {
		float localX = vUv.x / max(seam, 0.0001);
		float perspective = (localX - 0.5) * sin(angle) * 0.22;
		vec2 uv = vec2(clamp(localX + perspective, 0.0, 1.0), vUv.y);
		vec4 color = texture2D(uFrom, uv);
		color.rgb *= 1.0 - 0.32 * sin(angle);
		gl_FragColor = color;
		return;
	}
	float localX = (vUv.x - seam) / max(1.0 - seam, 0.0001);
	float perspective = (localX - 0.5) * cos(angle) * -0.22;
	vec2 uv = vec2(clamp(localX + perspective, 0.0, 1.0), vUv.y);
	vec4 color = texture2D(uTo, uv);
	color.rgb *= 0.68 + 0.32 * sin(angle);
	gl_FragColor = color;
`,
});

function cleanRoomShader({ fragmentSource }: { fragmentSource: string }) {
	return {
		fragmentSource,
		origin: "qcut-clean-room" as const,
		license: "MIT" as const,
		binaryAssets: false as const,
	};
}

export const TRANSITION_LAB_RECIPES: readonly TransitionLabRecipe[] = [
	{
		id: "lab-clean-dissolve",
		name: "Clean Dissolve",
		localizedName: "实验叠化",
		description: "Linear dual-texture GLSL dissolve with exact endpoints.",
		defaultDuration: 0.5,
		clip: { type: "dissolve", easing: "linear" },
		shader: cleanRoomShader({ fragmentSource: CROSSFADE_FRAGMENT }),
	},
	{
		id: "lab-quint-move-left",
		name: "Quint Move Left",
		localizedName: "五次缓动左移",
		description: "Full-frame horizontal travel driven by quintic easing.",
		defaultDuration: 1,
		clip: {
			type: "push",
			direction: "right",
			easing: "easeInOutQuint",
		},
		shader: cleanRoomShader({
			fragmentSource: slideFragment({ direction: "left" }),
		}),
	},
	{
		id: "lab-quint-move-right",
		name: "Quint Move Right",
		localizedName: "五次缓动右移",
		description: "Mirrored full-frame horizontal travel with exact endpoints.",
		defaultDuration: 1,
		clip: {
			type: "push",
			direction: "left",
			easing: "easeInOutQuint",
		},
		shader: cleanRoomShader({
			fragmentSource: slideFragment({ direction: "right" }),
		}),
	},
	{
		id: "lab-page-curl",
		name: "Clean-room Page Curl",
		localizedName: "实验卷页",
		description: "Nonlinear cylindrical curl with a shaded paper backside.",
		defaultDuration: 0.5,
		clip: {
			type: "page-flip",
			direction: "left",
			easing: "linear",
			tuning: { intensity: 0.7 },
		},
		shader: cleanRoomShader({ fragmentSource: PAGE_CURL_FRAGMENT }),
	},
	{
		id: "lab-horizontal-smear",
		name: "Horizontal Smear",
		localizedName: "实验横移模糊",
		description:
			"Nine-tap horizontal shader smear with a delayed source switch.",
		defaultDuration: 0.8,
		clip: {
			type: "motion-blur",
			direction: "left",
			easing: "linear",
			tuning: { intensity: 0.65 },
		},
		shader: cleanRoomShader({ fragmentSource: MOTION_SMEAR_FRAGMENT }),
	},
	{
		id: "lab-cube-rotate",
		name: "Shared Cube Rotate",
		localizedName: "实验立方旋转",
		description: "Two projective faces sharing one animated cube seam.",
		defaultDuration: 1,
		clip: {
			type: "cube",
			direction: "left",
			easing: "easeInOut",
			tuning: { intensity: 0.85 },
		},
		shader: cleanRoomShader({ fragmentSource: CUBE_ROTATE_FRAGMENT }),
	},
];

export function getTransitionLabRecipe({
	presetId,
}: {
	presetId: string;
}): TransitionLabRecipe | undefined {
	return TRANSITION_LAB_RECIPES.find((recipe) => recipe.id === presetId);
}
