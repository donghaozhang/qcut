import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TProject } from "@/types/project";
import type { ElectronAPI } from "@/types/electron";
import { useExportStore } from "@/stores/export-store";
import { useProjectStore } from "@/stores/project-store";
import type {
	ClaudeLocalVideoExportRendererRequest,
	ClaudeLocalVideoExportRendererResponse,
	ClaudeLocalVideoExportRequest,
} from "../../../../../../electron/types/claude-local-video-export-api";
import {
	cleanupClaudeLocalVideoExportBridge,
	setupClaudeLocalVideoExportBridge,
} from "../claude-local-video-export-bridge";

vi.mock("@/lib/debug/debug-config", () => ({
	debugError: vi.fn(),
}));

interface ExportAutomationWindow extends Window {
	__exportActions?: {
		export: (request: ClaudeLocalVideoExportRequest) => Promise<void>;
	};
}

const automationWindow = window as ExportAutomationWindow;
const originalElectronApi = window.electronAPI;
const request: ClaudeLocalVideoExportRequest = {
	filename: "runtime.mp4",
	format: "mp4",
	frameRate: 30,
	height: 1080,
	outputPath: "/tmp/runtime.mp4",
	projectId: "project-a",
	quality: "1080p",
	width: 1920,
};

function createProject({ id }: { id: string }): TProject {
	return { id } as TProject;
}

function installExportApi(): {
	emitRequest: (request: ClaudeLocalVideoExportRendererRequest) => void;
	removeListener: ReturnType<typeof vi.fn>;
	sendResponse: ReturnType<typeof vi.fn>;
} {
	let requestListener:
		| ((request: ClaudeLocalVideoExportRendererRequest) => void)
		| undefined;
	const removeListener = vi.fn();
	const sendResponse = vi.fn();
	window.electronAPI = {
		claude: {
			export: {
				getPresets: vi.fn(async () => []),
				onLocalVideoExportRequest: vi.fn((callback) => {
					requestListener = callback;
				}),
				recommend: vi.fn(),
				removeLocalVideoExportListener: removeListener,
				sendLocalVideoExportResponse: sendResponse,
			},
		},
	} as unknown as ElectronAPI;
	return {
		emitRequest: (rendererRequest) => {
			if (!requestListener) throw new Error("Bridge request listener missing.");
			requestListener(rendererRequest);
		},
		removeListener,
		sendResponse,
	};
}

function expectErrorResponse({
	requestId,
	sendResponse,
}: {
	requestId: string;
	sendResponse: ReturnType<typeof vi.fn>;
}): void {
	expect(sendResponse).toHaveBeenCalledWith(
		expect.objectContaining({
			error: expect.any(String),
			requestId,
		}) as ClaudeLocalVideoExportRendererResponse
	);
}

describe("Claude local video export bridge", () => {
	beforeEach(() => {
		useProjectStore.setState({
			activeProject: createProject({ id: "project-a" }),
		});
		useExportStore.getState().resetExport();
		Reflect.deleteProperty(automationWindow, "__exportActions");
	});

	afterEach(() => {
		cleanupClaudeLocalVideoExportBridge();
		useExportStore.getState().resetExport();
		useProjectStore.setState({ activeProject: null });
		Reflect.deleteProperty(automationWindow, "__exportActions");
		if (originalElectronApi) {
			window.electronAPI = originalElectronApi;
		} else {
			Reflect.deleteProperty(window, "electronAPI");
		}
	});

	it("rejects a request for a project that is not open", async () => {
		useProjectStore.setState({
			activeProject: createProject({ id: "project-b" }),
		});
		const exportAction = vi.fn(async () => {});
		automationWindow.__exportActions = { export: exportAction };
		const api = installExportApi();
		setupClaudeLocalVideoExportBridge();

		api.emitRequest({ request, requestId: "wrong-project" });

		await vi.waitFor(() =>
			expectErrorResponse({
				requestId: "wrong-project",
				sendResponse: api.sendResponse,
			})
		);
		expect(exportAction).not.toHaveBeenCalled();
	});

	it("rejects a request while another UI export is running", async () => {
		useExportStore.getState().updateProgress({ isExporting: true });
		const exportAction = vi.fn(async () => {});
		automationWindow.__exportActions = { export: exportAction };
		const api = installExportApi();
		setupClaudeLocalVideoExportBridge();

		api.emitRequest({ request, requestId: "busy" });

		await vi.waitFor(() =>
			expectErrorResponse({
				requestId: "busy",
				sendResponse: api.sendResponse,
			})
		);
		expect(exportAction).not.toHaveBeenCalled();
	});

	it("rechecks the active project after waiting for the export panel", async () => {
		const api = installExportApi();
		setupClaudeLocalVideoExportBridge();
		api.emitRequest({ request, requestId: "switched-project" });
		useProjectStore.setState({
			activeProject: createProject({ id: "project-b" }),
		});
		const exportAction = vi.fn(async () => {});
		automationWindow.__exportActions = { export: exportAction };

		await vi.waitFor(() =>
			expectErrorResponse({
				requestId: "switched-project",
				sendResponse: api.sendResponse,
			})
		);
		expect(exportAction).not.toHaveBeenCalled();
	});

	it("sends success only after the renderer export action resolves", async () => {
		let finishExport: (() => void) | undefined;
		const exportAction = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					finishExport = resolve;
				})
		);
		automationWindow.__exportActions = { export: exportAction };
		const api = installExportApi();
		setupClaudeLocalVideoExportBridge();

		api.emitRequest({ request, requestId: "success" });
		await vi.waitFor(() => expect(exportAction).toHaveBeenCalledWith(request));
		expect(api.sendResponse).not.toHaveBeenCalled();

		if (!finishExport) throw new Error("Export completion callback missing.");
		finishExport();
		await vi.waitFor(() =>
			expect(api.sendResponse).toHaveBeenCalledWith({
				requestId: "success",
				success: true,
			})
		);
	});
});
