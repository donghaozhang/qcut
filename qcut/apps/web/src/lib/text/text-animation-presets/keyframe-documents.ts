import {
	ENTRANCE_KEYFRAME_DOCUMENTS_A,
	type TextKeyframeDocument,
} from "./keyframe-documents-entrance-a";
import { ENTRANCE_KEYFRAME_DOCUMENTS_B } from "./keyframe-documents-entrance-b";
import { ENTRANCE_KEYFRAME_DOCUMENTS_C } from "./keyframe-documents-entrance-c";
import { EXIT_KEYFRAME_DOCUMENTS } from "./keyframe-documents-exit";
import { EXIT_KEYFRAME_DOCUMENTS_B } from "./keyframe-documents-exit-b";
import { LOOP_KEYFRAME_DOCUMENTS } from "./keyframe-documents-loop";

function withPhase({
	phase,
	documents,
}: {
	phase: string;
	documents: Record<string, TextKeyframeDocument>;
}): Record<string, TextKeyframeDocument> {
	return Object.fromEntries(
		Object.entries(documents).map(([presetId, document]) => [
			`${phase}:${presetId}`,
			document,
		])
	);
}

/**
 * Every transcribed Jianying keyframe document, keyed `${phase}:${presetId}`.
 * effectForPreset and sequenceForPreset consult this table before their
 * hand-written cases, so adding a ported preset is data plus a catalog card.
 */
export const TEXT_KEYFRAME_DOCUMENTS: Record<string, TextKeyframeDocument> = {
	...withPhase({ phase: "entrance", documents: ENTRANCE_KEYFRAME_DOCUMENTS_A }),
	...withPhase({ phase: "entrance", documents: ENTRANCE_KEYFRAME_DOCUMENTS_B }),
	...withPhase({ phase: "entrance", documents: ENTRANCE_KEYFRAME_DOCUMENTS_C }),
	...withPhase({ phase: "exit", documents: EXIT_KEYFRAME_DOCUMENTS }),
	...withPhase({ phase: "exit", documents: EXIT_KEYFRAME_DOCUMENTS_B }),
	...withPhase({ phase: "loop", documents: LOOP_KEYFRAME_DOCUMENTS }),
};
