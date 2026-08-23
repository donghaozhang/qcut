import { describe, expect, it, vi } from "vitest";

const { mockClose, mockOpen, mockRead, mockStat } = vi.hoisted(() => ({
	mockClose: vi.fn(),
	mockOpen: vi.fn(),
	mockRead: vi.fn(),
	mockStat: vi.fn(),
}));

vi.mock("electron", () => ({
	app: { getPath: vi.fn(() => "/mock/Documents") },
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

vi.mock("node:fs/promises", () => ({
	open: (...args: unknown[]) => mockOpen(...args),
}));

import { readMediaRestrictedMetadata } from "../claude/handlers/claude-media-restricted-metadata.js";

describe("restricted sidecar bounded read", () => {
	it("fails closed if the open file grows during the read", async () => {
		mockStat
			.mockResolvedValueOnce({
				dev: 1,
				ino: 2,
				isFile: () => true,
				size: 128,
			})
			.mockResolvedValueOnce({
				dev: 1,
				ino: 2,
				isFile: () => true,
				size: 129,
			});
		mockRead.mockResolvedValue({ bytesRead: 128 });
		mockClose.mockResolvedValue(undefined);
		mockOpen.mockResolvedValue({
			close: mockClose,
			read: mockRead,
			stat: mockStat,
		});

		await expect(
			readMediaRestrictedMetadata({
				mediaId: "media_reference",
				projectId: "project-1",
			})
		).rejects.toThrow("changed while it was read");
		expect(mockStat).toHaveBeenCalledTimes(2);
		expect(mockClose).toHaveBeenCalledOnce();
	});
});
