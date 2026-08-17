/**
 * GPU raster post-passes for text animation — the WebGL2 tier above the
 * drawImage passes in text-animation-raster-pass.ts, for looks a 2D canvas
 * cannot express faithfully (true multi-pass bloom first). Same contract as
 * the 2D passes: the block's offscreen raster goes in, composited pixels come
 * out; callers fall back to the 2D approximation when this returns null.
 *
 * Mirrors the filter pipeline's gpu-lut-renderer: one lazily-created WebGL2
 * context, null when unavailable, and the caller never touches GL state.
 * Everything runs in premultiplied alpha so the halo composites correctly
 * over the transparent raster background.
 */

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
uniform float u_flipY;
out vec2 v_uv;
void main() {
  // Intermediate FBO passes keep the uploaded orientation (u_flipY = 0);
  // the final pass flips so canvas drawImage reads the rows upright.
  float v = a_position.y * 0.5 + 0.5;
  v_uv = vec2(a_position.x * 0.5 + 0.5, mix(v, 1.0 - v, u_flipY));
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

/** Bright-pass: keep only pixels above the threshold, scaled back smoothly. */
const BRIGHT_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_source;
uniform float u_threshold;
out vec4 fragColor;
void main() {
  vec4 color = texture(u_source, v_uv);
  float brightness = max(color.r, max(color.g, color.b));
  float keep = smoothstep(u_threshold, 1.0, brightness);
  fragColor = color * keep;
}`;

/** 13-tap separable gaussian; u_step is one blur step in uv units. */
const BLUR_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_source;
uniform vec2 u_step;
out vec4 fragColor;
void main() {
  float weights[7] = float[](0.1964, 0.1746, 0.1216, 0.0662, 0.0281, 0.0093, 0.0024);
  vec4 sum = texture(u_source, v_uv) * weights[0];
  for (int i = 1; i < 7; i++) {
    vec2 offset = u_step * float(i);
    sum += texture(u_source, v_uv + offset) * weights[i];
    sum += texture(u_source, v_uv - offset) * weights[i];
  }
  fragColor = sum;
}`;

/** Additive composite: the source plus the blurred halo. */
const COMPOSITE_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_source;
uniform sampler2D u_bloom;
uniform float u_intensity;
out vec4 fragColor;
void main() {
  vec4 source = texture(u_source, v_uv);
  vec4 halo = texture(u_bloom, v_uv);
  fragColor = clamp(source + halo * u_intensity, 0.0, 1.0);
}`;

/**
 * Procedural flame: fBm noise rising through the glyph alpha, shaded through
 * a blackbody-ish ramp. The text stays legible because the fire is keyed to
 * the alpha's own gradient — this is the pass a 2D canvas cannot fake, which
 * is why 彩色火焰-class effects were out of reach before WebGL2.
 */
const FLAME_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_source;
uniform vec2 u_texel;
uniform float u_time;
uniform float u_intensity;
uniform float u_height;
out vec4 fragColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float total = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    total += noise(p) * amplitude;
    p *= 2.0;
    amplitude *= 0.5;
  }
  return total;
}

void main() {
  vec4 source = texture(u_source, v_uv);
  // Fuel is the glyph mass BELOW this pixel, falling off with distance — a
  // flat max would make every interior pixel burn equally and the block would
  // just wash orange. Positive v is downward on screen after the flip, so
  // stepping +v walks toward the glyph feeding this pixel.
  float fuel = 0.0;
  for (int i = 1; i <= 14; i++) {
    float dist = float(i) / 14.0;
    float a = texture(u_source, v_uv + vec2(0.0, u_texel.y * float(i) * 4.0)).a;
    fuel = max(fuel, a * (1.0 - dist));
  }
  fuel *= u_height;
  // Rising, curling field; the domain warp is what gives the tongues shape.
  vec2 flow = vec2(v_uv.x * 7.0, v_uv.y * 5.0 - u_time * 2.2);
  float f = fbm(flow + fbm(flow * 0.6) * 0.8);
  // Burn hardest just OUTSIDE the glyph: inside, the text should stay legible.
  float outside = 1.0 - smoothstep(0.0, 0.85, source.a);
  // Multiplicative, not additive: summing saturates the whole fuel column to
  // solid and the fire reads as a rectangle over each glyph. Letting the noise
  // gate the fuel is what carves tongues, and the gate tightens as fuel thins
  // so the tips break into flecks.
  float gate = smoothstep(0.62 - fuel * 0.30, 0.92 - fuel * 0.18, f);
  float flame = clamp(fuel * gate * 1.6, 0.0, 1.0) * outside;
  // Blackbody-ish ramp: red tips, amber body, white core.
  vec3 fire = mix(vec3(0.9, 0.13, 0.02), vec3(1.0, 0.58, 0.06), smoothstep(0.1, 0.5, flame));
  fire = mix(fire, vec3(1.0, 0.95, 0.75), smoothstep(0.6, 1.0, flame));
  // A little heat licks onto the glyph itself without hiding it.
  vec3 lit = source.rgb + fire * flame * u_intensity * 0.9;
  float alpha = clamp(source.a + flame * u_intensity, 0.0, 1.0);
  fragColor = vec4(clamp(lit, 0.0, 1.0) * alpha, alpha);
}`;

/**
 * God rays: radial light shafts streaming out of the bright parts of the
 * glyphs. A standard radial-occlusion march — step toward the light origin
 * accumulating brightness with decay — which needs per-pixel sampling along a
 * direction, so it belongs on the GPU tier next to the flame.
 */
const GODRAY_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_source;
uniform vec2 u_origin;
uniform float u_intensity;
uniform float u_decay;
uniform float u_spread;
out vec4 fragColor;

void main() {
  vec4 source = texture(u_source, v_uv);
  vec2 delta = (v_uv - u_origin) * u_spread / 24.0;
  vec2 coord = v_uv;
  float weight = 1.0;
  vec3 rays = vec3(0.0);
  for (int i = 0; i < 24; i++) {
    coord -= delta;
    vec4 sampled = texture(u_source, coord);
    // Only bright pixels cast shafts, so the rays follow the lit strokes.
    float lum = max(sampled.r, max(sampled.g, sampled.b)) * sampled.a;
    rays += sampled.rgb * lum * weight;
    weight *= u_decay;
  }
  rays /= 24.0;
  vec3 lit = source.rgb + rays * u_intensity;
  float alpha = clamp(source.a + max(rays.r, max(rays.g, rays.b)) * u_intensity, 0.0, 1.0);
  fragColor = vec4(clamp(lit, 0.0, 1.0) * alpha, alpha);
}`;

/**
 * Rough edge: erode the glyph silhouette against a noise field so the outline
 * crumbles instead of staying razor-sharp. This is alpha thresholding per
 * pixel — the displacement pass moves whole bands and cannot chew an edge —
 * so it needs the GPU tier.
 */
const ROUGH_EDGE_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_source;
uniform vec2 u_noiseScale;
uniform float u_edgeSize;
uniform float u_noiseIntensity;
uniform float u_smooth;
out vec4 fragColor;

float hash(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.56);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec4 source = texture(u_source, v_uv);
  float n = noise(v_uv / max(u_noiseScale, vec2(0.001)));
  // Bite into the silhouette where the noise is low; edgeSize sets how deep
  // the erosion can reach, noiseIntensity how much of it is noise-driven.
  float bite = (1.0 - n) * u_noiseIntensity * u_edgeSize;
  float alpha = smoothstep(bite, bite + max(0.02, u_smooth), source.a);
  // Un-premultiply, re-premultiply against the eaten alpha so the colour does
  // not darken as the edge thins.
  vec3 rgb = source.a > 0.001 ? source.rgb / source.a : vec3(0.0);
  fragColor = vec4(rgb * alpha, alpha);
}`;

export interface TextAnimationGpuPass {
	/**
	 * Draws `source` with a bloom halo and returns the canvas holding the
	 * result (same size as the input), or null when the pass cannot run.
	 */
	renderBloom(input: {
		source: CanvasImageSource;
		width: number;
		height: number;
		/** Halo strength; 1 is a full additive copy of the blurred bright pass. */
		intensity: number;
		/** Gaussian radius in px. */
		radiusPx: number;
		/** Bright-pass threshold, 0..1. Defaults to 0.25. */
		threshold?: number;
	}): HTMLCanvasElement | null;
	/**
	 * Draws `source` with procedural flame rising off the glyphs, or null when
	 * the pass cannot run.
	 */
	renderFlame(input: {
		source: CanvasImageSource;
		width: number;
		height: number;
		/** Flame strength; 1 is a full blaze. */
		intensity: number;
		/** How far the fire reaches above the glyphs, roughly 0..2. */
		reach: number;
		/** Animation phase in seconds. */
		time: number;
	}): HTMLCanvasElement | null;
	/** Draws `source` with radial light shafts, or null when unavailable. */
	renderGodRay(input: {
		source: CanvasImageSource;
		width: number;
		height: number;
		/** Shaft brightness. */
		intensity: number;
		/** Light origin in 0..1 uv; 0.5,0.5 centres it on the block. */
		originX: number;
		originY: number;
		/** How far the shafts reach, roughly 0..2. */
		spread: number;
	}): HTMLCanvasElement | null;
	/** Draws `source` with a noise-eroded silhouette, or null when unavailable. */
	renderRoughEdge(input: {
		source: CanvasImageSource;
		width: number;
		height: number;
		/** How deep the erosion can bite, roughly 0..1. */
		edgeSize: number;
		/** How much of the bite is noise-driven, 0..1. */
		noiseIntensity: number;
		/** Noise cell size in uv; the source ships 0.15. */
		noiseScale: number;
	}): HTMLCanvasElement | null;
	dispose(): void;
}

function compileShader({
	gl,
	source,
	type,
}: {
	gl: WebGL2RenderingContext;
	source: string;
	type: number;
}): WebGLShader {
	const shader = gl.createShader(type);
	if (!shader) throw new Error("Unable to allocate a WebGL shader");
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const message = gl.getShaderInfoLog(shader) || "Unknown shader error";
		gl.deleteShader(shader);
		throw new Error(`Text GPU pass shader failed: ${message}`);
	}
	return shader;
}

function linkProgram({
	gl,
	fragmentSource,
}: {
	gl: WebGL2RenderingContext;
	fragmentSource: string;
}): WebGLProgram {
	const vertex = compileShader({
		gl,
		source: VERTEX_SHADER,
		type: gl.VERTEX_SHADER,
	});
	const fragment = compileShader({
		gl,
		source: fragmentSource,
		type: gl.FRAGMENT_SHADER,
	});
	const program = gl.createProgram();
	if (!program) throw new Error("Unable to allocate a WebGL program");
	gl.attachShader(program, vertex);
	gl.attachShader(program, fragment);
	gl.linkProgram(program);
	gl.deleteShader(vertex);
	gl.deleteShader(fragment);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		const message = gl.getProgramInfoLog(program) || "Unknown link error";
		gl.deleteProgram(program);
		throw new Error(`Text GPU pass link failed: ${message}`);
	}
	return program;
}

function createTextAnimationGpuPass(): TextAnimationGpuPass | null {
	if (typeof document === "undefined") return null;
	const canvas = document.createElement("canvas");
	const context = canvas.getContext("webgl2", {
		alpha: true,
		premultipliedAlpha: true,
		preserveDrawingBuffer: true,
	});
	if (!context) return null;
	const gl: WebGL2RenderingContext = context;

	let brightProgram: WebGLProgram;
	let blurProgram: WebGLProgram;
	let compositeProgram: WebGLProgram;
	let flameProgram: WebGLProgram;
	let godRayProgram: WebGLProgram;
	let roughEdgeProgram: WebGLProgram;
	try {
		brightProgram = linkProgram({ gl, fragmentSource: BRIGHT_SHADER });
		blurProgram = linkProgram({ gl, fragmentSource: BLUR_SHADER });
		compositeProgram = linkProgram({ gl, fragmentSource: COMPOSITE_SHADER });
		flameProgram = linkProgram({ gl, fragmentSource: FLAME_SHADER });
		godRayProgram = linkProgram({ gl, fragmentSource: GODRAY_SHADER });
		roughEdgeProgram = linkProgram({
			gl,
			fragmentSource: ROUGH_EDGE_SHADER,
		});
	} catch {
		return null;
	}

	const buffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
	gl.bufferData(
		gl.ARRAY_BUFFER,
		new Float32Array([-1, -1, 3, -1, -1, 3]),
		gl.STATIC_DRAW
	);

	const sourceTexture = gl.createTexture();
	const passTextures = [gl.createTexture(), gl.createTexture()] as const;
	const framebuffers = [
		gl.createFramebuffer(),
		gl.createFramebuffer(),
	] as const;
	let allocatedWidth = 0;
	let allocatedHeight = 0;

	function setupTexture(texture: WebGLTexture | null): void {
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	}

	function allocate({ width, height }: { width: number; height: number }) {
		if (width === allocatedWidth && height === allocatedHeight) return;
		for (let index = 0; index < 2; index++) {
			setupTexture(passTextures[index]);
			gl.texImage2D(
				gl.TEXTURE_2D,
				0,
				gl.RGBA8,
				width,
				height,
				0,
				gl.RGBA,
				gl.UNSIGNED_BYTE,
				null
			);
			gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers[index]);
			gl.framebufferTexture2D(
				gl.FRAMEBUFFER,
				gl.COLOR_ATTACHMENT0,
				gl.TEXTURE_2D,
				passTextures[index],
				0
			);
		}
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		allocatedWidth = width;
		allocatedHeight = height;
	}

	function drawPass({
		program,
		target,
		flipY,
		bind,
	}: {
		program: WebGLProgram;
		target: WebGLFramebuffer | null;
		flipY: boolean;
		bind: () => void;
	}) {
		// biome-ignore lint/correctness/useHookAtTopLevel: WebGL call, not a React hook
		gl.useProgram(program);
		gl.bindFramebuffer(gl.FRAMEBUFFER, target);
		const position = gl.getAttribLocation(program, "a_position");
		gl.enableVertexAttribArray(position);
		gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
		gl.uniform1f(gl.getUniformLocation(program, "u_flipY"), flipY ? 1 : 0);
		bind();
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	}

	return {
		renderBloom({ source, width, height, intensity, radiusPx, threshold }) {
			if (width <= 0 || height <= 0) return null;
			if (gl.isContextLost()) return null;
			canvas.width = width;
			canvas.height = height;
			allocate({ width, height });
			gl.viewport(0, 0, width, height);
			gl.disable(gl.BLEND);

			// Upload the 2D raster premultiplied, matching the context mode.
			gl.activeTexture(gl.TEXTURE0);
			setupTexture(sourceTexture);
			gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
			gl.texImage2D(
				gl.TEXTURE_2D,
				0,
				gl.RGBA8,
				gl.RGBA,
				gl.UNSIGNED_BYTE,
				source as TexImageSource
			);
			gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

			// Bright pass → texture 0.
			drawPass({
				program: brightProgram,
				target: framebuffers[0],
				flipY: false,
				bind: () => {
					gl.activeTexture(gl.TEXTURE0);
					gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
					gl.uniform1i(gl.getUniformLocation(brightProgram, "u_source"), 0);
					gl.uniform1f(
						gl.getUniformLocation(brightProgram, "u_threshold"),
						Math.min(0.95, Math.max(0, threshold ?? 0.25))
					);
				},
			});

			// Separable gaussian: 6 taps per side cover ~3σ, so one blur step
			// is radius/6 of a texel.
			const step = Math.max(0.5, radiusPx) / 6;
			const blurPass = ({
				from,
				to,
				stepX,
				stepY,
			}: {
				from: 0 | 1;
				to: 0 | 1;
				stepX: number;
				stepY: number;
			}) => {
				drawPass({
					program: blurProgram,
					target: framebuffers[to],
					flipY: false,
					bind: () => {
						gl.activeTexture(gl.TEXTURE0);
						gl.bindTexture(gl.TEXTURE_2D, passTextures[from]);
						gl.uniform1i(gl.getUniformLocation(blurProgram, "u_source"), 0);
						gl.uniform2f(
							gl.getUniformLocation(blurProgram, "u_step"),
							stepX / width,
							stepY / height
						);
					},
				});
			};
			blurPass({ from: 0, to: 1, stepX: step, stepY: 0 });
			blurPass({ from: 1, to: 0, stepX: 0, stepY: step });

			// Composite to the default framebuffer, flipped for drawImage.
			drawPass({
				program: compositeProgram,
				target: null,
				flipY: true,
				bind: () => {
					gl.activeTexture(gl.TEXTURE0);
					gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
					gl.uniform1i(gl.getUniformLocation(compositeProgram, "u_source"), 0);
					gl.activeTexture(gl.TEXTURE1);
					gl.bindTexture(gl.TEXTURE_2D, passTextures[0]);
					gl.uniform1i(gl.getUniformLocation(compositeProgram, "u_bloom"), 1);
					gl.uniform1f(
						gl.getUniformLocation(compositeProgram, "u_intensity"),
						Math.max(0, intensity)
					);
				},
			});
			// A lost context or GL error means the canvas holds garbage —
			// report failure so the caller runs the 2D fallback instead.
			if (gl.isContextLost() || gl.getError() !== gl.NO_ERROR) return null;
			return canvas;
		},
		renderFlame({ source, width, height, intensity, reach, time }) {
			if (width <= 0 || height <= 0) return null;
			if (gl.isContextLost()) return null;
			canvas.width = width;
			canvas.height = height;
			allocate({ width, height });
			gl.viewport(0, 0, width, height);
			gl.disable(gl.BLEND);
			gl.activeTexture(gl.TEXTURE0);
			setupTexture(sourceTexture);
			gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
			gl.texImage2D(
				gl.TEXTURE_2D,
				0,
				gl.RGBA8,
				gl.RGBA,
				gl.UNSIGNED_BYTE,
				source as TexImageSource
			);
			gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
			drawPass({
				program: flameProgram,
				target: null,
				flipY: true,
				bind: () => {
					gl.activeTexture(gl.TEXTURE0);
					gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
					gl.uniform1i(gl.getUniformLocation(flameProgram, "u_source"), 0);
					gl.uniform2f(
						gl.getUniformLocation(flameProgram, "u_texel"),
						1 / width,
						1 / height
					);
					gl.uniform1f(gl.getUniformLocation(flameProgram, "u_time"), time);
					gl.uniform1f(
						gl.getUniformLocation(flameProgram, "u_intensity"),
						Math.max(0, intensity)
					);
					gl.uniform1f(
						gl.getUniformLocation(flameProgram, "u_height"),
						Math.max(0.05, reach)
					);
				},
			});
			if (gl.isContextLost() || gl.getError() !== gl.NO_ERROR) return null;
			return canvas;
		},
		renderGodRay({
			source,
			width,
			height,
			intensity,
			originX,
			originY,
			spread,
		}) {
			if (width <= 0 || height <= 0) return null;
			if (gl.isContextLost()) return null;
			canvas.width = width;
			canvas.height = height;
			allocate({ width, height });
			gl.viewport(0, 0, width, height);
			gl.disable(gl.BLEND);
			gl.activeTexture(gl.TEXTURE0);
			setupTexture(sourceTexture);
			gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
			gl.texImage2D(
				gl.TEXTURE_2D,
				0,
				gl.RGBA8,
				gl.RGBA,
				gl.UNSIGNED_BYTE,
				source as TexImageSource
			);
			gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
			drawPass({
				program: godRayProgram,
				target: null,
				flipY: true,
				bind: () => {
					gl.activeTexture(gl.TEXTURE0);
					gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
					gl.uniform1i(gl.getUniformLocation(godRayProgram, "u_source"), 0);
					gl.uniform2f(
						gl.getUniformLocation(godRayProgram, "u_origin"),
						originX,
						originY
					);
					gl.uniform1f(
						gl.getUniformLocation(godRayProgram, "u_intensity"),
						Math.max(0, intensity)
					);
					gl.uniform1f(gl.getUniformLocation(godRayProgram, "u_decay"), 0.94);
					gl.uniform1f(
						gl.getUniformLocation(godRayProgram, "u_spread"),
						Math.max(0.05, spread)
					);
				},
			});
			if (gl.isContextLost() || gl.getError() !== gl.NO_ERROR) return null;
			return canvas;
		},
		renderRoughEdge({
			source,
			width,
			height,
			edgeSize,
			noiseIntensity,
			noiseScale,
		}) {
			if (width <= 0 || height <= 0) return null;
			if (gl.isContextLost()) return null;
			canvas.width = width;
			canvas.height = height;
			allocate({ width, height });
			gl.viewport(0, 0, width, height);
			gl.disable(gl.BLEND);
			gl.activeTexture(gl.TEXTURE0);
			setupTexture(sourceTexture);
			gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
			gl.texImage2D(
				gl.TEXTURE_2D,
				0,
				gl.RGBA8,
				gl.RGBA,
				gl.UNSIGNED_BYTE,
				source as TexImageSource
			);
			gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
			drawPass({
				program: roughEdgeProgram,
				target: null,
				flipY: true,
				bind: () => {
					gl.activeTexture(gl.TEXTURE0);
					gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
					gl.uniform1i(gl.getUniformLocation(roughEdgeProgram, "u_source"), 0);
					gl.uniform2f(
						gl.getUniformLocation(roughEdgeProgram, "u_noiseScale"),
						Math.max(0.01, noiseScale),
						Math.max(0.01, noiseScale)
					);
					gl.uniform1f(
						gl.getUniformLocation(roughEdgeProgram, "u_edgeSize"),
						Math.max(0, edgeSize)
					);
					gl.uniform1f(
						gl.getUniformLocation(roughEdgeProgram, "u_noiseIntensity"),
						Math.max(0, noiseIntensity)
					);
					gl.uniform1f(
						gl.getUniformLocation(roughEdgeProgram, "u_smooth"),
						0.3
					);
				},
			});
			if (gl.isContextLost() || gl.getError() !== gl.NO_ERROR) return null;
			return canvas;
		},
		dispose() {
			gl.deleteProgram(roughEdgeProgram);
			gl.deleteProgram(godRayProgram);
			gl.deleteProgram(flameProgram);
			gl.deleteTexture(sourceTexture);
			for (const texture of passTextures) gl.deleteTexture(texture);
			for (const framebuffer of framebuffers) {
				gl.deleteFramebuffer(framebuffer);
			}
			gl.deleteProgram(brightProgram);
			gl.deleteProgram(blurProgram);
			gl.deleteProgram(compositeProgram);
			allocatedWidth = 0;
			allocatedHeight = 0;
		},
	};
}

let cachedPass: TextAnimationGpuPass | null | undefined;

/**
 * The shared GPU pass, or null when WebGL2 is unavailable. Failure is cached:
 * a machine without WebGL2 should not retry context creation every frame.
 */
export function getTextAnimationGpuPass(): TextAnimationGpuPass | null {
	if (cachedPass === undefined) cachedPass = createTextAnimationGpuPass();
	return cachedPass;
}

/** Test hook: drop the cached pass so availability is re-probed. */
export function resetTextAnimationGpuPass(): void {
	cachedPass?.dispose();
	cachedPass = undefined;
}
