import type { JianyingTextRuntimeDependencyRole } from "../jianying-text-runtime-contract.js";
import {
	asJianyingRecord,
	JIANYING_TEXT_RESOURCE_ID_PATTERN,
} from "../jianying-text-package-metadata.js";
import { collectJianyingRichTextEffectStyleIds } from "./rich-text-resources.js";

export interface JianyingScriptResourceReference {
	resourceId: string;
	role: JianyingTextRuntimeDependencyRole;
}

export interface JianyingScriptDependencyDescriptor {
	resourceId: string;
	source: number | null;
	type: string | null;
}

function resourceReferenceKey({
	resourceId,
	role,
}: JianyingScriptResourceReference) {
	return `${role}:${resourceId}`;
}

export function collectJianyingScriptResourceReferences({
	value,
}: {
	value: unknown;
}) {
	const references = new Map<string, JianyingScriptResourceReference>();
	const pending: unknown[] = [value];
	while (pending.length > 0) {
		const current = pending.pop();
		if (Array.isArray(current)) {
			pending.push(...current);
			continue;
		}
		const record = asJianyingRecord(current);
		if (!record) continue;
		for (const [field, role] of [
			["anim_resource_id", "animation"],
			["sticker_resource_id", "sticker"],
		] as const) {
			const resourceId = record[field];
			if (resourceId === "" || resourceId === undefined) continue;
			if (
				typeof resourceId !== "string" ||
				!JIANYING_TEXT_RESOURCE_ID_PATTERN.test(resourceId)
			) {
				throw new Error(`ScriptInfoSticker ${field} is invalid`);
			}
			const reference = { resourceId, role };
			references.set(resourceReferenceKey(reference), reference);
		}
		if (typeof record.richText === "string") {
			for (const resourceId of collectJianyingRichTextEffectStyleIds({
				richText: record.richText,
			})) {
				const reference = { resourceId, role: "effect-style" as const };
				references.set(resourceReferenceKey(reference), reference);
			}
		}
		pending.push(...Object.values(record));
	}
	return [...references.values()].sort((left, right) =>
		resourceReferenceKey(left).localeCompare(resourceReferenceKey(right))
	);
}

export function readJianyingScriptDependencyDescriptors({
	value,
}: {
	value: unknown;
}) {
	const root = asJianyingRecord(value);
	const dependencies = Array.isArray(root?.depend_resource_list)
		? root.depend_resource_list
		: [];
	return new Map(
		dependencies.flatMap((dependency) => {
			const record = asJianyingRecord(dependency);
			const resourceId = record?.resource_id;
			if (
				typeof resourceId !== "string" ||
				!JIANYING_TEXT_RESOURCE_ID_PATTERN.test(resourceId)
			) {
				return [];
			}
			const descriptor: JianyingScriptDependencyDescriptor = {
				resourceId,
				source: typeof record?.source === "number" ? record.source : null,
				type: typeof record?.type === "string" ? record.type : null,
			};
			return [[resourceId, descriptor] as const];
		})
	);
}

export function collectJianyingAnimationOwnerTypes({
	value,
}: {
	value: unknown;
}) {
	const ownerTypes = new Map<string, Set<string>>();
	const pending: unknown[] = [value];
	while (pending.length > 0) {
		const current = pending.pop();
		if (Array.isArray(current)) {
			pending.push(...current);
			continue;
		}
		const record = asJianyingRecord(current);
		if (!record) continue;
		if (Array.isArray(record.anims)) {
			for (const animation of record.anims) {
				const animationRecord = asJianyingRecord(animation);
				const resourceId = animationRecord?.anim_resource_id;
				if (
					typeof resourceId === "string" &&
					JIANYING_TEXT_RESOURCE_ID_PATTERN.test(resourceId)
				) {
					const owners = ownerTypes.get(resourceId) ?? new Set<string>();
					owners.add(typeof record.type === "string" ? record.type : "unknown");
					ownerTypes.set(resourceId, owners);
				}
			}
		}
		pending.push(...Object.values(record));
	}
	return ownerTypes;
}

export function canDegradeJianyingScriptResource({
	descriptor,
	ownerTypes,
	reference,
}: {
	descriptor?: JianyingScriptDependencyDescriptor;
	ownerTypes: ReadonlyMap<string, ReadonlySet<string>>;
	reference: JianyingScriptResourceReference;
}) {
	const owners = ownerTypes.get(reference.resourceId);
	return (
		reference.role === "animation" &&
		descriptor?.type === "shape-animation" &&
		owners?.size === 1 &&
		owners.has("shape")
	);
}

export function jianyingResourceContainers({
	descriptor,
	reference,
}: {
	descriptor?: JianyingScriptDependencyDescriptor;
	reference: JianyingScriptResourceReference;
}) {
	if (reference.role === "animation") return ["effect"] as const;
	if (reference.role === "effect-style") {
		return ["artistEffect", "effect"] as const;
	}
	if (descriptor?.source === 1 || descriptor?.type === "default") {
		return ["artistEffect", "effect"] as const;
	}
	return ["effect", "artistEffect"] as const;
}
