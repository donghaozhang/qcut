// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

type IpcHandler = (_event: unknown, payload: unknown) => Promise<unknown>;

const { handlers } = vi.hoisted(() => ({
	handlers: new Map<string, IpcHandler>(),
}));

const { mockReadFile } = vi.hoisted(() => ({
	mockReadFile: vi.fn(),
}));

const { mockExistsSync, mockReadFileSync } = vi.hoisted(() => ({
	mockExistsSync: vi.fn(),
	mockReadFileSync: vi.fn(),
}));

const { mockIsProxyAvailable, mockProxyRequest } = vi.hoisted(() => ({
	mockIsProxyAvailable: vi.fn(),
	mockProxyRequest: vi.fn(),
}));

vi.mock("electron", () => ({
	app: {
		getPath: vi.fn(() => "/tmp/qcut-user-data"),
	},
	ipcMain: {
		handle: vi.fn((channel: string, handler: IpcHandler) => {
			handlers.set(channel, handler);
		}),
	},
	safeStorage: {
		isEncryptionAvailable: vi.fn(() => false),
		decryptString: vi.fn(),
	},
}));

vi.mock("node:fs/promises", () => ({
	default: {
		readFile: mockReadFile,
	},
	readFile: mockReadFile,
}));

vi.mock("node:fs", () => ({
	default: {
		existsSync: mockExistsSync,
		readFileSync: mockReadFileSync,
	},
	existsSync: mockExistsSync,
	readFileSync: mockReadFileSync,
}));

vi.mock("../native-pipeline/infra/proxy-client.js", () => ({
	isProxyAvailable: mockIsProxyAvailable,
	proxyRequest: mockProxyRequest,
}));

describe("setupGeminiHandlers", () => {
	beforeEach(() => {
		handlers.clear();
		vi.clearAllMocks();
		mockReadFile.mockResolvedValue(Buffer.from("audio"));
		mockExistsSync.mockReturnValue(false);
		mockIsProxyAvailable.mockResolvedValue(true);
		mockProxyRequest.mockResolvedValue({
			ok: true,
			status: 200,
			data: {
				candidates: [
					{
						content: {
							parts: [
								{
									text: "1\n00:00:00,000 --> 00:00:01,000\n你好\n",
								},
							],
						},
					},
				],
			},
		});
	});

	it("routes Gemini transcription through the QCut cloud proxy before local keys", async () => {
		const { setupGeminiHandlers } = await import(
			"../gemini-transcribe-handler"
		);
		setupGeminiHandlers();

		const handler = handlers.get("transcribe:audio");
		expect(handler).toBeDefined();

		const result = await handler?.(null, {
			audioPath: "/tmp/interview.mp3",
			language: "zh",
		});

		expect(result).toEqual({
			text: "你好",
			segments: [
				expect.objectContaining({
					id: 0,
					start: 0,
					end: 1,
					text: "你好",
				}),
			],
			language: "zh",
		});
		expect(mockExistsSync).not.toHaveBeenCalled();
		expect(mockProxyRequest).toHaveBeenCalledWith({
			provider: "gemini",
			endpoint:
				"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent",
			method: "POST",
			body: {
				contents: [
					{
						role: "user",
						parts: [
							expect.objectContaining({ text: expect.stringContaining("SRT") }),
							{
								inlineData: {
									mimeType: "audio/mp3",
									data: Buffer.from("audio").toString("base64"),
								},
							},
						],
					},
				],
				generationConfig: {
					temperature: 0.1,
				},
			},
			timeoutMs: 120_000,
		});
	});
});
