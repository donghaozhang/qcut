import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bot, MousePointer2 } from "lucide-react";
import {
	platform,
	type PlatformAgentPointerVisualState,
} from "@qcut/platform-core";

interface TrailPoint {
	x: number;
	y: number;
}

const MAX_TRAIL_POINTS = 28;
const TRAIL_CLEAR_DELAY_MS = 650;

function appendTrailPoint({
	trail,
	point,
}: {
	trail: TrailPoint[];
	point: TrailPoint;
}): TrailPoint[] {
	const previous = trail.at(-1);
	if (previous?.x === point.x && previous.y === point.y) return trail;
	return [...trail.slice(-(MAX_TRAIL_POINTS - 1)), point];
}

function serializeTrail({ trail }: { trail: TrailPoint[] }): string {
	return trail.map((point) => `${point.x},${point.y}`).join(" ");
}

export function AgentPointerOverlay() {
	const [pointer, setPointer] =
		useState<PlatformAgentPointerVisualState | null>(null);
	const [trail, setTrail] = useState<TrailPoint[]>([]);
	const wasDraggingRef = useRef(false);
	const trailTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined
	);

	useEffect(() => {
		const pointerBridge = platform().claude?.pointer;
		if (!pointerBridge) return;

		pointerBridge.onStateChange((nextPointer) => {
			setPointer(nextPointer);
			if (!nextPointer.visible) {
				wasDraggingRef.current = false;
				if (trailTimerRef.current !== undefined) {
					clearTimeout(trailTimerRef.current);
					trailTimerRef.current = undefined;
				}
				setTrail([]);
				return;
			}
			if (nextPointer.dragging) {
				wasDraggingRef.current = true;
				if (trailTimerRef.current !== undefined) {
					clearTimeout(trailTimerRef.current);
					trailTimerRef.current = undefined;
				}
				setTrail((currentTrail) =>
					appendTrailPoint({
						trail: currentTrail,
						point: { x: nextPointer.x, y: nextPointer.y },
					})
				);
				return;
			}

			if (wasDraggingRef.current) {
				wasDraggingRef.current = false;
				trailTimerRef.current = setTimeout(() => {
					setTrail([]);
					trailTimerRef.current = undefined;
				}, TRAIL_CLEAR_DELAY_MS);
			}
		});

		return () => {
			pointerBridge.removeListeners();
			if (trailTimerRef.current !== undefined) {
				clearTimeout(trailTimerRef.current);
			}
		};
	}, []);

	if (!pointer?.visible) return null;

	return (
		<div
			data-qcut-snapshot-ignore="true"
			data-testid="agent-pointer-overlay"
			className="pointer-events-none fixed inset-0 z-[10000] overflow-hidden"
		>
			{trail.length > 1 ? (
				<svg aria-hidden="true" className="absolute inset-0 h-full w-full">
					<polyline
						fill="none"
						points={serializeTrail({ trail })}
						stroke="rgba(34, 211, 238, 0.72)"
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth="3"
					/>
				</svg>
			) : null}

			<motion.div
				animate={{
					x: pointer.x - 2,
					y: pointer.y - 2,
					scale: pointer.pressed ? 0.9 : 1,
				}}
				className="absolute left-0 top-0 h-8 w-8"
				data-testid="agent-pointer-cursor"
				initial={false}
				transition={{ duration: 0.055, ease: "linear" }}
			>
				<MousePointer2
					aria-hidden="true"
					className="h-7 w-7 fill-cyan-400 text-slate-950 drop-shadow-[0_1px_2px_rgba(255,255,255,0.75)]"
					strokeWidth={1.8}
				/>
				<AnimatePresence>
					{pointer.pulseId > 0 && !pointer.pressed ? (
						<motion.span
							animate={{ opacity: 0, scale: 2.4 }}
							className="absolute left-0 top-0 h-4 w-4 rounded-full border-2 border-amber-300 bg-amber-300/25"
							exit={{ opacity: 0 }}
							initial={{ opacity: 0.9, scale: 0.35 }}
							key={pointer.pulseId}
							transition={{ duration: 0.45, ease: "easeOut" }}
						/>
					) : null}
				</AnimatePresence>
			</motion.div>

			<AnimatePresence>
				{pointer.active ? (
					<motion.div
						animate={{ opacity: 1, y: 0 }}
						className="absolute left-1/2 top-14 flex -translate-x-1/2 items-center gap-2 rounded-md border border-cyan-300/35 bg-neutral-950/90 px-3 py-2 text-xs text-white shadow-lg backdrop-blur-sm"
						exit={{ opacity: 0, y: -4 }}
						initial={{ opacity: 0, y: -4 }}
						role="status"
						transition={{ duration: 0.14 }}
					>
						<Bot aria-hidden="true" className="h-4 w-4 text-cyan-300" />
						<span className="font-medium">
							{pointer.inputMode === "background"
								? "Agent 后台操作"
								: "Agent 正在操作"}
						</span>
						<span className="text-neutral-400">{pointer.label}</span>
					</motion.div>
				) : null}
			</AnimatePresence>
		</div>
	);
}
