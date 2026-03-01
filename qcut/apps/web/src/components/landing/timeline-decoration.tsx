"use client";

import {
	type MotionValue,
	motion,
	useAnimationFrame,
	useTransform,
} from "motion/react";
import { useRef, useState } from "react";

type TrackClip = {
	id: string;
	track: number;
	left: number;
	width: number;
	baseOpacity: number;
	glow: boolean;
	hasWaveform?: boolean;
	autoExpand?: {
		initialWidth: number;
		expandedWidth: number;
	};
	generated?: {
		triggerAt: number;
		color: string;
	};
	roughCut?: {
		triggerAt: number;
		trimmedWidth: number;
	};
};

const CLIPS: TrackClip[] = [
	// Track 0
	{
		id: "c0",
		track: 0,
		left: 2,
		width: 8,
		baseOpacity: 0.3,
		glow: false,
		hasWaveform: true,
	},
	{ id: "c1", track: 0, left: 12, width: 15, baseOpacity: 0.25, glow: true },
	{ id: "c2", track: 0, left: 30, width: 6, baseOpacity: 0.2, glow: false },
	{
		id: "c3",
		track: 0,
		left: 40,
		width: 20,
		baseOpacity: 0.35,
		glow: false,
		hasWaveform: true,
		roughCut: { triggerAt: 60, trimmedWidth: 14 },
	},
	{ id: "c4", track: 0, left: 65, width: 12, baseOpacity: 0.25, glow: true },
	{ id: "c5", track: 0, left: 82, width: 16, baseOpacity: 0.3, glow: false },
	// Track 1
	{
		id: "c6",
		track: 1,
		left: 5,
		width: 18,
		baseOpacity: 0.25,
		glow: false,
		hasWaveform: true,
	},
	{ id: "c7", track: 1, left: 26, width: 10, baseOpacity: 0.3, glow: true },
	// Generated clip — appears at 25% in an empty gap
	{
		id: "gen0",
		track: 1,
		left: 37,
		width: 4,
		baseOpacity: 0.4,
		glow: true,
		generated: { triggerAt: 25, color: "rgb(56 189 248)" },
	},
	{
		id: "c8",
		track: 1,
		left: 42,
		width: 5,
		baseOpacity: 0.2,
		glow: false,
		autoExpand: { initialWidth: 5, expandedWidth: 14 },
	},
	{
		id: "c9",
		track: 1,
		left: 58,
		width: 22,
		baseOpacity: 0.25,
		glow: false,
		roughCut: { triggerAt: 60, trimmedWidth: 15 },
	},
	{
		id: "c10",
		track: 1,
		left: 84,
		width: 14,
		baseOpacity: 0.3,
		glow: true,
		hasWaveform: true,
	},
	// Track 2
	{ id: "c11", track: 2, left: 0, width: 12, baseOpacity: 0.2, glow: false },
	{
		id: "c12",
		track: 2,
		left: 16,
		width: 8,
		baseOpacity: 0.35,
		glow: true,
		hasWaveform: true,
	},
	{
		id: "c13",
		track: 2,
		left: 50,
		width: 4,
		baseOpacity: 0.2,
		glow: false,
		autoExpand: { initialWidth: 4, expandedWidth: 12 },
	},
	{
		id: "c14",
		track: 2,
		left: 68,
		width: 16,
		baseOpacity: 0.3,
		glow: false,
		roughCut: { triggerAt: 60, trimmedWidth: 10 },
	},
	{ id: "c15", track: 2, left: 88, width: 10, baseOpacity: 0.25, glow: true },
];

const TRACK_COUNT = 3;
export const CYCLE_DURATION = 18000;

// Pre-computed clip edges for mascot reactivity (unique sorted left boundaries)
export const CLIP_EDGES: number[] = [...new Set(CLIPS.map((c) => c.left))].sort(
	(a, b) => a - b
);

// Clip ranges: [left, right] for overlap detection
export const CLIP_RANGES: [number, number][] = CLIPS.map((c) => [
	c.left,
	c.left + c.width,
]);

function WaveformSvg() {
	return (
		<svg
			className="absolute inset-0 w-full h-full"
			viewBox="0 0 100 20"
			preserveAspectRatio="none"
			aria-hidden="true"
		>
			<path
				d="M0,10 Q5,4 10,10 Q15,16 20,10 Q25,3 30,10 Q35,17 40,10 Q45,5 50,10 Q55,15 60,10 Q65,4 70,10 Q75,16 80,10 Q85,6 90,10 Q95,14 100,10"
				fill="none"
				stroke="rgb(234 179 8)"
				strokeWidth="1.5"
				opacity="0.4"
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	);
}

function TimelineClip({
	clip,
	playheadProgress,
}: {
	clip: TrackClip;
	playheadProgress: MotionValue<number>;
}) {
	const [expanded, setExpanded] = useState(false);
	const [visible, setVisible] = useState(!clip.generated);
	const [trimmed, setTrimmed] = useState(false);
	const [cutFlash, setCutFlash] = useState(false);
	const expandedRef = useRef(false);
	const visibleRef = useRef(!clip.generated);
	const trimmedRef = useRef(false);
	const prevProgressRef = useRef(0);

	const clipLeft = clip.left;
	const clipRight = clip.left + clip.width;
	const isGenerated = !!clip.generated;
	const clipColor = clip.generated?.color ?? "rgb(234 179 8)";

	const opacity = useTransform(playheadProgress, (p) => {
		if (isGenerated && !visibleRef.current) return 0;
		const pos = p * 100;
		if (pos >= clipLeft && pos <= clipRight) {
			return Math.min(clip.baseOpacity + 0.45, 0.8);
		}
		return clip.baseOpacity;
	});

	const glowColor = isGenerated ? "56,189,248" : "234,179,8";

	const shadowOpacity = useTransform(playheadProgress, (p) => {
		if (isGenerated && !visibleRef.current) return 0;
		const pos = p * 100;
		if (pos >= clipLeft && pos <= clipRight) return 0.5;
		return clip.glow ? 0.2 : 0;
	});

	const boxShadow = useTransform(
		shadowOpacity,
		(v) => `0 0 ${v > 0.3 ? 12 : 8}px rgba(${glowColor},${v})`
	);

	useAnimationFrame(() => {
		const p = playheadProgress.get() * 100;
		const prev = prevProgressRef.current;
		prevProgressRef.current = p;

		// Reset on loop
		if (p < prev - 50) {
			if (clip.autoExpand) {
				expandedRef.current = false;
				setExpanded(false);
			}
			if (clip.generated) {
				visibleRef.current = false;
				setVisible(false);
			}
			if (clip.roughCut) {
				trimmedRef.current = false;
				setTrimmed(false);
			}
		}

		// Auto-expand
		if (
			clip.autoExpand &&
			prev < clipLeft &&
			p >= clipLeft &&
			!expandedRef.current
		) {
			expandedRef.current = true;
			setExpanded(true);
		}

		// Generated: appear at trigger
		if (clip.generated && !visibleRef.current) {
			if (prev < clip.generated.triggerAt && p >= clip.generated.triggerAt) {
				visibleRef.current = true;
				setVisible(true);
			}
		}

		// Rough cut: trim at trigger
		if (clip.roughCut && !trimmedRef.current) {
			if (prev < clip.roughCut.triggerAt && p >= clip.roughCut.triggerAt) {
				trimmedRef.current = true;
				setTrimmed(true);
				setCutFlash(true);
				setTimeout(() => setCutFlash(false), 200);
			}
		}
	});

	// Determine current width
	let currentWidth = clip.width;
	if (clip.autoExpand) {
		currentWidth = expanded
			? clip.autoExpand.expandedWidth
			: clip.autoExpand.initialWidth;
	}
	if (clip.roughCut) {
		currentWidth = trimmed ? clip.roughCut.trimmedWidth : clip.width;
	}

	return (
		<motion.div
			className="absolute top-1 bottom-1 rounded-sm overflow-hidden"
			style={{
				left: `${clip.left}%`,
				opacity,
				boxShadow,
				backgroundColor: clipColor,
			}}
			animate={{
				width: `${currentWidth}%`,
				scale: isGenerated ? (visible ? 1 : 0.8) : 1,
			}}
			transition={
				clip.autoExpand
					? { duration: 1.5, ease: "easeOut" }
					: clip.roughCut
						? { duration: 0.3, ease: "easeOut" }
						: clip.generated
							? { duration: 0.5, ease: "easeOut" }
							: { duration: 0 }
			}
		>
			{/* Grid pattern overlay */}
			<div
				className="absolute inset-0"
				style={{
					backgroundImage:
						"linear-gradient(rgba(0,0,0,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.4) 1px, transparent 1px)",
					backgroundSize: "4px 4px",
				}}
			/>
			{clip.hasWaveform && <WaveformSvg />}
			{/* Auto-expand shimmer */}
			{clip.autoExpand && expanded && (
				<motion.div
					className="absolute inset-0"
					style={{
						background:
							"linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)",
						backgroundSize: "200% 100%",
					}}
					animate={{ backgroundPosition: ["200% 0", "-200% 0"] }}
					transition={{ duration: 1.5, ease: "easeOut" }}
				/>
			)}
			{/* Cut flash */}
			{cutFlash && (
				<motion.div
					className="absolute inset-y-0 right-0 w-px bg-white/60"
					initial={{ opacity: 1 }}
					animate={{ opacity: 0 }}
					transition={{ duration: 0.2 }}
				/>
			)}
		</motion.div>
	);
}

function Playhead({
	playheadProgress,
}: {
	playheadProgress: MotionValue<number>;
}) {
	const left = useTransform(playheadProgress, (p) => `${p * 100}%`);

	return (
		<motion.div
			className="absolute top-0 bottom-0 z-10 pointer-events-none"
			style={{ left, width: "1px" }}
		>
			<div className="absolute inset-0 w-px bg-white/60" />
			<motion.div
				className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-yellow-500"
				style={{
					boxShadow: "0 0 8px 2px rgba(234,179,8,0.6)",
				}}
				animate={{
					boxShadow: [
						"0 0 8px 2px rgba(234,179,8,0.6)",
						"0 0 14px 4px rgba(234,179,8,0.9)",
						"0 0 8px 2px rgba(234,179,8,0.6)",
					],
				}}
				transition={{
					duration: 2,
					repeat: Number.POSITIVE_INFINITY,
					ease: "easeInOut",
				}}
			/>
		</motion.div>
	);
}

interface TimelineDecorationProps {
	playheadProgress: MotionValue<number>;
}

export function TimelineDecoration({
	playheadProgress,
}: TimelineDecorationProps) {
	const tracks = Array.from({ length: TRACK_COUNT }, (_, i) => i);

	return (
		<div
			aria-hidden="true"
			className="relative w-full h-28 md:h-36 overflow-hidden"
		>
			{/* Fade overlay top */}
			<div className="absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-black to-transparent z-10 pointer-events-none" />
			{/* Fade overlay sides */}
			<div className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-black to-transparent z-10 pointer-events-none" />
			<div className="absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-black to-transparent z-10 pointer-events-none" />

			{/* Tracks */}
			<div className="relative w-full h-full flex flex-col">
				{tracks.map((trackIndex) => (
					<div
						key={trackIndex}
						className="relative flex-1 border-b border-white/[0.04]"
					>
						{/* Faint segment dividers */}
						{Array.from({ length: 20 }, (_, i) => (
							<div
								key={i}
								className="absolute top-0 bottom-0 w-px bg-white/[0.03]"
								style={{ left: `${(i + 1) * 5}%` }}
							/>
						))}

						{/* Clips on this track */}
						{CLIPS.filter((c) => c.track === trackIndex).map((clip) => (
							<TimelineClip
								key={clip.id}
								clip={clip}
								playheadProgress={playheadProgress}
							/>
						))}
					</div>
				))}

				{/* Playhead */}
				<Playhead playheadProgress={playheadProgress} />
			</div>
		</div>
	);
}
