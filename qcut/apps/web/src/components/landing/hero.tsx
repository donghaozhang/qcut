"use client";

import { motion, useAnimationFrame, useMotionValue } from "motion/react";
import { Link } from "@tanstack/react-router";
import { useCallback, useRef } from "react";
import { Handlebars } from "./handlebars";
import { Mascot } from "./mascot";
import { CYCLE_DURATION, TimelineDecoration } from "./timeline-decoration";

export function Hero() {
	const playheadProgress = useMotionValue(0);
	const startTimeRef = useRef<number | null>(null);

	const tick = useCallback(
		(time: number) => {
			if (startTimeRef.current === null) startTimeRef.current = time;
			const elapsed = time - startTimeRef.current;
			const progress = (elapsed % CYCLE_DURATION) / CYCLE_DURATION;
			playheadProgress.set(progress);
		},
		[playheadProgress]
	);

	useAnimationFrame(tick);

	return (
		<div className="min-h-[calc(100vh-4.5rem)] supports-[height:100dvh]:min-h-[calc(100dvh-4.5rem)] flex flex-col justify-between items-center text-center bg-black">
			{/* Text content */}
			<motion.div
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ duration: 1 }}
				className="max-w-3xl mx-auto w-full flex-1 flex flex-col justify-center px-4"
			>
				<motion.div
					className="inline-block font-bold tracking-tighter text-4xl md:text-[4rem]"
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.3, duration: 0.8 }}
				>
					<h1>AI Agent</h1>
					<Handlebars>Video OS</Handlebars>
				</motion.div>

				<motion.p
					className="mt-3 text-xl md:text-2xl font-medium text-neutral-200 tracking-wide"
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.5, duration: 0.8 }}
				>
					Built for the Agent Era
				</motion.p>

				<motion.p
					className="mt-8 text-base sm:text-lg text-neutral-500 font-light tracking-wide max-w-xl mx-auto"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ delay: 0.7, duration: 0.8 }}
				>
					Create, edit, and automate video with AI agents — all in one powerful
					desktop app.
				</motion.p>

				<motion.div
					className="mt-10 flex items-center justify-center gap-4 flex-wrap"
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.9, duration: 0.8 }}
				>
					<Link
						to="/projects"
						className="inline-flex items-center justify-center px-8 py-3 rounded-lg bg-yellow-500 text-black font-semibold text-sm hover:bg-yellow-400 transition-colors"
					>
						Start Creating
					</Link>
					<a
						href="https://quriosity.com.au/"
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center justify-center px-8 py-3 rounded-lg border border-neutral-600 text-neutral-200 font-semibold text-sm hover:border-neutral-400 hover:text-white transition-colors"
					>
						Learn More
					</a>
				</motion.div>
			</motion.div>

			{/* Mascot + Timeline */}
			<motion.div
				className="w-full"
				initial={{ opacity: 0, y: 30 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ delay: 1.1, duration: 1 }}
			>
				<Mascot playheadProgress={playheadProgress} />
				<TimelineDecoration playheadProgress={playheadProgress} />
			</motion.div>
		</div>
	);
}
