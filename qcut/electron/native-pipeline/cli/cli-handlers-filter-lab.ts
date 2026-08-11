/**
 * Filter lab: score QCut's filter recipes against the Jianying LUTs that are
 * already cached locally, so recipe tuning has a measured target.
 *
 * Reads only what Jianying downloaded during normal use. Nothing is fetched
 * from their servers and no LUT is copied into QCut — the reference exists to
 * score our own recipes.
 *
 * @module electron/native-pipeline/cli/cli-handlers-filter-lab
 */

import {
	compareCubes,
	frameColours,
	gridColours,
	listJianyingLuts,
	type FilterLabCube,
	type JianyingLutEntry,
	type ScoreColours,
} from "../filters/filter-lab-lut.js";
import { loadQcutFilterCubes } from "../filters/filter-lab-qcut.js";
import type { CLIResult } from "./cli-runner/types.js";

function summariseLut(entry: JianyingLutEntry) {
	return {
		lutId: entry.lutId,
		resourceId: entry.resourceId,
		version: entry.version,
		file: entry.fileName,
		role: entry.role,
		size: entry.cube.size,
		kind: entry.chroma < 0.01 ? "monochrome" : "colour",
	};
}

export async function handleFilterLabList(): Promise<CLIResult> {
	const luts = await listJianyingLuts();
	if (luts.length === 0) {
		return {
			success: false,
			error:
				"No Jianying LUTs are cached locally. Apply filters in Jianying first — the lab only reads what it has already downloaded.",
		};
	}
	return {
		success: true,
		data: {
			count: luts.length,
			luts: luts.map(summariseLut),
		},
	};
}

interface ScoredMatch {
	presetId: string;
	presetName: string;
	rmse: number;
	maxDelta: number;
}

function bestMatches({
	reference,
	presets,
	limit,
	colours,
}: {
	reference: FilterLabCube;
	presets: { id: string; name: string; cube: FilterLabCube }[];
	limit: number;
	colours: ScoreColours;
}): ScoredMatch[] {
	const scored = presets.map((preset) => {
		const distance = compareCubes({
			left: reference,
			right: preset.cube,
			colours,
		});
		return {
			presetId: preset.id,
			presetName: preset.name,
			rmse: Number(distance.rmse.toFixed(3)),
			maxDelta: Number(distance.maxDelta.toFixed(3)),
		};
	});
	scored.sort((left, right) => left.rmse - right.rmse);
	return scored.slice(0, limit);
}

async function resolveColours({
	sample,
}: {
	sample?: string;
}): Promise<{ colours: ScoreColours; basis: string }> {
	if (sample) {
		return {
			colours: await frameColours({ videoOrImage: sample }),
			basis: `frame:${sample}`,
		};
	}
	return { colours: gridColours({}), basis: "uniform-grid" };
}

/** Scores one cached Jianying LUT against every QCut preset. */
export async function handleFilterLabCompare({
	resourceId,
	lutId,
	limit = 5,
	sample,
}: {
	resourceId?: string;
	lutId?: string;
	limit?: number;
	sample?: string;
}): Promise<CLIResult> {
	if (!(resourceId || lutId)) {
		return {
			success: false,
			error: "filter-lab compare requires --lut-id or --resource-id",
		};
	}
	const luts = await listJianyingLuts();
	const resourceMatches = resourceId
		? luts.filter((lut) => lut.resourceId === resourceId)
		: [];
	if (!lutId && resourceMatches.length > 1) {
		return {
			success: false,
			error: `Resource ${resourceId} has multiple cached LUTs. Choose one exact --lut-id from 'filter-lab list'.`,
			data: { lutIds: resourceMatches.map((entry) => entry.lutId) },
		};
	}
	const entry = lutId
		? luts.find((lut) => lut.lutId === lutId)
		: resourceMatches[0];
	if (!entry) {
		return {
			success: false,
			error: `No cached Jianying LUT for ${lutId ?? resourceId}. Run 'filter-lab list' to see what is available.`,
		};
	}
	const presets = await loadQcutFilterCubes();
	const { colours, basis } = await resolveColours({ sample });
	return {
		success: true,
		data: {
			reference: summariseLut(entry),
			scoredOver: basis,
			closest: bestMatches({ reference: entry.cube, presets, limit, colours }),
		},
	};
}

/**
 * Scores every cached LUT and reports where QCut's library is furthest from
 * the reference — the gap map that recipe work should be aimed at.
 */
export async function handleFilterLabMatch({
	worst = 10,
	sample,
}: {
	worst?: number;
	sample?: string;
}): Promise<CLIResult> {
	const luts = await listJianyingLuts();
	if (luts.length === 0) {
		return {
			success: false,
			error:
				"No Jianying LUTs are cached locally. Apply filters in Jianying first — the lab only reads what it has already downloaded.",
		};
	}
	const presets = await loadQcutFilterCubes();
	const { colours, basis } = await resolveColours({ sample });

	const rows = luts.map((entry) => {
		const [best] = bestMatches({
			reference: entry.cube,
			presets,
			limit: 1,
			colours,
		});
		return {
			resourceId: entry.resourceId,
			size: entry.cube.size,
			closestPreset: best?.presetId ?? "",
			closestName: best?.presetName ?? "",
			rmse: best?.rmse ?? Number.POSITIVE_INFINITY,
		};
	});
	rows.sort((left, right) => right.rmse - left.rmse);

	const scores = rows.map((row) => row.rmse).sort((a, b) => a - b);
	const median = scores[Math.floor(scores.length / 2)] ?? 0;
	return {
		success: true,
		data: {
			scoredOver: basis,
			referenceCount: rows.length,
			presetCount: presets.length,
			medianRmse: Number(median.toFixed(3)),
			within5Levels: scores.filter((value) => value < 5).length,
			within10Levels: scores.filter((value) => value < 10).length,
			worstMatches: rows.slice(0, worst),
		},
	};
}
