"use client";

import { useState, useCallback, useEffect } from "react";
import type { DashboardPolicyGate } from "@/lib/types";

interface GateBlockerPanelProps {
	sessionId: string;
	gate: DashboardPolicyGate;
}

/**
 * GateBlockerPanel — compact callout shown on SessionCard when policy
 * violations are present.
 *
 * - Advisory mode: yellow callout
 * - Enforced mode: red callout
 * - No violations: renders nothing (no DOM element)
 */
export function GateBlockerPanel({ sessionId, gate }: GateBlockerPanelProps) {
	const [loading, setLoading] = useState(false);
	const [current, setCurrent] = useState<DashboardPolicyGate>(gate);

	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			const res = await fetch(`/api/sessions/${sessionId}/policy`);
			if (res.ok) {
				const data: DashboardPolicyGate = await res.json() as DashboardPolicyGate;
				setCurrent(data);
			}
		} catch {
			// Ignore fetch errors — stale data is better than crashing
		} finally {
			setLoading(false);
		}
	}, [sessionId]);

	if (current.violations.length === 0) {
		return null;
	}

	const isEnforced = current.mode === "enforced";

	return (
		<div
			data-testid="gate-blocker-panel"
			data-mode={current.mode}
			className={[
				"mt-2 rounded border px-3 py-2 text-xs",
				isEnforced
					? "border-red-500/40 bg-red-950/40 text-red-300"
					: "border-yellow-500/40 bg-yellow-950/40 text-yellow-300",
			].join(" ")}
		>
			<div className="flex items-center justify-between gap-2">
				<span className="font-semibold">
					{isEnforced ? "🔴 Gate Blocked" : "🟡 Gate Warnings"}
					<span className="ml-1 font-normal opacity-70">
						({current.mode})
					</span>
				</span>
				<button
					type="button"
					onClick={() => void refresh()}
					disabled={loading}
					className="opacity-60 hover:opacity-100 disabled:opacity-30"
					aria-label="Refresh gate status"
				>
					{loading ? "…" : "↻"}
				</button>
			</div>
			<ul className="mt-1 space-y-0.5">
				{current.violations.map((v, i) => (
					<li key={`${v.code}-${i}`} className="opacity-90">
						<code className="opacity-70">{v.code}</code>
						{v.blockerClass && (
							<span className="ml-1 opacity-50">[{v.blockerClass}]</span>
						)}
						{" — "}
						{v.message}
					</li>
				))}
			</ul>
			{current.failingChecks && current.failingChecks.length > 0 && (
				<div className="mt-1 opacity-80">
					<span className="font-medium">Failing checks: </span>
					{current.failingChecks.join(", ")}
				</div>
			)}
		</div>
	);
}

/**
 * GateBlockerPanelLoader — fetches gate state on mount (with 30s cache)
 * and renders GateBlockerPanel when violations are present.
 */
const gateCache = new Map<string, { data: DashboardPolicyGate; fetchedAt: number }>();
const GATE_CACHE_TTL = 30_000;

interface GateBlockerPanelLoaderProps {
	sessionId: string;
}

export function GateBlockerPanelLoader({ sessionId }: GateBlockerPanelLoaderProps) {
	const [gate, setGate] = useState<DashboardPolicyGate | null>(() => {
		const cached = gateCache.get(sessionId);
		if (cached && Date.now() - cached.fetchedAt < GATE_CACHE_TTL) {
			return cached.data;
		}
		return null;
	});

	// Fetch on mount if not already cached
	useEffect(() => {
		const cached = gateCache.get(sessionId);
		if (cached && Date.now() - cached.fetchedAt < GATE_CACHE_TTL) return;
		void (async () => {
			try {
				const res = await fetch(`/api/sessions/${sessionId}/policy`);
				if (res.ok) {
					const data: DashboardPolicyGate = await res.json() as DashboardPolicyGate;
					gateCache.set(sessionId, { data, fetchedAt: Date.now() });
					setGate(data);
				}
			} catch {
				// Ignore
			}
		})();
	}, [sessionId]);

	if (!gate || gate.violations.length === 0) return null;

	return <GateBlockerPanel sessionId={sessionId} gate={gate} />;
}
