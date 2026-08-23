import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockAccess,
	mockDeleteMetadata,
	mockPersistMetadata,
	mockReadMetadata,
	mockReaddir,
	mockRename,
	mockStat,
	mockUnlink,
} = vi.hoisted(() => ({
	mockAccess: vi.fn(),
	mockDeleteMetadata: vi.fn(),
	mockPersistMetadata: vi.fn(),
	mockReadMetadata: vi.fn(),
	mockReaddir: vi.fn(),
	mockRename: vi.fn(),
	mockStat: vi.fn(),
	mockUnlink: vi.fn(),
}));

vi.mock("electron", () => ({
	app: { getPath: vi.fn(() => "/mock/Documents") },
	ipcMain: { handle: vi.fn() },
}));

vi.mock("electron-log", () => ({
	default: {
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		log: vi.fn(),
		warn: vi.fn(),
	},
}));

vi.mock("fs/promises", () => ({
	access: (...args: unknown[]) => mockAccess(...args),
	readdir: (...args: unknown[]) => mockReaddir(...args),
	rename: (...args: unknown[]) => mockRename(...args),
	stat: (...args: unknown[]) => mockStat(...args),
	unlink: (...args: unknown[]) => mockUnlink(...args),
}));

vi.mock("../claude/handlers/claude-media-restricted-metadata.js", () => ({
	deleteMediaRestrictedMetadata: (...args: unknown[]) =>
		mockDeleteMetadata(...args),
	persistMediaRestrictedMetadata: (...args: unknown[]) =>
		mockPersistMetadata(...args),
	readMediaRestrictedMetadata: (...args: unknown[]) =>
		mockReadMetadata(...args),
}));

import {
	deleteMediaFile,
	renameMediaFile,
} from "../claude/handlers/claude-media-handler.js";

const OLD_ID = `media_${Buffer.from("reference.gif").toString("base64url")}`;
const NEW_ID = `media_${Buffer.from("renamed.gif").toString("base64url")}`;
const METADATA = {
	animatedSticker: true,
	batchId: "jianying-2026-08-23-batch-18-v2",
	checksumSha256:
		"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
	itemId: "42001",
	redistribution: "prohibited",
	referenceOnly: true,
	source: "sticker-lab",
	usage: "internal-reference-only",
} as const;

describe("restricted metadata rename rollback", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockAccess.mockImplementation(async (target: unknown) => {
			if (String(target).endsWith("renamed.gif")) throw new Error("ENOENT");
		});
		mockReaddir.mockImplementation(async (target: unknown) => {
			if (String(target).endsWith("/media")) {
				return [
					{
						isFile: () => true,
						isSymbolicLink: () => false,
						name: "reference.gif",
					},
				];
			}
			return [];
		});
		mockStat.mockResolvedValue({
			birthtimeMs: 1,
			mtimeMs: 2,
			size: 6,
		});
		mockReadMetadata.mockResolvedValue(METADATA);
		mockPersistMetadata.mockResolvedValue(undefined);
		mockDeleteMetadata.mockResolvedValue(undefined);
		mockRename.mockRejectedValue(new Error("rename refused"));
		mockUnlink.mockResolvedValue(undefined);
	});

	it("removes the staged new sidecar and retains the old one", async () => {
		await expect(
			renameMediaFile("project-1", OLD_ID, "renamed.gif")
		).resolves.toBe(false);

		expect(mockPersistMetadata).toHaveBeenCalledWith({
			mediaId: NEW_ID,
			metadata: METADATA,
			projectId: "project-1",
		});
		expect(mockDeleteMetadata).toHaveBeenCalledOnce();
		expect(mockDeleteMetadata).toHaveBeenCalledWith({
			mediaId: NEW_ID,
			projectId: "project-1",
		});
		expect(mockDeleteMetadata).not.toHaveBeenCalledWith({
			mediaId: OLD_ID,
			projectId: "project-1",
		});
	});

	it("returns success after media deletion when orphan cleanup fails", async () => {
		mockDeleteMetadata.mockRejectedValueOnce(new Error("sidecar busy"));

		await expect(deleteMediaFile("project-1", OLD_ID)).resolves.toBe(true);

		expect(mockUnlink).toHaveBeenCalledWith(
			"/mock/Documents/QCut/Projects/project-1/media/reference.gif"
		);
		expect(mockDeleteMetadata).toHaveBeenCalledWith({
			mediaId: OLD_ID,
			projectId: "project-1",
		});
	});
});
