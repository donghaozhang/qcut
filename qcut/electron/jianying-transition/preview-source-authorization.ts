import { realpath } from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import type { JianyingTimelinePreviewRequest } from "../jianying-transition-contract.js";

const MAX_REGISTERED_PREVIEW_SOURCES = 10_000;
const registeredPreviewSources = new Set<string>();

function isWithinRoot({
	candidate,
	root,
}: {
	candidate: string;
	root: string;
}): boolean {
	const relative = path.relative(root, candidate);
	return (
		relative === "" ||
		(!relative.startsWith("..") && !path.isAbsolute(relative))
	);
}

async function canonicalizeManagedRoot({
	root,
}: {
	root: string;
}): Promise<string> {
	try {
		return await realpath(root);
	} catch {
		return path.resolve(root);
	}
}

function managedPreviewRoots(): string[] {
	return [
		path.join(app.getPath("documents"), "QCut", "Projects"),
		app.getPath("userData"),
	];
}

export function registerJianyingTimelinePreviewSource({
	inputPath,
}: {
	inputPath: string;
}): void {
	if (!path.isAbsolute(inputPath)) {
		throw new Error(
			"Timeline preview source registration requires an absolute path."
		);
	}
	const resolvedPath = path.resolve(inputPath);
	if (registeredPreviewSources.has(resolvedPath)) return;
	if (registeredPreviewSources.size >= MAX_REGISTERED_PREVIEW_SOURCES) {
		const oldestPath = registeredPreviewSources.values().next().value;
		if (typeof oldestPath === "string")
			registeredPreviewSources.delete(oldestPath);
	}
	registeredPreviewSources.add(resolvedPath);
}

export async function resolveAuthorizedJianyingTimelinePreviewPath({
	inputPath,
}: {
	inputPath: string;
}): Promise<string> {
	if (typeof inputPath !== "string" || inputPath.trim().length === 0) {
		throw new Error("Timeline preview source path is invalid.");
	}
	const resolvedPath = path.resolve(inputPath);
	const canonicalPath = await realpath(resolvedPath);
	if (registeredPreviewSources.has(resolvedPath)) return canonicalPath;
	const managedRoots = await Promise.all(
		managedPreviewRoots().map((root) => canonicalizeManagedRoot({ root }))
	);
	if (
		managedRoots.some((root) =>
			isWithinRoot({ candidate: canonicalPath, root })
		)
	) {
		return canonicalPath;
	}
	throw new Error(
		"Timeline preview source is outside an authorized media directory."
	);
}

export async function authorizeJianyingTimelinePreviewRequest({
	request,
}: {
	request: JianyingTimelinePreviewRequest;
}): Promise<JianyingTimelinePreviewRequest> {
	const [inputAPath, inputBPath] = await Promise.all([
		resolveAuthorizedJianyingTimelinePreviewPath({
			inputPath: request.inputA.inputPath,
		}),
		resolveAuthorizedJianyingTimelinePreviewPath({
			inputPath: request.inputB.inputPath,
		}),
	]);
	return {
		...request,
		inputA: { ...request.inputA, inputPath: inputAPath },
		inputB: { ...request.inputB, inputPath: inputBPath },
	};
}

export function clearJianyingTimelinePreviewSourcesForTest(): void {
	registeredPreviewSources.clear();
}
