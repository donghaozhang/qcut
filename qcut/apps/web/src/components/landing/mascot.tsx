"use client";

import { type MotionValue, motion, useAnimationFrame } from "motion/react";
import { useRef, useState } from "react";
import { CLIP_EDGES, CLIP_RANGES } from "./timeline-decoration";

type MascotState =
	| "idle"
	| "thinking_generate"
	| "generating"
	| "thinking_cut"
	| "cutting";

// Thresholds as % of playhead progress (0–100)
const THINK_GENERATE_AT = 20;
const GENERATE_AT = 25;
const GENERATE_END = 35;
const THINK_CUT_AT = 55;
const CUT_AT = 60;
const CUT_END = 65;

// How close (in %) the playhead needs to be to a clip edge to trigger a reaction
const EDGE_PROXIMITY = 1.5;
const WHITE_HEX = "#FFFFFF";

function deriveState(progress: number): MascotState {
	const p = progress * 100;
	if (p >= THINK_GENERATE_AT && p < GENERATE_AT) return "thinking_generate";
	if (p >= GENERATE_AT && p < GENERATE_END) return "generating";
	if (p >= THINK_CUT_AT && p < CUT_AT) return "thinking_cut";
	if (p >= CUT_AT && p < CUT_END) return "cutting";
	return "idle";
}

function isNearClipEdge(pos: number): boolean {
	for (const edge of CLIP_EDGES) {
		if (Math.abs(pos - edge) < EDGE_PROXIMITY) return true;
	}
	return false;
}

function isOverClip(pos: number): boolean {
	for (const [left, right] of CLIP_RANGES) {
		if (pos >= left && pos <= right) return true;
	}
	return false;
}

const BUBBLE_TEXT: Record<MascotState, string> = {
	idle: "",
	thinking_generate: "Generate a video clip ...",
	generating: "Generating ...",
	thinking_cut: "Rough cut the timeline ...",
	cutting: "Cutting ...",
};

function ThoughtBubble({
	state,
	accentColor,
}: {
	state: MascotState;
	accentColor: string;
}) {
	if (state === "idle") return null;

	const isGenerating = state === "thinking_generate" || state === "generating";
	const isCutting = state === "thinking_cut" || state === "cutting";
	const borderColor = isGenerating
		? "border-sky-400/30"
		: isCutting
			? "border-red-400/30"
			: "border-white/20";

	return (
		<motion.div
			className="absolute -top-2 left-[72px] pointer-events-none whitespace-nowrap"
			initial={{ opacity: 0, scale: 0.7, x: -4 }}
			animate={{ opacity: 1, scale: 1, x: 0 }}
			exit={{ opacity: 0, scale: 0.7 }}
			transition={{ duration: 0.25 }}
		>
			{/* Bubble tail dots */}
			<div className="absolute bottom-[-4px] left-2 w-1.5 h-1.5 rounded-full bg-white/10 border border-white/20" />
			<div className="absolute bottom-[-9px] left-1 w-1 h-1 rounded-full bg-white/10 border border-white/20" />
			{/* Bubble */}
			<div
				className={`rounded-lg bg-white/10 border ${borderColor} px-3 py-1.5 flex items-center gap-2`}
			>
				<span className="text-xs text-muted-foreground font-mono">
					{BUBBLE_TEXT[state]}
				</span>
				{(state === "generating" || state === "cutting") && (
					<motion.span
						className="inline-block w-1.5 h-1.5 rounded-full"
						style={{ backgroundColor: accentColor }}
						animate={{ opacity: [1, 0.3, 1] }}
						transition={{
							duration: 0.8,
							repeat: Number.POSITIVE_INFINITY,
						}}
					/>
				)}
			</div>
		</motion.div>
	);
}

interface MascotProps {
	playheadProgress: MotionValue<number>;
}

export function Mascot({ playheadProgress }: MascotProps) {
	const [state, setState] = useState<MascotState>("idle");
	const [nearEdge, setNearEdge] = useState(false);
	const [overClip, setOverClip] = useState(false);
	const prevStateRef = useRef<MascotState>("idle");
	const prevNearRef = useRef(false);
	const prevOverRef = useRef(false);

	useAnimationFrame(() => {
		const p = playheadProgress.get();
		const pos = p * 100;

		const newState = deriveState(p);
		if (newState !== prevStateRef.current) {
			prevStateRef.current = newState;
			setState(newState);
		}

		const near = isNearClipEdge(pos);
		if (near !== prevNearRef.current) {
			prevNearRef.current = near;
			setNearEdge(near);
		}

		const over = isOverClip(pos);
		if (over !== prevOverRef.current) {
			prevOverRef.current = over;
			setOverClip(over);
		}
	});

	const isActive = state === "generating" || state === "cutting";
	const isGenerating = state === "thinking_generate" || state === "generating";
	const isCutting = state === "thinking_cut" || state === "cutting";

	// Blue during generate, red during cut, yellow default
	const accentColor = isGenerating
		? "#38BDF8"
		: isCutting
			? "#EF4444"
			: "#EAB308";
	const eyeColor =
		isActive || isGenerating || isCutting || nearEdge ? accentColor : WHITE_HEX;
	const headStroke = isGenerating
		? "#38BDF8"
		: isCutting
			? "#EF4444"
			: WHITE_HEX;

	// Reactive transforms
	const reactiveScale = nearEdge ? 0.97 : overClip ? 1.03 : 1;
	const reactiveY = overClip ? -2 : 0;
	const glowRgb = isGenerating
		? "56,189,248"
		: isCutting
			? "239,68,68"
			: "234,179,8";
	const glowIntensity = nearEdge
		? `drop-shadow(0 0 6px rgba(${glowRgb},0.5))`
		: overClip
			? `drop-shadow(0 0 3px rgba(${glowRgb},0.25))`
			: `drop-shadow(0 0 0px rgba(${glowRgb},0))`;

	return (
		<motion.div
			className="relative w-16 h-16 ml-8 mb-2"
			animate={{
				scale: reactiveScale,
				y: reactiveY,
				filter: glowIntensity,
			}}
			transition={{
				duration: nearEdge ? 0.08 : 0.2,
				ease: "easeOut",
			}}
		>
			{/* Robot face SVG */}
			<svg
				width="64"
				height="64"
				viewBox="0 0 48 48"
				fill="none"
				aria-hidden="true"
			>
				{/* Antenna */}
				<line
					x1="24"
					y1="8"
					x2="24"
					y2="2"
					stroke="white"
					strokeWidth="1"
					opacity="0.6"
				/>
				<motion.circle
					cx="24"
					cy="2"
					r="2"
					animate={{ fill: eyeColor }}
					transition={{ duration: 0.15 }}
				/>

				{/* Head */}
				<motion.rect
					x="8"
					y="8"
					width="32"
					height="28"
					rx="8"
					animate={{ stroke: headStroke }}
					strokeWidth="1.5"
					opacity="0.7"
					fill="none"
					transition={{ duration: 0.3 }}
				/>

				{/* Eyes */}
				<motion.circle
					cx="18"
					cy="22"
					r="3"
					animate={{ fill: eyeColor }}
					transition={{ duration: 0.15 }}
				/>
				<motion.circle
					cx="30"
					cy="22"
					r="3"
					animate={{ fill: eyeColor }}
					transition={{ duration: 0.15 }}
				/>

				{/* Mouth */}
				<path
					d="M19,30 Q24,34 29,30"
					stroke="white"
					strokeWidth="1.2"
					fill="none"
					opacity="0.6"
				/>

				{/* Ear details */}
				<rect
					x="4"
					y="16"
					width="4"
					height="8"
					rx="2"
					stroke="white"
					strokeWidth="1"
					opacity="0.4"
					fill="none"
				/>
				<rect
					x="40"
					y="16"
					width="4"
					height="8"
					rx="2"
					stroke="white"
					strokeWidth="1"
					opacity="0.4"
					fill="none"
				/>
			</svg>

			{/* Thought bubble */}
			<ThoughtBubble state={state} accentColor={accentColor} />
		</motion.div>
	);
}
