import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import {
	asJianyingRecord,
	JIANYING_TEXT_RESOURCE_ID_PATTERN,
	readBoundedJianyingTextJson,
} from "../jianying-text-package-metadata.js";

export type JianyingScriptResourceRole = "animation" | "sticker";

export interface JianyingScriptResourceReference {
	resourceId: string;
	role: JianyingScriptResourceRole;
}

export interface ResolvedJianyingScriptResources {
	resourcePaths: Readonly<Record<string, string>>;
	references: JianyingScriptResourceReference[];
	missing: JianyingScriptResourceReference[];
	fingerprint: string;
}

interface DependencyDescriptor {
	resourceId: string;
	source: number | null;
	type: string | null;
}

interface ResourcePackageCandidate {
	path: string;
	modifiedAt: number;
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
		pending.push(...Object.values(record));
	}
	return [...references.values()].sort((left, right) =>
		resourceReferenceKey(left).localeCompare(resourceReferenceKey(right))
	);
}

function readDependencyDescriptors({ value }: { value: unknown }) {
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
			const descriptor: DependencyDescriptor = {
				resourceId,
				source: typeof record?.source === "number" ? record.source : null,
				type: typeof record?.type === "string" ? record.type : null,
			};
			return [[resourceId, descriptor] as const];
		})
	);
}

function containersForReference({
	reference,
	descriptor,
}: {
	reference: JianyingScriptResourceReference;
	descriptor?: DependencyDescriptor;
}) {
	if (reference.role === "animation") return ["effect"] as const;
	if (descriptor?.source === 1 || descriptor?.type === "default") {
		return ["artistEffect", "effect"] as const;
	}
	return ["effect", "artistEffect"] as const;
}

async function isReadableFile({ filePath }: { filePath: string }) {
	try {
		await access(filePath, constants.R_OK);
		return true;
	} catch {
		return false;
	}
}

function isWithinRoot({
	root,
	candidate,
}: {
	root: string;
	candidate: string;
}) {
	return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

async function listResourcePackageCandidates({
	containerRoot,
	resourceId,
}: {
	containerRoot: string;
	resourceId: string;
}) {
	const resourceRoot = path.join(containerRoot, resourceId);
	const entries = await readdir(resourceRoot, { withFileTypes: true }).catch(
		() => []
	);
	const resolvedContainerRoot = await realpath(containerRoot).catch(() => null);
	if (!resolvedContainerRoot) return [];
	const candidates = await Promise.all(
		entries.flatMap((entry) =>
			entry.isDirectory()
				? [
						(async (): Promise<ResourcePackageCandidate | null> => {
							const candidate = path.join(resourceRoot, entry.name);
							const resolved = await realpath(candidate).catch(() => null);
							if (
								!resolved ||
								!isWithinRoot({
									root: resolvedContainerRoot,
									candidate: resolved,
								}) ||
								!(await isReadableFile({
									filePath: path.join(resolved, "config.json"),
								}))
							) {
								return null;
							}
							const metadata = await stat(resolved).catch(() => null);
							return metadata?.isDirectory()
								? { path: resolved, modifiedAt: metadata.mtimeMs }
								: null;
						})(),
					]
				: []
		)
	);
	return candidates.filter(
		(candidate): candidate is ResourcePackageCandidate => candidate !== null
	);
}

async function resolveResourcePackage({
	cacheRoot,
	reference,
	descriptor,
}: {
	cacheRoot: string;
	reference: JianyingScriptResourceReference;
	descriptor?: DependencyDescriptor;
}) {
	const candidatesByContainer = await Promise.all(
		containersForReference({ reference, descriptor }).map((container) =>
			listResourcePackageCandidates({
				containerRoot: path.join(cacheRoot, container),
				resourceId: reference.resourceId,
			})
		)
	);
	return candidatesByContainer
		.flat()
		.sort(
			(left, right) =>
				right.modifiedAt - left.modifiedAt ||
				left.path.localeCompare(right.path)
		)[0]?.path;
}

export async function resolveJianyingScriptResources({
	packagePath,
	cacheRoot,
}: {
	packagePath: string;
	cacheRoot: string;
}): Promise<ResolvedJianyingScriptResources> {
	const [content, extra] = await Promise.all([
		readBoundedJianyingTextJson({
			filePath: path.join(packagePath, "content.json"),
		}),
		readBoundedJianyingTextJson({
			filePath: path.join(packagePath, "extra.json"),
		}).catch(() => null),
	]);
	const references = collectJianyingScriptResourceReferences({
		value: content,
	});
	const descriptors = readDependencyDescriptors({ value: extra });
	const resolutions = await Promise.all(
		references.map(async (reference) => ({
			reference,
			packagePath: await resolveResourcePackage({
				cacheRoot,
				reference,
				descriptor: descriptors.get(reference.resourceId),
			}),
		}))
	);
	const resourcePaths: Record<string, string> = {};
	const missing: JianyingScriptResourceReference[] = [];
	for (const resolution of resolutions) {
		if (resolution.packagePath) {
			resourcePaths[resolution.reference.resourceId] = resolution.packagePath;
			continue;
		}
		missing.push(resolution.reference);
	}
	const fingerprint = createHash("sha256")
		.update(
			JSON.stringify(
				resolutions.map(({ reference, packagePath: resolvedPath }) => ({
					...reference,
					path: resolvedPath ?? null,
				}))
			)
		)
		.digest("hex");
	return { resourcePaths, references, missing, fingerprint };
}
