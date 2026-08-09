import {
	mkdir,
	mkdtemp,
	realpath,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const electronPaths = vi.hoisted(() => ({
	documents: "/tmp/qcut-preview-documents",
	userData: "/tmp/qcut-preview-user-data",
}));

vi.mock("electron", () => ({
	app: {
		getPath: (name: "documents" | "userData") => electronPaths[name],
	},
}));

import {
	clearJianyingTimelinePreviewSourcesForTest,
	registerJianyingTimelinePreviewSource,
	resolveAuthorizedJianyingTimelinePreviewPath,
} from "../jianying-transition/preview-source-authorization.js";

const temporaryDirectories: string[] = [];

beforeEach(async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "qcut-preview-auth-"));
	temporaryDirectories.push(root);
	electronPaths.documents = path.join(root, "Documents");
	electronPaths.userData = path.join(root, "UserData");
	await Promise.all([
		mkdir(path.join(electronPaths.documents, "QCut", "Projects"), {
			recursive: true,
		}),
		mkdir(electronPaths.userData, { recursive: true }),
	]);
	clearJianyingTimelinePreviewSourcesForTest();
});

afterEach(async () => {
	clearJianyingTimelinePreviewSourcesForTest();
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { force: true, recursive: true }))
	);
});

describe("Jianying timeline preview source authorization", () => {
	it("allows QCut-managed media and explicitly selected files", async () => {
		const managedPath = path.join(
			electronPaths.documents,
			"QCut",
			"Projects",
			"project-1",
			"media",
			"clip.mp4"
		);
		const selectedPath = path.join(
			path.dirname(electronPaths.documents),
			"clip.mp4"
		);
		await Promise.all([
			mkdir(path.dirname(managedPath), { recursive: true }),
			writeFile(selectedPath, "selected"),
		]);
		await writeFile(managedPath, "managed");
		registerJianyingTimelinePreviewSource({ inputPath: selectedPath });

		await expect(
			resolveAuthorizedJianyingTimelinePreviewPath({ inputPath: managedPath })
		).resolves.toBe(await realpath(managedPath));
		await expect(
			resolveAuthorizedJianyingTimelinePreviewPath({ inputPath: selectedPath })
		).resolves.toBe(await realpath(selectedPath));
	});

	it("rejects unregistered files and managed-directory symlink escapes", async () => {
		const outsidePath = path.join(
			path.dirname(electronPaths.documents),
			"outside.mp4"
		);
		const linkedPath = path.join(
			electronPaths.documents,
			"QCut",
			"Projects",
			"linked.mp4"
		);
		await writeFile(outsidePath, "outside");
		await symlink(outsidePath, linkedPath);

		await expect(
			resolveAuthorizedJianyingTimelinePreviewPath({ inputPath: outsidePath })
		).rejects.toThrow("outside an authorized media directory");
		await expect(
			resolveAuthorizedJianyingTimelinePreviewPath({ inputPath: linkedPath })
		).rejects.toThrow("outside an authorized media directory");
	});
});
