import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import type {
	CoverDependencyResolver,
	CoverDependencySource,
} from "./jianying-cover-contract.js";
import { findJianyingLocalPackagesByHash } from "./jianying-text-runtime/local-package-index.js";
import {
	findJianyingTextResourceCatalogCandidates,
	type JianyingTextResourceCatalogCandidate,
} from "./jianying-text-runtime/resource-catalog.js";
import {
	extractValidatedJianyingResourceArchive,
	installJianyingTextCatalogCandidate,
	isTrustedJianyingResourceUrl,
} from "./jianying-text-runtime/resource-recovery-installer.js";
import { downloadJianyingFilterPackage } from "./jianying-filter-download.js";
import { identifyCoverDependency } from "./jianying-cover-dependencies.js";
import {
	asJianyingRecord,
	readBoundedJianyingTextJson,
} from "./jianying-text-package-metadata.js";

async function hasExtractedWordArt({ packagePath }: { packagePath: string }) {
	const checks = await Promise.all(
		["config.json", "effectStyle.json"].map(async (name) => {
			try {
				return Boolean(
					asJianyingRecord(
						await readBoundedJianyingTextJson({
							filePath: path.join(packagePath, name),
						})
					)
				);
			} catch {
				return false;
			}
		})
	);
	// The lab may retain an opaque archive for catalog coverage; that is not an extracted dependency.
	return checks.some(Boolean);
}

async function existingSource({
	root,
	relativePath,
	singleFile,
	resolution,
}: CoverDependencySource): Promise<CoverDependencySource | undefined> {
	try {
		const canonicalRoot = await realpath(root);
		const filename = path.join(canonicalRoot, relativePath);
		if (
			!filename.startsWith(`${canonicalRoot}${path.sep}`) ||
			(await realpath(filename)) !== filename
		)
			return;
		const info = await lstat(filename);
		if (singleFile ? !info.isFile() : !info.isDirectory()) return;
		return { root: canonicalRoot, relativePath, singleFile, resolution };
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
		throw error;
	}
}

export function createCoverDependencyResolver({
	cacheRoots,
	databaseRoots,
	recoveryRoot,
	filterRoot,
	applicationResources,
	allowDownload = false,
}: {
	cacheRoots: string[];
	databaseRoots: string[];
	recoveryRoot: string;
	filterRoot: string;
	applicationResources?: string;
	allowDownload?: boolean;
}): CoverDependencyResolver {
	const catalog = new Map<
		string,
		Promise<JianyingTextResourceCatalogCandidate[]>
	>();
	const candidatesFor = ({ resourceId }: { resourceId: string }) => {
		let pending = catalog.get(resourceId);
		if (!pending) {
			pending = Promise.all(
				databaseRoots.map(
					async (databaseRoot) =>
						(
							await findJianyingTextResourceCatalogCandidates({
								databaseRoot,
								resourceIds: [resourceId],
							})
						).get(resourceId) ?? []
				)
			).then((lists) =>
				lists.flat().sort((a, b) => b.timestamp.localeCompare(a.timestamp))
			);
			catalog.set(resourceId, pending);
		}
		return pending;
	};
	return async ({ reference, materials }) => {
		const identity = identifyCoverDependency({ reference, materials });
		const hash =
			/^(?:text|textEffect|filter|effect|sticker|animation)\/([a-f0-9]{32})$/.exec(
				reference
			)?.[1];
		const roots = [...new Set([...cacheRoots, recoveryRoot, filterRoot])];
		const findLocal = ({ packageHash }: { packageHash: string }) =>
			findJianyingLocalPackagesByHash({
				cacheRoots: roots,
				containers: ["artistEffect", "effect"],
				packageHash,
			});
		const sourceFromPackage = async ({
			packagePath,
			candidate,
		}: {
			packagePath: string;
			candidate?: JianyingTextResourceCatalogCandidate;
		}) => {
			if (
				identity?.kind === "word-art" &&
				!(await hasExtractedWordArt({ packagePath }))
			)
				return;
			return existingSource({
				root: path.dirname(packagePath),
				relativePath: path.basename(packagePath),
				resolution: {
					method:
						!candidate || candidate.packageHash === hash
							? "exact-package"
							: "catalog-version",
					source: identity?.kind === "filter" ? "filter-lab" : "text-lab",
					resourceId: identity?.resourceId,
					catalogResourceId:
						candidate?.catalogResourceId ?? candidate?.resourceId,
					packageHash: candidate?.packageHash ?? hash,
					label: candidate?.title ?? identity?.name,
				},
			});
		};
		const localSource = async ({
			packageHash,
			candidate,
		}: {
			packageHash: string;
			candidate?: JianyingTextResourceCatalogCandidate;
		}) => {
			const paths = await findLocal({ packageHash });
			const sources = await Promise.all(
				paths.map((packagePath) =>
					sourceFromPackage({ packagePath, candidate })
				)
			);
			return sources.find((source) => source !== undefined);
		};
		if (hash) {
			const source = await localSource({ packageHash: hash });
			if (source) return { source };
		}
		if (!identity) return { reason: "identity-missing-or-ambiguous" };
		if (!identity.resourceId && applicationResources) {
			const systemFont =
				identity.kind === "font" &&
				identity.name === "系统" &&
				Boolean(hash) &&
				reference.startsWith("text/");
			const brightness =
				identity.name === "builtin-brightness" &&
				/^\/var\/containers\/Bundle\/Application\/[A-Fa-f0-9-]+\/VideoFusionInhouse\.app\/LVEditor\.bundle\/AdjustResource\.bundle\/brightness$/.test(
					reference
				) &&
				(!identity.version || ["v1", "v2"].includes(identity.version));
			const brightnessPath = `DefaultAdjustBundle/brightness${identity.version ? `_${identity.version}` : ""}`;
			if (systemFont || brightness)
				return {
					source: await existingSource({
						root: applicationResources,
						relativePath: systemFont
							? "Font/SystemFont/zh-hans.ttf"
							: brightnessPath,
						singleFile: systemFont,
						resolution: {
							method: "builtin",
							source: "application-builtin",
							label: systemFont ? "SystemFont/zh-hans.ttf" : brightnessPath,
						},
					}),
					reason: "builtin-package-missing",
				};
		}
		if (!hash || !/^\d+$/.test(identity.resourceId))
			return { reason: "catalog-identity-missing" };
		const candidates = await candidatesFor({ resourceId: identity.resourceId });
		const ordered = [...candidates].sort(
			(a, b) => Number(b.packageHash === hash) - Number(a.packageHash === hash)
		);
		// Version changes require an explicit catalog ID/alias match, never a title match.
		const attempt = async ({
			index,
		}: {
			index: number;
		}): ReturnType<CoverDependencyResolver> => {
			const candidate = ordered[index];
			if (!candidate)
				return {
					reason: candidates.length
						? allowDownload
							? "package-recovery-failed"
							: "package-not-downloaded"
						: "catalog-missing",
				};
			const source = await localSource({
				packageHash: candidate.packageHash,
				candidate,
			});
			if (source) return { source };
			if (!allowDownload) return attempt({ index: index + 1 });
			let packagePath: string | undefined;
			if (identity.kind === "filter") {
				const packageUrls = candidate.downloadUrls.filter((value) =>
					isTrustedJianyingResourceUrl({ value })
				);
				if (!packageUrls.length) return attempt({ index: index + 1 });
				try {
					packagePath = (
						await downloadJianyingFilterPackage({
							managedRoot: path.join(filterRoot, "artistEffect"),
							filter: {
								resourceId: candidate.catalogResourceId ?? candidate.resourceId,
								title: candidate.title ?? identity.name,
								categories: [],
								version: candidate.packageHash,
								packageUrls,
							},
						})
					).packagePath;
				} catch {
					/* A stale catalog URL can be followed by a usable mirror. */
				}
			} else {
				const result = await installJianyingTextCatalogCandidate({
					candidate,
					role: identity.kind,
					recoveryRoot,
					fetchResource: fetch,
					extractArchive: extractValidatedJianyingResourceArchive,
				});
				packagePath =
					result.state === "unavailable" ? undefined : result.packagePath;
			}
			const recovered = packagePath
				? await sourceFromPackage({ packagePath, candidate })
				: undefined;
			return recovered ? { source: recovered } : attempt({ index: index + 1 });
		};
		return attempt({ index: 0 });
	};
}
