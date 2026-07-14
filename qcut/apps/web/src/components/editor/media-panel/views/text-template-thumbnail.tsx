import { colorWithOpacity } from "@/lib/text/text-style";
import type { TextTemplateDefinition } from "@/lib/text/text-template-registry";
import { cn } from "@/lib/utils";
import type { TextElement } from "@/types/timeline";
import type { CSSProperties } from "react";

function getPreviewFrameStyle({
	definition,
	template,
}: {
	definition: TextTemplateDefinition;
	template: TextElement;
}): CSSProperties {
	const backgroundColor =
		(template.backgroundOpacity ?? 0) > 0
			? colorWithOpacity(
					template.backgroundColor,
					template.backgroundOpacity ?? 0
				)
			: "#3a3a3a";
	const variantBackgrounds: Record<string, string> = {
		"blue-ice":
			"radial-gradient(circle at 28% 18%, rgba(255,255,255,.45), transparent 22%), linear-gradient(135deg, #0f172a, #0369a1 48%, #7dd3fc)",
		candy:
			"repeating-linear-gradient(135deg, rgba(255,255,255,.2) 0 7px, transparent 7px 15px), linear-gradient(135deg, #831843, #f9a8d4)",
		chrome:
			"linear-gradient(135deg, #171717, #737373 36%, #fafafa 45%, #262626 68%, #a3a3a3)",
		comic:
			"radial-gradient(circle at 18% 22%, rgba(255,255,255,.55) 0 2px, transparent 3px), conic-gradient(from 30deg at 50% 55%, #facc15, #ef4444, #f97316, #facc15)",
		fire: "radial-gradient(circle at 50% 82%, #facc15 0 10%, #fb923c 18%, #b91c1c 45%, #3a3a3a 46%)",
		glass:
			"linear-gradient(135deg, rgba(255,255,255,.28), rgba(34,211,238,.18)), #28333a",
		glitch:
			"linear-gradient(90deg, rgba(34,211,238,.3), transparent 18%, rgba(244,114,182,.28) 44%, transparent 70%), #343438",
		gold: "linear-gradient(135deg, #2b1d08, #8a5a12 36%, #facc15 48%, #3a2b11 70%)",
		"gradient-duotone":
			"linear-gradient(135deg, #7c3aed, #ec4899 46%, #f97316)",
		"gradient-shine": "linear-gradient(135deg, #0891b2, #9333ea 46%, #fb7185)",
		"green-fresh":
			"radial-gradient(circle at 70% 18%, rgba(220,252,231,.7), transparent 22%), linear-gradient(135deg, #14532d, #16a34a 52%, #bef264)",
		ink: "radial-gradient(circle at 30% 25%, rgba(255,255,255,.2), transparent 30%), linear-gradient(135deg, #e7e5e4, #57534e)",
		lava: "radial-gradient(circle at 55% 76%, #facc15 0 12%, #ef4444 30%, #450a0a 62%, #1c1917)",
		pixel:
			"linear-gradient(45deg, rgba(255,255,255,.08) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,.08) 25%, transparent 25%), #353535",
		"pink-heart":
			"radial-gradient(circle at 25% 20%, rgba(255,255,255,.5), transparent 18%), linear-gradient(135deg, #be185d, #f9a8d4)",
		"purple-dream":
			"radial-gradient(circle at 30% 24%, rgba(255,255,255,.35), transparent 18%), linear-gradient(135deg, #2e1065, #7c3aed 48%, #f0abfc)",
		"red-burst":
			"conic-gradient(from 8deg at 50% 52%, #7f1d1d 0 8deg, #ef4444 8deg 18deg, #facc15 18deg 25deg, #b91c1c 25deg 38deg)",
		"texture-grain":
			"radial-gradient(circle at 18% 22%, rgba(255,255,255,.16) 0 1px, transparent 2px), radial-gradient(circle at 70% 68%, rgba(0,0,0,.22) 0 1px, transparent 2px), linear-gradient(135deg, #57534e, #292524)",
		"torn-paper":
			"linear-gradient(174deg, transparent 0 12%, rgba(255,255,255,.88) 13% 74%, transparent 75%), #3f3f46",
		warning:
			"repeating-linear-gradient(-45deg, rgba(0,0,0,.28) 0 8px, transparent 8px 16px), #4a421d",
	};

	return {
		background: variantBackgrounds[definition.variantId] ?? backgroundColor,
	};
}

function getPreviewTextShadow({
	definition,
	template,
}: {
	definition: TextTemplateDefinition;
	template: TextElement;
}): string | undefined {
	const shadows: string[] = [];
	if ((template.shadowOpacity ?? 0) > 0) {
		shadows.push(
			`${template.shadowOffsetX ?? 0}px ${template.shadowOffsetY ?? 0}px ${template.shadowBlur ?? 0}px ${colorWithOpacity(template.shadowColor ?? "#000000", template.shadowOpacity ?? 0)}`
		);
	}
	if ((template.glowOpacity ?? 0) > 0) {
		shadows.push(
			`0 0 ${template.glowBlur ?? 12}px ${colorWithOpacity(template.glowColor ?? "#ffffff", template.glowOpacity ?? 0)}`
		);
	}
	if (definition.variantId === "glitch") {
		shadows.push("-4px 0 0 #22d3ee", "4px 0 0 #fb7185");
	}
	if (definition.variantId === "fire" || definition.variantId === "lava") {
		shadows.push("0 -10px 14px rgba(251,146,60,.8)");
	}
	if (definition.variantId === "red-burst") {
		shadows.push("3px 3px 0 #111827", "-2px -2px 0 #facc15");
	}
	if (definition.variantId === "blue-ice") {
		shadows.push("0 0 12px rgba(125,211,252,.9)");
	}
	return shadows.length > 0 ? shadows.join(", ") : undefined;
}

function getPreviewTextStyle({
	definition,
	previewStrokeWidth,
	template,
}: {
	definition: TextTemplateDefinition;
	previewStrokeWidth: number;
	template: TextElement;
}): CSSProperties {
	const gradientTextByVariant: Record<string, string> = {
		"blue-ice": "linear-gradient(180deg, #ffffff, #7dd3fc 58%, #2563eb)",
		chrome: "linear-gradient(180deg, #ffffff, #71717a 48%, #f8fafc)",
		gold: "linear-gradient(180deg, #fff7ed, #facc15 48%, #92400e)",
		"gradient-duotone": "linear-gradient(90deg, #ffffff, #f0abfc 45%, #fb7185)",
		"gradient-shine": "linear-gradient(90deg, #ecfeff, #67e8f9 36%, #f9a8d4)",
		lava: "linear-gradient(180deg, #fff7ed, #facc15 40%, #ef4444)",
		"purple-dream": "linear-gradient(180deg, #ffffff, #c084fc 58%, #7c3aed)",
		"texture-grain": "linear-gradient(180deg, #fafaf9, #a8a29e 55%, #57534e)",
	};
	const gradientText = gradientTextByVariant[definition.variantId];

	return {
		backgroundClip: gradientText ? "text" : undefined,
		backgroundImage: gradientText,
		color: gradientText ? "transparent" : template.color,
		fontFamily: template.fontFamily,
		fontStyle: template.fontStyle,
		fontWeight: template.fontWeight,
		letterSpacing: template.letterSpacing,
		textShadow: getPreviewTextShadow({ definition, template }),
		transform: `rotate(${template.rotation ?? 0}deg)`,
		WebkitBackgroundClip: gradientText ? "text" : undefined,
		WebkitTextFillColor: gradientText ? "transparent" : undefined,
		WebkitTextStroke:
			previewStrokeWidth > 0
				? `${previewStrokeWidth}px ${template.strokeColor}`
				: undefined,
	};
}

function PreviewOrnaments({ variantId }: { variantId: string }) {
	if (variantId === "fire" || variantId === "lava") {
		return (
			<>
				<div className="-translate-x-1/2 pointer-events-none absolute bottom-2 left-1/2 h-9 w-16 rounded-full bg-orange-400/55 blur-md" />
				<div className="pointer-events-none absolute bottom-3 left-5 h-8 w-3 rotate-12 rounded-full bg-yellow-300/55 blur-[1px]" />
				<div className="pointer-events-none absolute bottom-4 right-6 h-10 w-4 -rotate-12 rounded-full bg-red-500/45 blur-[1px]" />
			</>
		);
	}
	if (variantId === "glitch") {
		return (
			<>
				<div className="pointer-events-none absolute inset-x-2 top-5 h-px bg-cyan-300/80" />
				<div className="pointer-events-none absolute inset-x-5 bottom-7 h-px bg-pink-300/80" />
				<div className="pointer-events-none absolute left-2 top-1/2 h-2 w-10 bg-cyan-300/30" />
			</>
		);
	}
	if (variantId === "sticker" || variantId === "pink-heart") {
		return (
			<div className="pointer-events-none absolute inset-4 rounded-[1.2rem] bg-white shadow-[0_0_0_5px_rgba(255,255,255,.65)]" />
		);
	}
	if (variantId === "cutout" || variantId === "torn-paper") {
		return (
			<div className="pointer-events-none absolute inset-5 translate-x-1 translate-y-1 rounded-md bg-black/35" />
		);
	}
	if (variantId === "gradient-shine" || variantId === "gradient-duotone") {
		return (
			<div className="pointer-events-none absolute -left-4 top-0 h-full w-7 rotate-12 bg-white/30 blur-sm" />
		);
	}
	if (variantId === "texture-grain") {
		return (
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_28%,rgba(255,255,255,.22)_0_1px,transparent_2px),radial-gradient(circle_at_72%_66%,rgba(0,0,0,.24)_0_1px,transparent_2px)] opacity-80" />
		);
	}
	return null;
}

export function TextTemplateThumbnail({
	definition,
	template,
}: {
	definition: TextTemplateDefinition;
	template: TextElement;
}) {
	const previewStrokeWidth = Math.min(
		2.1,
		Math.max(0, template.strokeWidth ?? 0) * 0.28
	);

	return (
		<div
			className="absolute inset-0 flex items-center justify-center overflow-hidden p-2.5"
			style={getPreviewFrameStyle({ definition, template })}
		>
			<PreviewOrnaments variantId={definition.variantId} />
			<span
				className={cn(
					"relative z-10 max-w-full select-none break-words text-center text-[1rem] leading-none",
					definition.variantId === "pixel" && "font-mono",
					definition.variantId === "stamp" &&
						"border-2 border-current px-2 py-1"
				)}
				style={getPreviewTextStyle({
					definition,
					previewStrokeWidth,
					template,
				})}
			>
				{template.content}
			</span>
		</div>
	);
}
