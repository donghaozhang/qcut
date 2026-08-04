import { fireEvent, render, screen, waitFor } from "@/test/test-utils";
import type { UseCapCutSameProfileWritebackOptions } from "@/hooks/export/use-capcut-same-profile-writeback";
import { useLocaleStore } from "@/stores/locale-store";
import type { TProject } from "@/types/project";
import type { TimelineTrack } from "@/types/timeline";
import { CAPCUT_8_1_PROFILE_ID } from "@qcut/editor-core/jianying-draft";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CapCutSameProfileWritebackCard } from "../capcut-same-profile-writeback-card";

type DraftInteropBinding = NonNullable<TProject["draftInterop"]>;
type BaselineDocument = NonNullable<DraftInteropBinding["baselineDocument"]>;
type SourceEnvelope = NonNullable<DraftInteropBinding["envelope"]>;
type WritebackRequest = Parameters<
	NonNullable<UseCapCutSameProfileWritebackOptions["runWriteback"]>
>[0];

const createdAt = new Date("2026-08-05T00:00:00.000Z");
const tracks: TimelineTrack[] = [];

function createProject({
	ready = true,
	profileId = CAPCUT_8_1_PROFILE_ID,
}: {
	ready?: boolean;
	profileId?: string;
} = {}): TProject {
	return {
		canvasMode: "preset",
		canvasSize: { height: 1080, width: 1920 },
		createdAt,
		currentSceneId: "scene-1",
		draftInterop: {
			baselineDocument: {} as BaselineDocument,
			bundleDigest: "b".repeat(64),
			envelope: {} as SourceEnvelope,
			importId: "import-1",
			internalIdBySemanticId: {},
			profileId,
			schemaVersion: 1,
			sourceFileSha256: ["a".repeat(64)],
			writeback: ready
				? { status: "ready" }
				: { status: "unavailable", reason: "profile-not-writable" },
		},
		fps: 30,
		id: "project-1",
		name: "Imported CapCut project",
		scenes: [
			{
				createdAt,
				id: "scene-1",
				isMain: true,
				name: "Main",
				updatedAt: createdAt,
			},
		],
		thumbnail: "",
		updatedAt: createdAt,
	};
}

describe("CapCut same-profile writeback card", () => {
	beforeEach(() => {
		useLocaleStore.setState({ locale: "en" });
	});

	it("stays hidden for projects without an exact CapCut 8.1 binding", () => {
		render(
			<CapCutSameProfileWritebackCard
				bridgeAvailable
				project={createProject({ profileId: "another-profile" })}
				tracks={tracks}
			/>
		);

		expect(
			screen.queryByTestId("capcut-same-profile-writeback-card")
		).toBeNull();
	});

	it("shows the real-app verification gate without invoking writeback", () => {
		const runWriteback = vi.fn();
		render(
			<CapCutSameProfileWritebackCard
				bridgeAvailable
				project={createProject({ ready: false })}
				runWriteback={runWriteback}
				tracks={tracks}
			/>
		);

		expect(
			screen.getByRole("button", { name: "Choose draft and update" })
		).toBeDisabled();
		expect(
			screen.getByText(/open, save, and reopen verification passes/i)
		).toBeVisible();
		expect(runWriteback).not.toHaveBeenCalled();
	});

	it("captures a pathless timing snapshot and reports a completed writeback", async () => {
		const onBusyChange = vi.fn();
		const runWriteback = vi.fn(async (_request: WritebackRequest) => ({
			ok: true as const,
			outcome: "written" as const,
			draftDirectory: "/private/selected-draft",
			contentSha256: "c".repeat(64),
			replacedMirrorCount: 4 as const,
			transactionId: "transaction-1",
			warnings: [],
		}));
		render(
			<CapCutSameProfileWritebackCard
				bridgeAvailable
				onBusyChange={onBusyChange}
				project={createProject()}
				runWriteback={runWriteback}
				tracks={tracks}
			/>
		);

		fireEvent.click(
			screen.getByRole("button", { name: "Choose draft and update" })
		);

		await waitFor(() => expect(runWriteback).toHaveBeenCalledOnce());
		const request = runWriteback.mock.calls[0]?.[0];
		expect(request.snapshot).toEqual({
			tracks: [],
			timelineDurationByElementId: {},
		});
		expect(JSON.stringify(request.snapshot)).not.toContain("/private/");
		expect(await screen.findByText("Writeback complete")).toBeVisible();
		expect(onBusyChange).toHaveBeenCalledWith(true);
		expect(onBusyChange).toHaveBeenLastCalledWith(false);
	});

	it("surfaces fail-closed preparation issues", async () => {
		const runWriteback = vi.fn(async () => ({
			ok: false as const,
			reason: "prepare-blocked" as const,
			message: "The edit cannot be written safely.",
			issues: [
				{
					code: "WRITEBACK_TRACK_ADDED" as const,
					message: "An imported track structure changed.",
					semanticId: "track-1",
				},
			],
		}));
		render(
			<CapCutSameProfileWritebackCard
				bridgeAvailable
				project={createProject()}
				runWriteback={runWriteback}
				tracks={tracks}
			/>
		);

		fireEvent.click(
			screen.getByRole("button", { name: "Choose draft and update" })
		);

		expect(await screen.findByText("Writeback failed")).toBeVisible();
		expect(screen.getByText(/WRITEBACK_TRACK_ADDED/)).toBeVisible();
		expect(
			screen.queryByRole("button", { name: "Recover transaction" })
		).toBeNull();
	});

	it("offers transaction recovery only when the writer returned a selection token", async () => {
		const runWriteback = vi.fn(async () => ({
			ok: false as const,
			reason: "writeback-failed" as const,
			message: "Recovery is required.",
			draftDirectory: "/private/selected-draft",
			selectionToken: "selection-1",
		}));
		const recoverWriteback = vi.fn(async () => ({
			ok: true as const,
			value: { action: "rolled-back" as const, warnings: [] },
		}));
		render(
			<CapCutSameProfileWritebackCard
				bridgeAvailable
				project={createProject()}
				recoverWriteback={recoverWriteback}
				runWriteback={runWriteback}
				tracks={tracks}
			/>
		);

		fireEvent.click(
			screen.getByRole("button", { name: "Choose draft and update" })
		);
		fireEvent.click(
			await screen.findByRole("button", { name: "Recover transaction" })
		);

		await waitFor(() =>
			expect(recoverWriteback).toHaveBeenCalledWith({
				selectionToken: "selection-1",
			})
		);
		expect(
			await screen.findByText("Writeback recovery complete")
		).toBeVisible();
		expect(screen.getByText("rolled-back")).toBeVisible();
	});
});
