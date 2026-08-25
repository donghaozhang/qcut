import type { JianyingPortraitDetectedFace } from "../jianying-portrait-adjustment-contract.js";

export type PortraitFaceGeometry = Pick<
	JianyingPortraitDetectedFace,
	"rect" | "trackId"
>;

const MAXIMUM_MATCH_COST = 0.12;
const MINIMUM_UNAMBIGUOUS_MARGIN = 0.0125;

function faceArea({ face }: { face: PortraitFaceGeometry }) {
	return face.rect.width * face.rect.height;
}

function matchCost({
	reference,
	candidate,
}: {
	reference: PortraitFaceGeometry;
	candidate: PortraitFaceGeometry;
}) {
	const referenceCenterX = reference.rect.x + reference.rect.width / 2;
	const referenceCenterY = reference.rect.y + reference.rect.height / 2;
	const candidateCenterX = candidate.rect.x + candidate.rect.width / 2;
	const candidateCenterY = candidate.rect.y + candidate.rect.height / 2;
	const centerDistance =
		(referenceCenterX - candidateCenterX) ** 2 +
		(referenceCenterY - candidateCenterY) ** 2;
	const areaRatio = Math.max(
		1e-6,
		faceArea({ face: candidate }) /
			Math.max(1e-6, faceArea({ face: reference }))
	);
	return centerDistance + Math.abs(Math.log(areaRatio)) * 0.05;
}

interface IndexedMatchCost {
	referenceIndex: number;
	candidateIndex: number;
	cost: number;
}

interface AssignmentState {
	cost: number;
	pairs: IndexedMatchCost[];
}

function ambiguousIndexes({
	costs,
	groupKey,
}: {
	costs: IndexedMatchCost[];
	groupKey: "referenceIndex" | "candidateIndex";
}) {
	const grouped = new Map<number, number[]>();
	for (const cost of costs) {
		const key = cost[groupKey];
		const values = grouped.get(key) ?? [];
		values.push(cost.cost);
		grouped.set(key, values);
	}
	const ambiguous = new Set<number>();
	for (const [key, values] of grouped) {
		values.sort((left, right) => left - right);
		if (
			values.length > 1 &&
			(values[1] ?? Number.POSITIVE_INFINITY) -
				(values[0] ?? Number.POSITIVE_INFINITY) <
				MINIMUM_UNAMBIGUOUS_MARGIN
		) {
			ambiguous.add(key);
		}
	}
	return ambiguous;
}

function globallyOptimalAssignment({
	referenceCount,
	candidateCount,
	costs,
}: {
	referenceCount: number;
	candidateCount: number;
	costs: IndexedMatchCost[];
}) {
	let states = new Map<number, AssignmentState>([[0, { cost: 0, pairs: [] }]]);
	for (
		let referenceIndex = 0;
		referenceIndex < referenceCount;
		referenceIndex += 1
	) {
		const next = new Map<number, AssignmentState>();
		const referenceCosts = costs.filter(
			(cost) => cost.referenceIndex === referenceIndex
		);
		for (const [mask, state] of states) {
			const skipped = next.get(mask);
			if (!skipped || state.cost < skipped.cost) next.set(mask, state);
			for (const candidate of referenceCosts) {
				if (candidate.candidateIndex >= candidateCount) continue;
				const bit = 1 << candidate.candidateIndex;
				if ((mask & bit) !== 0) continue;
				const candidateMask = mask | bit;
				const assignment = {
					cost: state.cost + candidate.cost,
					pairs: [...state.pairs, candidate],
				};
				const previous = next.get(candidateMask);
				if (!previous || assignment.cost < previous.cost) {
					next.set(candidateMask, assignment);
				}
			}
		}
		states = next;
	}
	let best: AssignmentState = { cost: 0, pairs: [] };
	for (const state of states.values()) {
		if (
			state.pairs.length > best.pairs.length ||
			(state.pairs.length === best.pairs.length && state.cost < best.cost)
		) {
			best = state;
		}
	}
	return best.pairs;
}

export interface PortraitTrackIdMatchResult {
	trackIds: Map<number, number>;
	unmatchedReferenceTrackIds: number[];
	ambiguousReferenceTrackIds: number[];
}

export function matchPortraitTrackIdsDetailed({
	referenceFaces,
	runtimeFaces,
}: {
	referenceFaces: PortraitFaceGeometry[];
	runtimeFaces: PortraitFaceGeometry[];
}): PortraitTrackIdMatchResult {
	const costs = referenceFaces.flatMap((reference, referenceIndex) =>
		runtimeFaces.flatMap((candidate, candidateIndex) => {
			const cost = matchCost({ reference, candidate });
			return cost <= MAXIMUM_MATCH_COST
				? [{ referenceIndex, candidateIndex, cost }]
				: [];
		})
	);
	const ambiguousReferences = ambiguousIndexes({
		costs,
		groupKey: "referenceIndex",
	});
	const ambiguousCandidates = ambiguousIndexes({
		costs,
		groupKey: "candidateIndex",
	});
	const acceptedCosts = costs.filter(
		(cost) =>
			!ambiguousReferences.has(cost.referenceIndex) &&
			!ambiguousCandidates.has(cost.candidateIndex)
	);
	const pairs = globallyOptimalAssignment({
		referenceCount: referenceFaces.length,
		candidateCount: runtimeFaces.length,
		costs: acceptedCosts,
	});
	const trackIds = new Map<number, number>();
	for (const pair of pairs) {
		const reference = referenceFaces[pair.referenceIndex];
		const candidate = runtimeFaces[pair.candidateIndex];
		if (reference && candidate) {
			trackIds.set(reference.trackId, candidate.trackId);
		}
	}
	return {
		trackIds,
		unmatchedReferenceTrackIds: referenceFaces
			.filter((face) => !trackIds.has(face.trackId))
			.map((face) => face.trackId),
		ambiguousReferenceTrackIds: [...ambiguousReferences]
			.map((index) => referenceFaces[index]?.trackId)
			.filter((trackId): trackId is number => trackId !== undefined),
	};
}

export function matchPortraitTrackIds({
	referenceFaces,
	runtimeFaces,
}: {
	referenceFaces: PortraitFaceGeometry[];
	runtimeFaces: PortraitFaceGeometry[];
}) {
	return matchPortraitTrackIdsDetailed({ referenceFaces, runtimeFaces })
		.trackIds;
}

/**
 * Converts one already-bound host's native ids back to the reference ids used
 * by project parameters. A newly activated host can then geometry-match the
 * same current frame without pretending its cold-start ids are persistent.
 */
export function restorePortraitReferenceFaces({
	runtimeFaces,
	trackIds,
}: {
	runtimeFaces: PortraitFaceGeometry[];
	trackIds: ReadonlyMap<number, number>;
}): PortraitFaceGeometry[] {
	const referenceIdByRuntimeId = new Map(
		[...trackIds].map(([referenceId, runtimeId]) => [runtimeId, referenceId])
	);
	return runtimeFaces.flatMap((face) => {
		const referenceId = referenceIdByRuntimeId.get(face.trackId);
		return referenceId === undefined
			? []
			: [{ trackId: referenceId, rect: face.rect }];
	});
}

function remapParameterValue({
	value,
	trackIds,
}: {
	value: unknown;
	trackIds: ReadonlyMap<number, number>;
}): unknown {
	if (Array.isArray(value)) {
		return value.map((entry) =>
			remapParameterValue({ value: entry, trackIds })
		);
	}
	if (typeof value !== "object" || value === null) return value;
	return Object.fromEntries(
		Object.entries(value).map(([key, entry]) => {
			if (key === "id" && typeof entry === "number" && entry >= 0) {
				return [key, trackIds.get(entry) ?? entry];
			}
			return [key, remapParameterValue({ value: entry, trackIds })];
		})
	);
}

export function remapPortraitFeatureParameters({
	featureParameters,
	trackIds,
}: {
	featureParameters: string;
	trackIds: ReadonlyMap<number, number>;
}) {
	if (trackIds.size === 0) return featureParameters;
	const parsed = JSON.parse(featureParameters) as unknown;
	return JSON.stringify(remapParameterValue({ value: parsed, trackIds }));
}
