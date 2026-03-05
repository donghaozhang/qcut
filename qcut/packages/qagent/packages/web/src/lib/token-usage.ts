import type { DashboardTokenUsage } from "./types.js";

interface RawTokenUsage {
	inputTokens?: number;
	outputTokens?: number;
	estimatedCostUsd?: number;
}

export function emptyDashboardTokenUsage(): DashboardTokenUsage {
	return {
		inputTokens: 0,
		outputTokens: 0,
		totalTokens: 0,
		estimatedCostUsd: 0,
	};
}

function sanitizeNumber({ value }: { value: unknown }): number {
	try {
		if (typeof value !== "number" || !Number.isFinite(value)) return 0;
		if (value < 0) return 0;
		return value;
	} catch {
		return 0;
	}
}

export function toDashboardTokenUsage({
	usage,
}: {
	usage: RawTokenUsage | null | undefined;
}): DashboardTokenUsage | null {
	try {
		if (!usage) return null;

		const inputTokens = Math.round(sanitizeNumber({ value: usage.inputTokens }));
		const outputTokens = Math.round(sanitizeNumber({ value: usage.outputTokens }));
		const estimatedCostUsd = sanitizeNumber({ value: usage.estimatedCostUsd });

		return {
			inputTokens,
			outputTokens,
			totalTokens: inputTokens + outputTokens,
			estimatedCostUsd,
		};
	} catch {
		return null;
	}
}

export function toDisplayTokenUsage({
	usage,
}: {
	usage: DashboardTokenUsage | null | undefined;
}): DashboardTokenUsage {
	try {
		return usage ?? emptyDashboardTokenUsage();
	} catch {
		return emptyDashboardTokenUsage();
	}
}

const compactTokenFormatter = new Intl.NumberFormat("en-US", {
	notation: "compact",
	maximumFractionDigits: 1,
});
const groupedTokenFormatter = new Intl.NumberFormat("en-US");

export function formatTokenCountCompact({ tokens }: { tokens: number }): string {
	try {
		return compactTokenFormatter.format(
			Math.round(sanitizeNumber({ value: tokens }))
		);
	} catch {
		return String(Math.round(sanitizeNumber({ value: tokens })));
	}
}

export function formatTokenCountFull({ tokens }: { tokens: number }): string {
	try {
		return groupedTokenFormatter.format(
			Math.round(sanitizeNumber({ value: tokens }))
		);
	} catch {
		return String(Math.round(sanitizeNumber({ value: tokens })));
	}
}

export function formatUsd({ usd }: { usd: number }): string {
	try {
		const safeUsd = sanitizeNumber({ value: usd });
		const fractionDigits =
			safeUsd >= 1 ? 2 : safeUsd >= 0.01 ? 4 : safeUsd > 0 ? 6 : 2;

		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: "USD",
			minimumFractionDigits: 2,
			maximumFractionDigits: fractionDigits,
		}).format(safeUsd);
	} catch {
		return "$0.00";
	}
}
