import type { TimelineTrack } from "../types/timeline.js";
import { mapNativeDissolveTransitionToJianying } from "./transition-mapping.js";
import { validateJianyingTrackTransition } from "./transition-validation.js";
import type {
	JianyingDraftIssue,
	JianyingDraftSegment,
	JianyingTransitionMaterial,
} from "./types.js";

function addTransitionIssue({
	code,
	issues,
	message,
	track,
}: {
	code: string;
	issues: JianyingDraftIssue[];
	message: string;
	track: TimelineTrack;
}): void {
	issues.push({
		code,
		severity: "error",
		message,
		trackId: track.id,
	});
}

export function mapTrackTransitionsToJianying({
	issues,
	segmentsByElementId,
	timelineDurationByElementId,
	track,
	transitionMaterialsById,
}: {
	issues: JianyingDraftIssue[];
	segmentsByElementId: Map<string, JianyingDraftSegment>;
	timelineDurationByElementId: Record<string, number>;
	track: TimelineTrack;
	transitionMaterialsById: Map<string, JianyingTransitionMaterial>;
}): void {
	const fromElementIds = new Set<string>();
	for (const transition of track.transitions ?? []) {
		if (fromElementIds.has(transition.fromElementId)) {
			addTransitionIssue({
				code: "DUPLICATE_TRACK_TRANSITION",
				issues,
				message: `Element ${transition.fromElementId} cannot own more than one native transition.`,
				track,
			});
			continue;
		}
		fromElementIds.add(transition.fromElementId);

		const transitionIssues = validateJianyingTrackTransition({
			timelineDurationByElementId,
			track,
			transition,
		});
		issues.push(...transitionIssues);
		if (transitionIssues.length > 0) continue;

		const fromSegment = segmentsByElementId.get(transition.fromElementId);
		const toSegment = segmentsByElementId.get(transition.toElementId);
		if (!(fromSegment && toSegment)) {
			addTransitionIssue({
				code: "UNMAPPED_TRANSITION_ENDPOINT",
				issues,
				message: `Transition ${transition.id} has an endpoint blocked from export.`,
				track,
			});
			continue;
		}

		const material = mapNativeDissolveTransitionToJianying({ transition });
		if (transitionMaterialsById.has(material.id)) {
			addTransitionIssue({
				code: "DUPLICATE_TRACK_TRANSITION",
				issues,
				message: `Transition ${transition.id} produces a duplicate material id.`,
				track,
			});
			continue;
		}

		fromSegment.extra_material_refs.push(material.id);
		transitionMaterialsById.set(material.id, material);
	}
}
