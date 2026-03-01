"use client";

import { type MotionValue, motion, useAnimationFrame } from "motion/react";
import { useRef, useState } from "react";

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

function deriveState(progress: number): MascotState {
	const p = progress * 100;
	if (p >= THINK_GENERATE_AT && p < GENERATE_AT) return "thinking_generate";
	if (p >= GENERATE_AT && p < GENERATE_END) return "generating";
	if (p >= THINK_CUT_AT && p < CUT_AT) return "thinking_cut";
	if (p >= CUT_AT && p < CUT_END) return "cutting";
	return "idle";
}

function ThinkingDots() {
	return (
		<motion.g>
			<motion.circle
				cx="8"
				cy="6"
				r="1.5"
				fill="white"
				animate={{ opacity: [0.3, 1, 0.3] }}
				transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, delay: 0 }}
			/>
			<motion.circle
				cx="14"
				cy="6"
				r="1.5"
				fill="white"
				animate={{ opacity: [0.3, 1, 0.3] }}
				transition={{
					duration: 1,
					repeat: Number.POSITIVE_INFINITY,
					delay: 0.2,
				}}
			/>
			<motion.circle
				cx="20"
				cy="6"
				r="1.5"
				fill="white"
				animate={{ opacity: [0.3, 1, 0.3] }}
				transition={{
					duration: 1,
					repeat: Number.POSITIVE_INFINITY,
					delay: 0.4,
				}}
			/>
		</motion.g>
	);
}

function SparkleIcon() {
	return (
		<motion.g
			initial={{ scale: 0.5, opacity: 0 }}
			animate={{ scale: 1, opacity: 1 }}
			transition={{ duration: 0.3 }}
		>
			<path
				d="M14,2 L15.5,5.5 L19,7 L15.5,8.5 L14,12 L12.5,8.5 L9,7 L12.5,5.5 Z"
				fill="#EAB308"
				stroke="none"
			/>
			<path
				d="M21,4 L21.8,5.8 L23.5,6.5 L21.8,7.2 L21,9 L20.2,7.2 L18.5,6.5 L20.2,5.8 Z"
				fill="#EAB308"
				opacity="0.6"
				stroke="none"
			/>
		</motion.g>
	);
}

function ScissorsIcon() {
	return (
		<motion.g
			initial={{ scale: 0.5, opacity: 0 }}
			animate={{ scale: 1, opacity: 1 }}
			transition={{ duration: 0.3 }}
		>
			<circle cx="9" cy="10" r="2.5" fill="none" stroke="white" strokeWidth="1.2" />
			<circle cx="19" cy="10" r="2.5" fill="none" stroke="white" strokeWidth="1.2" />
			<line x1="11" y1="8.5" x2="17" y2="3" stroke="white" strokeWidth="1.2" />
			<line x1="17" y1="8.5" x2="11" y2="3" stroke="white" strokeWidth="1.2" />
		</motion.g>
	);
}

function ThoughtBubble({
	state,
}: {
	state: MascotState;
}) {
	if (state === "idle") return null;

	return (
		<motion.div
			className="absolute -top-3 left-12 pointer-events-none"
			initial={{ opacity: 0, scale: 0.7 }}
			animate={{ opacity: 1, scale: 1 }}
			exit={{ opacity: 0, scale: 0.7 }}
			transition={{ duration: 0.25 }}
		>
			{/* Bubble tail dots */}
			<div className="absolute bottom-[-4px] left-1 w-1.5 h-1.5 rounded-full bg-white/10 border border-white/20" />
			<div className="absolute bottom-[-9px] left-0 w-1 h-1 rounded-full bg-white/10 border border-white/20" />
			{/* Bubble */}
			<div className="rounded-lg bg-white/10 border border-white/20 px-1 py-0.5">
				<svg width="28" height="14" viewBox="0 0 28 14">
					{state === "thinking_generate" && <ThinkingDots />}
					{state === "generating" && <SparkleIcon />}
					{state === "thinking_cut" && <ThinkingDots />}
					{state === "cutting" && <ScissorsIcon />}
				</svg>
			</div>
		</motion.div>
	);
}

interface MascotProps {
	playheadProgress: MotionValue<number>;
}

export function Mascot({ playheadProgress }: MascotProps) {
	const [state, setState] = useState<MascotState>("idle");
	const prevStateRef = useRef<MascotState>("idle");

	useAnimationFrame(() => {
		const newState = deriveState(playheadProgress.get());
		if (newState !== prevStateRef.current) {
			prevStateRef.current = newState;
			setState(newState);
		}
	});

	const isActive =
		state === "generating" || state === "cutting";
	const eyeColor = isActive ? "#EAB308" : "white";

	return (
		<div className="relative w-12 h-12 ml-8 mb-2">
			{/* Robot face SVG */}
			<svg
				width="48"
				height="48"
				viewBox="0 0 48 48"
				fill="none"
				aria-hidden="true"
			>
				{/* Antenna */}
				<line x1="24" y1="8" x2="24" y2="2" stroke="white" strokeWidth="1" opacity="0.6" />
				<motion.circle
					cx="24"
					cy="2"
					r="2"
					fill={eyeColor}
					animate={
						isActive
							? {
									boxShadow: [
										"0 0 4px rgba(234,179,8,0.6)",
										"0 0 8px rgba(234,179,8,0.9)",
									],
								}
							: {}
					}
				/>

				{/* Head */}
				<rect
					x="8"
					y="8"
					width="32"
					height="28"
					rx="8"
					stroke="white"
					strokeWidth="1.5"
					opacity="0.7"
					fill="none"
				/>

				{/* Eyes */}
				<motion.circle
					cx="18"
					cy="22"
					r="3"
					animate={{ fill: eyeColor }}
					transition={{ duration: 0.3 }}
				/>
				<motion.circle
					cx="30"
					cy="22"
					r="3"
					animate={{ fill: eyeColor }}
					transition={{ duration: 0.3 }}
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
				<rect x="4" y="16" width="4" height="8" rx="2" stroke="white" strokeWidth="1" opacity="0.4" fill="none" />
				<rect x="40" y="16" width="4" height="8" rx="2" stroke="white" strokeWidth="1" opacity="0.4" fill="none" />
			</svg>

			{/* Thought bubble */}
			<ThoughtBubble state={state} />
		</div>
	);
}
