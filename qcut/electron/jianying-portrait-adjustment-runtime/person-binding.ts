import { randomUUID } from "node:crypto";
import type {
	JianyingPortraitAdjustmentDetectRequest,
	JianyingPortraitDetectedFace,
} from "../jianying-portrait-adjustment-contract.js";
import {
	matchPortraitTrackIdsDetailed,
	type PortraitFaceGeometry,
} from "./track-id-remapping.js";

export type NativeDetectedPortraitFace = Omit<
	JianyingPortraitDetectedFace,
	"bindingStatus" | "personBindingId"
>;

function validPersonBindingId({ value }: { value: unknown }) {
	return (
		typeof value === "string" &&
		value.length > 0 &&
		value.length <= 128 &&
		/^[A-Za-z0-9._:-]+$/.test(value)
	);
}

function eligibleBindingGeometry({
	binding,
	frameNumber,
	referenceTrackId,
}: {
	binding: NonNullable<
		JianyingPortraitAdjustmentDetectRequest["personBindings"]
	>[number];
	frameNumber?: number;
	referenceTrackId: number;
}): PortraitFaceGeometry | null {
	const { rect } = binding.anchor;
	const values = [rect.x, rect.y, rect.width, rect.height];
	if (
		!validPersonBindingId({ value: binding.personBindingId }) ||
		!values.every((value) => Number.isFinite(value)) ||
		rect.x < 0 ||
		rect.y < 0 ||
		rect.width <= 0 ||
		rect.height <= 0 ||
		rect.x + rect.width > 1 ||
		rect.y + rect.height > 1
	) {
		throw new Error("剪映美颜美体人物绑定格式无效");
	}
	const anchorFrame = binding.anchor.frameNumber;
	if (
		anchorFrame !== undefined &&
		(frameNumber === undefined || anchorFrame !== frameNumber)
	) {
		return null;
	}
	return { trackId: referenceTrackId, rect };
}

/**
 * Reconnects session-local freid ids to project identities only when the saved
 * anchor belongs to this exact frame. Cross-frame geometry alone cannot
 * distinguish a person after a cut, so uncertain bindings remain unmatched.
 */
export function bindDetectedPortraitFaces({
	bindings = [],
	faces,
	frameNumber,
	createPersonBindingId = () => `portrait-person:${randomUUID()}`,
}: {
	bindings?: JianyingPortraitAdjustmentDetectRequest["personBindings"];
	faces: NativeDetectedPortraitFace[];
	frameNumber?: number;
	createPersonBindingId?: () => string;
}) {
	const seen = new Set<string>();
	const eligibleBindings = bindings.flatMap((binding, index) => {
		if (seen.has(binding.personBindingId)) {
			throw new Error("剪映美颜美体人物绑定格式无效");
		}
		seen.add(binding.personBindingId);
		const geometry = eligibleBindingGeometry({
			binding,
			frameNumber,
			referenceTrackId: index,
		});
		return geometry ? [{ binding, geometry }] : [];
	});
	const match = matchPortraitTrackIdsDetailed({
		referenceFaces: eligibleBindings.map(({ geometry }) => geometry),
		runtimeFaces: faces,
	});
	const bindingByReferenceId = new Map(
		eligibleBindings.map(
			({ binding, geometry }) => [geometry.trackId, binding] as const
		)
	);
	const bindingByTrackId = new Map<number, string>();
	const matchedBindingIds = new Set<string>();
	for (const [referenceId, trackId] of match.trackIds) {
		const binding = bindingByReferenceId.get(referenceId);
		if (!binding) continue;
		bindingByTrackId.set(trackId, binding.personBindingId);
		matchedBindingIds.add(binding.personBindingId);
	}
	return {
		faces: faces.map((face) => {
			const personBindingId = bindingByTrackId.get(face.trackId);
			return {
				...face,
				personBindingId: personBindingId ?? createPersonBindingId(),
				bindingStatus: personBindingId
					? ("matched" as const)
					: ("new" as const),
			};
		}),
		unmatchedPersonBindingIds: bindings
			.map(({ personBindingId }) => personBindingId)
			.filter((personBindingId) => !matchedBindingIds.has(personBindingId)),
	};
}
