import {
	sampleEffectParticles,
	type EffectDecorationRenderStage,
	type EffectDecorationVariant,
	type EffectParticleRenderStage,
	type EffectRenderProgram,
	type SampledEffectParticle,
} from "@qcut/editor-core";

/**
 * Shared procedural drawing for particle/decoration render stages.
 *
 * The live preview components (effect-particle-canvas.tsx,
 * effect-decoration-canvas.tsx) and the headless export baker
 * (effect-procedural-sources.ts) all paint through these functions so the
 * exported MP4 matches the preview pixel-for-pixel.
 */
export type ProceduralCanvasContext =
	| CanvasRenderingContext2D
	| OffscreenCanvasRenderingContext2D;

export function particleStages({
	program,
}: {
	program?: EffectRenderProgram;
}): EffectParticleRenderStage[] {
	return (
		program?.stages.filter(
			(stage): stage is EffectParticleRenderStage => stage.kind === "particles"
		) ?? []
	);
}

export function decorationStages({
	program,
}: {
	program?: EffectRenderProgram;
}): EffectDecorationRenderStage[] {
	return (
		program?.stages.filter(
			(stage): stage is EffectDecorationRenderStage =>
				stage.kind === "decoration"
		) ?? []
	);
}

/** Decorations that render identically for every frame (export bakes 1 frame). */
const STATIC_DECORATION_VARIANTS: ReadonlySet<EffectDecorationVariant> =
	new Set(["grid", "glass-shatter", "dashed-ring", "letterbox"]);

/** Static decorations render identically for every frame (bake 1 frame). */
export function isDecorationStageAnimated({
	stage,
}: {
	stage: EffectDecorationRenderStage;
}): boolean {
	return !STATIC_DECORATION_VARIANTS.has(stage.variant);
}

/** Deterministic hash → [0, 1). Keeps static layouts identical across frames. */
function hash01({ seed }: { seed: number }): number {
	const value = Math.sin(seed * 127.1 + 311.7) * 43_758.545_312;
	return value - Math.floor(value);
}

function drawParticle({
	context,
	stage,
	particle,
	width,
	height,
}: {
	context: ProceduralCanvasContext;
	stage: EffectParticleRenderStage;
	particle: SampledEffectParticle;
	width: number;
	height: number;
}) {
	const minSide = Math.min(width, height);
	const px = particle.x * width;
	const py = particle.y * height;
	const size = Math.max(1, particle.size * minSide);
	context.globalAlpha = particle.opacity;

	if (stage.variant === "fog") {
		const gradient = context.createRadialGradient(px, py, 0, px, py, size);
		gradient.addColorStop(0, stage.color);
		gradient.addColorStop(1, "rgba(255,255,255,0)");
		context.fillStyle = gradient;
		context.beginPath();
		context.arc(px, py, size, 0, Math.PI * 2);
		context.fill();
		return;
	}

	if (stage.variant === "embers" || stage.variant === "stars") {
		const gradient = context.createRadialGradient(px, py, 0, px, py, size * 2);
		gradient.addColorStop(0, stage.color);
		gradient.addColorStop(1, "rgba(0,0,0,0)");
		context.fillStyle = gradient;
		context.beginPath();
		context.arc(px, py, size * 2, 0, Math.PI * 2);
		context.fill();
		return;
	}

	if (stage.variant === "rain") {
		// Raindrop: a thin, slightly slanted streak (size is the streak length).
		const slant = size * 0.16;
		context.strokeStyle = stage.color;
		context.lineWidth = Math.max(1, size * 0.07);
		context.lineCap = "round";
		context.beginPath();
		context.moveTo(px + slant, py - size);
		context.lineTo(px, py);
		context.stroke();
		return;
	}

	if (stage.variant === "confetti") {
		context.save();
		context.translate(px, py);
		context.rotate((particle.rotation * Math.PI) / 180);
		context.fillStyle = stage.color;
		context.fillRect(-size / 2, -size, size, size * 2);
		context.restore();
		return;
	}

	if (stage.variant === "coins") {
		// Spinning gold coin: width oscillates with rotation to fake a flip.
		context.save();
		context.translate(px, py);
		const flip = Math.abs(Math.cos((particle.rotation * Math.PI) / 180));
		context.fillStyle = stage.color;
		context.beginPath();
		context.ellipse(0, 0, Math.max(0.5, size * flip), size, 0, 0, Math.PI * 2);
		context.fill();
		context.restore();
		return;
	}

	if (stage.variant === "butterfly") {
		context.save();
		context.translate(px, py);
		context.rotate(
			(Math.sin((particle.rotation * Math.PI) / 180) * 20 * Math.PI) / 180
		);
		context.fillStyle = stage.color;
		// Two wings that flap: wing width follows the rotation phase.
		const flap =
			0.4 + 0.6 * Math.abs(Math.sin((particle.rotation * Math.PI) / 90));
		for (const dir of [-1, 1]) {
			context.beginPath();
			context.ellipse(
				dir * size * 0.6 * flap,
				0,
				size * flap,
				size * 0.7,
				0,
				0,
				Math.PI * 2
			);
			context.fill();
		}
		context.restore();
		return;
	}

	if (stage.variant === "sakura") {
		context.save();
		context.translate(px, py);
		context.rotate((particle.rotation * Math.PI) / 180);
		context.fillStyle = stage.color;
		context.beginPath();
		context.ellipse(0, 0, size, size * 0.6, 0, 0, Math.PI * 2);
		context.fill();
		context.restore();
		return;
	}

	// snow (default): soft round flakes
	context.fillStyle = stage.color;
	context.beginPath();
	context.arc(px, py, size, 0, Math.PI * 2);
	context.fill();
}

/** Draws one particle stage for one point in time. Caller clears the canvas. */
export function drawParticleStageFrame({
	context,
	stage,
	timeSeconds,
	width,
	height,
}: {
	context: ProceduralCanvasContext;
	stage: EffectParticleRenderStage;
	timeSeconds: number;
	width: number;
	height: number;
}) {
	const aspectRatio = height > 0 ? width / height : 16 / 9;
	const particles = sampleEffectParticles({ stage, timeSeconds, aspectRatio });
	for (const particle of particles) {
		drawParticle({ context, stage, particle, width, height });
	}
	context.globalAlpha = 1;
}

interface DecorationDrawArgs {
	context: ProceduralCanvasContext;
	stage: EffectDecorationRenderStage;
	width: number;
	height: number;
	timeSeconds: number;
}

function drawGrid({
	context,
	stage,
	width,
	height,
}: Omit<DecorationDrawArgs, "timeSeconds">) {
	const rows = 4;
	const columns = 6;
	context.globalAlpha = stage.opacity;
	context.strokeStyle = stage.color;
	context.lineWidth = Math.max(1, Math.round(Math.min(width, height) / 220));
	context.beginPath();
	for (let row = 1; row < rows; row += 1) {
		const y = Math.round((row / rows) * height);
		context.moveTo(0, y);
		context.lineTo(width, y);
	}
	for (let column = 1; column < columns; column += 1) {
		const x = Math.round((column / columns) * width);
		context.moveTo(x, 0);
		context.lineTo(x, height);
	}
	context.stroke();
	context.globalAlpha = 1;
}

function drawRainbowRays({
	context,
	stage,
	width,
	height,
	timeSeconds,
}: DecorationDrawArgs) {
	const centerX = width / 2;
	const centerY = height / 2;
	const radius = Math.hypot(width, height);
	const rayCount = 14;
	const rotation = timeSeconds * 0.25;
	const hueBase = (timeSeconds * 30) % 360;
	context.globalAlpha = stage.opacity;
	context.globalCompositeOperation = "screen";
	for (let index = 0; index < rayCount; index += 1) {
		const start = rotation + (index / rayCount) * Math.PI * 2;
		const end = start + (Math.PI * 2) / rayCount / 2;
		const hue = (hueBase + (index / rayCount) * 360) % 360;
		context.beginPath();
		context.moveTo(centerX, centerY);
		context.arc(centerX, centerY, radius, start, end);
		context.closePath();
		context.fillStyle = `hsla(${hue}, 90%, 60%, 0.5)`;
		context.fill();
	}
	context.globalCompositeOperation = "source-over";
	context.globalAlpha = 1;
}

function drawFilmEnd({
	context,
	stage,
	width,
	height,
	timeSeconds,
}: DecorationDrawArgs) {
	// Letterbox bars + a centered "全剧终" title that fades in.
	const barHeight = Math.round(height * 0.14);
	context.globalAlpha = stage.opacity;
	context.fillStyle = "#000000";
	context.fillRect(0, 0, width, barHeight);
	context.fillRect(0, height - barHeight, width, barHeight);
	const fade = Math.min(1, timeSeconds / 1.2);
	context.globalAlpha = stage.opacity * (0.35 + 0.4 * fade);
	context.fillRect(0, 0, width, height);
	context.globalAlpha = fade * stage.opacity;
	context.fillStyle = stage.color;
	context.textAlign = "center";
	context.textBaseline = "middle";
	context.font = `600 ${Math.round(height * 0.14)}px "Noto Sans SC", sans-serif`;
	context.fillText("全剧终", width / 2, height / 2);
	context.globalAlpha = 1;
}

function drawIris({
	context,
	stage,
	width,
	height,
	timeSeconds,
}: DecorationDrawArgs) {
	// 开幕: black closes in around a growing circular reveal.
	const progress = Math.min(1, timeSeconds / 1.6);
	const maxRadius = Math.hypot(width, height) / 2;
	const radius = progress * maxRadius;
	context.save();
	context.globalAlpha = stage.opacity;
	context.fillStyle = "#000000";
	context.fillRect(0, 0, width, height);
	context.globalCompositeOperation = "destination-out";
	context.beginPath();
	context.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
	context.fill();
	context.restore();
}

function drawStandby({
	context,
	stage,
	width,
	height,
	timeSeconds,
}: DecorationDrawArgs) {
	// 悬浮待机: viewfinder corner brackets, REC dot, and a sweeping scanline.
	context.globalAlpha = stage.opacity;
	context.strokeStyle = stage.color;
	context.lineWidth = Math.max(1, Math.round(Math.min(width, height) / 90));
	const margin = Math.round(Math.min(width, height) * 0.06);
	const armX = Math.round(width * 0.08);
	const armY = Math.round(height * 0.12);
	const corners = [
		[margin, margin, 1, 1],
		[width - margin, margin, -1, 1],
		[margin, height - margin, 1, -1],
		[width - margin, height - margin, -1, -1],
	] as const;
	for (const [cx, cy, sx, sy] of corners) {
		context.beginPath();
		context.moveTo(cx + sx * armX, cy);
		context.lineTo(cx, cy);
		context.lineTo(cx, cy + sy * armY);
		context.stroke();
	}
	const scanY = (timeSeconds * 0.35 * height) % height;
	context.globalAlpha = stage.opacity * 0.5;
	context.beginPath();
	context.moveTo(0, scanY);
	context.lineTo(width, scanY);
	context.stroke();
	context.globalAlpha = stage.opacity;
	context.fillStyle = "#ff3b3b";
	const dot = Math.max(2, Math.round(Math.min(width, height) / 45));
	context.beginPath();
	context.arc(margin + dot * 2, margin + dot * 2, dot, 0, Math.PI * 2);
	context.fill();
	context.globalAlpha = 1;
}

function drawBurst({
	context,
	stage,
	width,
	height,
	timeSeconds,
}: DecorationDrawArgs) {
	// 射线爆闪: bright radial rays that pulse.
	const pulse = 0.4 + 0.6 * Math.abs(Math.sin(timeSeconds * 6));
	const centerX = width / 2;
	const centerY = height / 2;
	const radius = Math.hypot(width, height);
	const rayCount = 24;
	context.save();
	context.globalCompositeOperation = "screen";
	context.globalAlpha = stage.opacity * pulse;
	context.fillStyle = stage.color;
	for (let index = 0; index < rayCount; index += 1) {
		const start = (index / rayCount) * Math.PI * 2;
		const end = start + (Math.PI * 2) / rayCount / 3;
		context.beginPath();
		context.moveTo(centerX, centerY);
		context.arc(centerX, centerY, radius, start, end);
		context.closePath();
		context.fill();
	}
	context.restore();
}

function drawLensFlare({
	context,
	stage,
	width,
	height,
	timeSeconds,
}: DecorationDrawArgs) {
	// 超大光斑: a bright core plus flare circles along a slow-moving diagonal.
	const t = (Math.sin(timeSeconds * 0.4) + 1) / 2;
	const sourceX = width * (0.2 + t * 0.6);
	const sourceY = height * 0.28;
	const centerX = width / 2;
	const centerY = height / 2;
	context.save();
	context.globalCompositeOperation = "screen";
	context.globalAlpha = stage.opacity;
	const core = context.createRadialGradient(
		sourceX,
		sourceY,
		0,
		sourceX,
		sourceY,
		Math.min(width, height) * 0.35
	);
	core.addColorStop(0, stage.color);
	core.addColorStop(1, "rgba(255,255,255,0)");
	context.fillStyle = core;
	context.fillRect(0, 0, width, height);
	for (const offset of [-0.4, 0.3, 0.7, 1.2]) {
		const fx = sourceX + (centerX - sourceX) * offset;
		const fy = sourceY + (centerY - sourceY) * offset;
		const r = Math.min(width, height) * (0.03 + 0.05 * Math.abs(offset));
		const flare = context.createRadialGradient(fx, fy, 0, fx, fy, r);
		flare.addColorStop(0, stage.color);
		flare.addColorStop(1, "rgba(255,255,255,0)");
		context.globalAlpha = stage.opacity * 0.5;
		context.fillStyle = flare;
		context.beginPath();
		context.arc(fx, fy, r, 0, Math.PI * 2);
		context.fill();
	}
	context.restore();
}

function drawFloatingText({
	context,
	stage,
	width,
	height,
	timeSeconds,
}: DecorationDrawArgs) {
	// 文字悬浮 / 祝福环绕: drifting sparkle glyphs for a festive floating layer.
	const glyphCount = 10;
	const size = Math.round(Math.min(width, height) * 0.09);
	context.globalAlpha = stage.opacity;
	context.fillStyle = stage.color;
	context.font = `600 ${size}px "Noto Sans SC", sans-serif`;
	context.textAlign = "center";
	context.textBaseline = "middle";
	for (let index = 0; index < glyphCount; index += 1) {
		const seed = Math.sin(index * 51.3) * 0.5 + 0.5;
		const drift = (timeSeconds * (0.02 + seed * 0.03)) % 1;
		const x = (Math.sin(index * 12.9 + timeSeconds * 0.5) * 0.5 + 0.5) * width;
		const y = ((seed + 1 - drift) % 1) * height;
		context.globalAlpha =
			stage.opacity * (0.5 + 0.5 * Math.abs(Math.sin(timeSeconds + index)));
		context.fillText("✦", x, y);
	}
	context.globalAlpha = 1;
}

function drawGlyphProps({
	context,
	stage,
	timeSeconds,
	width,
	height,
	glyphs,
	seed,
}: DecorationDrawArgs & { glyphs: readonly string[]; seed: number }) {
	const size = Math.round(Math.min(width, height) * 0.12);
	context.globalAlpha = stage.opacity;
	context.fillStyle = stage.color;
	context.font = `700 ${size}px "Noto Sans SC", sans-serif`;
	context.textAlign = "center";
	context.textBaseline = "middle";
	for (const [index, glyph] of glyphs.entries()) {
		const sway = Math.sin(timeSeconds * 2 + index * 1.7 + seed);
		const x = width * (0.5 + (index - (glyphs.length - 1) / 2) * 0.09);
		const y = height * 0.16 + sway * height * 0.03;
		context.globalAlpha =
			stage.opacity * (0.7 + 0.3 * Math.abs(Math.sin(timeSeconds * 3 + index)));
		context.fillText(glyph, x, y - Math.abs(sway) * 6);
	}
	context.globalAlpha = 1;
}

function drawHeartsOrbit({
	context,
	stage,
	timeSeconds,
	width,
	height,
}: DecorationDrawArgs) {
	const size = Math.round(Math.min(width, height) * 0.085);
	context.globalAlpha = stage.opacity;
	context.fillStyle = stage.color;
	context.font = `700 ${size}px "Noto Sans SC", sans-serif`;
	context.textAlign = "center";
	context.textBaseline = "middle";
	const count = 6;
	for (let index = 0; index < count; index += 1) {
		const angle = timeSeconds * 1.4 + (index / count) * Math.PI * 2;
		const x = width * 0.5 + Math.cos(angle) * width * 0.2;
		const y = height * 0.3 + Math.sin(angle) * height * 0.1;
		context.globalAlpha = stage.opacity * (0.55 + 0.45 * Math.sin(angle));
		context.fillText("♥", x, y);
	}
	context.globalAlpha = 1;
}

function drawGlassShatter({
	context,
	stage,
	width,
	height,
}: Omit<DecorationDrawArgs, "timeSeconds">) {
	// 玻璃破碎: a static spider web of cracks radiating from an impact point.
	// Seeded hashes keep the layout identical across preview frames and export.
	const impactX = width * 0.54;
	const impactY = height * 0.42;
	const minSide = Math.min(width, height);
	const maxRadius = Math.hypot(width, height) * 0.6;
	const crackCount = 14;
	const segments = 6;
	const angles: number[] = [];
	context.globalAlpha = stage.opacity;
	context.strokeStyle = stage.color;
	context.lineCap = "round";
	context.lineWidth = Math.max(1, minSide / 260);
	for (let index = 0; index < crackCount; index += 1) {
		const angle =
			(index / crackCount) * Math.PI * 2 +
			(hash01({ seed: index + 17 }) - 0.5) * 0.45;
		angles.push(angle);
		const length = maxRadius * (0.5 + hash01({ seed: index + 61 }) * 0.5);
		context.beginPath();
		context.moveTo(impactX, impactY);
		for (let segment = 1; segment <= segments; segment += 1) {
			const radius = (segment / segments) * length;
			const jitter = (hash01({ seed: index * 31 + segment * 7 }) - 0.5) * 0.2;
			context.lineTo(
				impactX + Math.cos(angle + jitter) * radius,
				impactY + Math.sin(angle + jitter) * radius
			);
		}
		context.stroke();
	}
	// Connecting web rings between neighbouring cracks.
	context.lineWidth = Math.max(1, minSide / 380);
	for (const [ringIndex, ringRatio] of [0.14, 0.3, 0.52].entries()) {
		context.beginPath();
		for (let index = 0; index <= crackCount; index += 1) {
			const angle = angles[index % crackCount];
			const wobble =
				1 + (hash01({ seed: index * 13 + ringIndex * 97 + 5 }) - 0.5) * 0.3;
			const radius = maxRadius * ringRatio * wobble;
			const x = impactX + Math.cos(angle) * radius;
			const y = impactY + Math.sin(angle) * radius;
			if (index === 0) context.moveTo(x, y);
			else context.lineTo(x, y);
		}
		context.stroke();
	}
	// Small solid impact chip where the cracks converge.
	context.fillStyle = stage.color;
	context.beginPath();
	context.arc(impactX, impactY, Math.max(2, minSide * 0.008), 0, Math.PI * 2);
	context.fill();
	context.lineCap = "butt";
	context.globalAlpha = 1;
}

/** 电影感画幅: fixed cinematic bars, sized to the 2.807:1 window Jianying uses. */
function drawLetterbox({
	context,
	stage,
	width,
	height,
}: Omit<DecorationDrawArgs, "timeSeconds">) {
	const visibleHeight = width / 2.807;
	const barHeight = Math.round((height - visibleHeight) / 2);
	if (barHeight <= 0) return;
	context.globalAlpha = stage.opacity;
	context.fillStyle = stage.color;
	context.fillRect(0, 0, width, barHeight);
	context.fillRect(0, height - barHeight, width, barHeight);
	context.globalAlpha = 1;
}

function drawDashedRing({
	context,
	stage,
	width,
	height,
}: Omit<DecorationDrawArgs, "timeSeconds">) {
	// 圆形虚线: a static centered dashed circle sized to the magnifier lens edge
	// (loupe radius ≈ 0.5 of the min canvas side; see sampleDistortionSource).
	const minSide = Math.min(width, height);
	const lineWidth = Math.max(2, minSide / 160);
	const radius = Math.max(1, minSide * 0.5 - lineWidth * 1.5);
	const dash = Math.max(6, minSide / 34);
	context.globalAlpha = stage.opacity;
	context.strokeStyle = stage.color;
	context.lineWidth = lineWidth;
	context.lineCap = "butt";
	context.setLineDash([dash, dash * 0.62]);
	context.beginPath();
	context.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
	context.stroke();
	context.setLineDash([]);
	context.globalAlpha = 1;
}

function drawHpBar({
	context,
	stage,
	timeSeconds,
	width,
	height,
}: DecorationDrawArgs) {
	const barWidth = width * 0.34;
	const barHeight = Math.max(6, height * 0.035);
	const x = (width - barWidth) / 2;
	const y = height * 0.08;
	const drain = 0.25 + 0.65 * Math.abs(Math.sin(timeSeconds * 0.9));
	context.globalAlpha = stage.opacity;
	context.fillStyle = "rgba(20,20,24,0.82)";
	context.fillRect(x - 3, y - 3, barWidth + 6, barHeight + 6);
	context.fillStyle = stage.color;
	context.fillRect(x, y, barWidth * drain, barHeight);
	context.strokeStyle = "#ffffff";
	context.lineWidth = Math.max(1, barHeight * 0.14);
	context.strokeRect(x - 3, y - 3, barWidth + 6, barHeight + 6);
	context.globalAlpha = 1;
}

/** Draws one decoration stage for one point in time. Caller clears the canvas. */
export function drawDecorationStageFrame({
	context,
	stage,
	timeSeconds,
	width,
	height,
}: {
	context: ProceduralCanvasContext;
	stage: EffectDecorationRenderStage;
	timeSeconds: number;
	width: number;
	height: number;
}) {
	const args = { context, stage, width, height, timeSeconds };
	if (stage.variant === "grid") {
		drawGrid({ context, stage, width, height });
	} else if (stage.variant === "rainbow-rays") {
		drawRainbowRays(args);
	} else if (stage.variant === "film-end") {
		drawFilmEnd(args);
	} else if (stage.variant === "iris") {
		drawIris(args);
	} else if (stage.variant === "standby") {
		drawStandby(args);
	} else if (stage.variant === "burst") {
		drawBurst(args);
	} else if (stage.variant === "lens-flare") {
		drawLensFlare(args);
	} else if (stage.variant === "question-marks") {
		drawGlyphProps({ ...args, glyphs: ["?", "?", "?"], seed: 1 });
	} else if (stage.variant === "idea-bulb") {
		drawGlyphProps({ ...args, glyphs: ["!", "💡"], seed: 4 });
	} else if (stage.variant === "anger-burst") {
		drawGlyphProps({ ...args, glyphs: ["💢", "＃"], seed: 7 });
	} else if (stage.variant === "hearts-orbit") {
		drawHeartsOrbit(args);
	} else if (stage.variant === "hp-bar") {
		drawHpBar(args);
	} else if (stage.variant === "glass-shatter") {
		drawGlassShatter({ context, stage, width, height });
	} else if (stage.variant === "dashed-ring") {
		drawDashedRing({ context, stage, width, height });
	} else if (stage.variant === "letterbox") {
		drawLetterbox({ context, stage, width, height });
	} else {
		drawFloatingText(args);
	}
}
