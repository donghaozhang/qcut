import { useEffect, useRef, useState, type ReactNode } from "react";
import {
	TRANSITION_LAB_VERTEX_SHADER,
	type TransitionLabRecipe,
} from "../../../../../../../../electron/native-pipeline/transitions/transition-lab-catalog";
import { cn } from "@/lib/utils";

type ShaderPreviewStatus = "loading" | "ready" | "failed";

function compileShader({
	context,
	source,
	type,
}: {
	context: WebGLRenderingContext;
	source: string;
	type: number;
}): WebGLShader {
	const shader = context.createShader(type);
	if (!shader) throw new Error("Unable to allocate a WebGL shader");
	context.shaderSource(shader, source);
	context.compileShader(shader);
	if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
		const message = context.getShaderInfoLog(shader) || "Unknown shader error";
		context.deleteShader(shader);
		throw new Error(`Transition Lab shader compilation failed: ${message}`);
	}
	return shader;
}

function linkProgram({
	context,
	fragmentSource,
}: {
	context: WebGLRenderingContext;
	fragmentSource: string;
}): WebGLProgram {
	const vertexShader = compileShader({
		context,
		source: TRANSITION_LAB_VERTEX_SHADER,
		type: context.VERTEX_SHADER,
	});
	const fragmentShader = compileShader({
		context,
		source: fragmentSource,
		type: context.FRAGMENT_SHADER,
	});
	const program = context.createProgram();
	if (!program) throw new Error("Unable to allocate a WebGL program");
	context.attachShader(program, vertexShader);
	context.attachShader(program, fragmentShader);
	context.linkProgram(program);
	context.deleteShader(vertexShader);
	context.deleteShader(fragmentShader);
	if (!context.getProgramParameter(program, context.LINK_STATUS)) {
		const message = context.getProgramInfoLog(program) || "Unknown link error";
		context.deleteProgram(program);
		throw new Error(`Transition Lab shader linking failed: ${message}`);
	}
	return program;
}

function loadImage({ source }: { source: string }): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.decoding = "async";
		if (/^https?:\/\//i.test(source)) image.crossOrigin = "anonymous";
		image.onload = () => resolve(image);
		image.onerror = () =>
			reject(
				new Error(`Transition Lab preview image failed to load: ${source}`)
			);
		image.src = source;
	});
}

function createTexture({
	context,
	image,
}: {
	context: WebGLRenderingContext;
	image: HTMLImageElement;
}): WebGLTexture {
	const texture = context.createTexture();
	if (!texture) throw new Error("Unable to allocate a WebGL texture");
	context.bindTexture(context.TEXTURE_2D, texture);
	context.pixelStorei(context.UNPACK_FLIP_Y_WEBGL, 1);
	context.texParameteri(
		context.TEXTURE_2D,
		context.TEXTURE_WRAP_S,
		context.CLAMP_TO_EDGE
	);
	context.texParameteri(
		context.TEXTURE_2D,
		context.TEXTURE_WRAP_T,
		context.CLAMP_TO_EDGE
	);
	context.texParameteri(
		context.TEXTURE_2D,
		context.TEXTURE_MIN_FILTER,
		context.LINEAR
	);
	context.texParameteri(
		context.TEXTURE_2D,
		context.TEXTURE_MAG_FILTER,
		context.LINEAR
	);
	context.texImage2D(
		context.TEXTURE_2D,
		0,
		context.RGBA,
		context.RGBA,
		context.UNSIGNED_BYTE,
		image
	);
	return texture;
}

function easedProgress({
	progress,
	easing,
}: {
	progress: number;
	easing: TransitionLabRecipe["clip"]["easing"];
}): number {
	if (easing === "linear") return progress;
	if (easing === "easeInOutQuint") {
		return progress < 0.5 ? 16 * progress ** 5 : 1 - 16 * (1 - progress) ** 5;
	}
	return progress < 0.5
		? 4 * progress * progress * progress
		: 1 - (-2 * progress + 2) ** 3 / 2;
}

function drawShaderFrame({
	activateProgram,
	buffer,
	canvas,
	context,
	fromLocation,
	fromTexture,
	intensity,
	intensityLocation,
	positionLocation,
	program,
	progress,
	progressLocation,
	resolutionLocation,
	toLocation,
	toTexture,
}: {
	activateProgram: WebGLRenderingContext["useProgram"];
	buffer: WebGLBuffer;
	canvas: HTMLCanvasElement;
	context: WebGLRenderingContext;
	fromLocation: WebGLUniformLocation | null;
	fromTexture: WebGLTexture;
	intensity: number;
	intensityLocation: WebGLUniformLocation | null;
	positionLocation: number;
	program: WebGLProgram;
	progress: number;
	progressLocation: WebGLUniformLocation | null;
	resolutionLocation: WebGLUniformLocation | null;
	toLocation: WebGLUniformLocation | null;
	toTexture: WebGLTexture;
}) {
	const pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2);
	const width = Math.max(1, Math.round(canvas.clientWidth * pixelRatio));
	const height = Math.max(1, Math.round(canvas.clientHeight * pixelRatio));
	if (canvas.width !== width || canvas.height !== height) {
		canvas.width = width;
		canvas.height = height;
	}
	context.viewport(0, 0, width, height);
	activateProgram(program);
	context.bindBuffer(context.ARRAY_BUFFER, buffer);
	context.enableVertexAttribArray(positionLocation);
	context.vertexAttribPointer(positionLocation, 2, context.FLOAT, false, 0, 0);
	context.activeTexture(context.TEXTURE0);
	context.bindTexture(context.TEXTURE_2D, fromTexture);
	context.uniform1i(fromLocation, 0);
	context.activeTexture(context.TEXTURE1);
	context.bindTexture(context.TEXTURE_2D, toTexture);
	context.uniform1i(toLocation, 1);
	context.uniform1f(progressLocation, progress);
	context.uniform1f(intensityLocation, intensity);
	context.uniform2f(resolutionLocation, width, height);
	context.drawArrays(context.TRIANGLES, 0, 6);
}

export function ShaderTransitionPreview({
	duration,
	fallback,
	fromSource,
	isPlaying,
	recipe,
	toSource,
}: {
	duration: number;
	fallback: ReactNode;
	fromSource: string;
	isPlaying: boolean;
	recipe: TransitionLabRecipe;
	toSource: string;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const drawRef = useRef<((progress: number) => void) | null>(null);
	const [status, setStatus] = useState<ShaderPreviewStatus>("loading");

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		if (typeof WebGLRenderingContext === "undefined") {
			setStatus("failed");
			return;
		}
		const context = canvas.getContext("webgl", {
			alpha: false,
			antialias: true,
			premultipliedAlpha: false,
		});
		if (!context) {
			setStatus("failed");
			return;
		}

		let disposed = false;
		let program: WebGLProgram | null = null;
		let buffer: WebGLBuffer | null = null;
		let fromTexture: WebGLTexture | null = null;
		let toTexture: WebGLTexture | null = null;
		setStatus("loading");

		const initialize = async () => {
			try {
				const [fromImage, toImage] = await Promise.all([
					loadImage({ source: fromSource }),
					loadImage({ source: toSource }),
				]);
				if (disposed) return;
				const activeProgram = linkProgram({
					context,
					fragmentSource: recipe.shader.fragmentSource,
				});
				program = activeProgram;
				const activeBuffer = context.createBuffer();
				if (!activeBuffer) {
					throw new Error("Unable to allocate a WebGL vertex buffer");
				}
				buffer = activeBuffer;
				context.bindBuffer(context.ARRAY_BUFFER, activeBuffer);
				context.bufferData(
					context.ARRAY_BUFFER,
					new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
					context.STATIC_DRAW
				);
				const activeFromTexture = createTexture({ context, image: fromImage });
				const activeToTexture = createTexture({ context, image: toImage });
				fromTexture = activeFromTexture;
				toTexture = activeToTexture;

				const positionLocation = context.getAttribLocation(
					activeProgram,
					"aPosition"
				);
				const fromLocation = context.getUniformLocation(activeProgram, "uFrom");
				const toLocation = context.getUniformLocation(activeProgram, "uTo");
				const progressLocation = context.getUniformLocation(
					activeProgram,
					"uProgress"
				);
				const intensityLocation = context.getUniformLocation(
					activeProgram,
					"uIntensity"
				);
				const resolutionLocation = context.getUniformLocation(
					activeProgram,
					"uResolution"
				);
				const activateProgram = context.useProgram.bind(context);

				drawRef.current = (progress) => {
					if (disposed) return;
					drawShaderFrame({
						activateProgram,
						buffer: activeBuffer,
						canvas,
						context,
						fromLocation,
						fromTexture: activeFromTexture,
						intensity: recipe.clip.tuning?.intensity ?? 1,
						intensityLocation,
						positionLocation,
						program: activeProgram,
						progress: easedProgress({
							progress,
							easing: recipe.clip.easing,
						}),
						progressLocation,
						resolutionLocation,
						toLocation,
						toTexture: activeToTexture,
					});
				};
				drawRef.current(0);
				setStatus("ready");
			} catch {
				if (!disposed) setStatus("failed");
			}
		};

		initialize();
		return () => {
			disposed = true;
			drawRef.current = null;
			if (fromTexture) context.deleteTexture(fromTexture);
			if (toTexture) context.deleteTexture(toTexture);
			if (buffer) context.deleteBuffer(buffer);
			if (program) context.deleteProgram(program);
		};
	}, [fromSource, recipe, toSource]);

	useEffect(() => {
		if (status !== "ready") return;
		if (!isPlaying) {
			drawRef.current?.(0);
			return;
		}

		let animationFrame = 0;
		let startedAt: number | null = null;
		const durationMs = Math.max(400, duration * 1000);
		const draw = (timestamp: number) => {
			startedAt ??= timestamp;
			const progress = ((timestamp - startedAt) % durationMs) / durationMs;
			drawRef.current?.(progress);
			animationFrame = requestAnimationFrame(draw);
		};
		animationFrame = requestAnimationFrame(draw);
		return () => cancelAnimationFrame(animationFrame);
	}, [duration, isPlaying, status]);

	return (
		<div className="relative h-full w-full" data-shader-status={status}>
			{fallback}
			<canvas
				ref={canvasRef}
				className={cn(
					"pointer-events-none absolute inset-0 size-full",
					status === "ready" ? "opacity-100" : "opacity-0"
				)}
				data-testid={`transition-lab-canvas-${recipe.id}`}
			/>
		</div>
	);
}
