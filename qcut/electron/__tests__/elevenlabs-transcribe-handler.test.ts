// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

type IpcHandler = (_event: unknown, payload: unknown) => Promise<unknown>;

const { handlers } = vi.hoisted(() => ({
	handlers: new Map<string, IpcHandler>(),
}));

const { mockAccess, mockReadFile } = vi.hoisted(() => ({
	mockAccess: vi.fn(),
	mockReadFile: vi.fn(),
}));

const { mockIsProxyAvailable, mockProxyRequest, mockProxyUploadUrl } =
	vi.hoisted(() => ({
		mockIsProxyAvailable: vi.fn(),
		mockProxyRequest: vi.fn(),
		mockProxyUploadUrl: vi.fn(),
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

vi.mock("electron-log", () => ({
	default: {
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
	},
}));

vi.mock("fs/promises", () => ({
	access: mockAccess,
	readFile: mockReadFile,
}));

vi.mock("fs", () => ({
	existsSync: vi.fn(() => false),
	readFileSync: vi.fn(),
}));

vi.mock("../native-pipeline/infra/proxy-client.js", () => ({
	isProxyAvailable: mockIsProxyAvailable,
	proxyRequest: mockProxyRequest,
	proxyUploadUrl: mockProxyUploadUrl,
}));

const TRANSCRIPTION_RESULT = {
	text: "hello",
	language_code: "eng",
	language_probability: 0.99,
	words: [
		{
			text: "hello",
			start: 0,
			end: 0.5,
			type: "word",
			speaker_id: null,
		},
	],
};

describe("registerElevenLabsTranscribeHandler", () => {
	beforeEach(() => {
		handlers.clear();
		vi.clearAllMocks();
		mockAccess.mockResolvedValue(undefined);
		mockReadFile.mockResolvedValue(Buffer.from("audio"));
		mockIsProxyAvailable.mockResolvedValue(true);
		mockProxyUploadUrl.mockResolvedValue({
			uploadUrl: "https://upload.fal.example/audio",
			fileUrl: "https://cdn.fal.example/audio.mp3",
		});
		mockProxyRequest.mockResolvedValue({
			ok: true,
			status: 200,
			data: TRANSCRIPTION_RESULT,
		});
		global.fetch = vi.fn(async () => ({
			ok: true,
			status: 200,
			text: async () => "",
		})) as typeof fetch;
	});

	it("routes Smart Speech transcription through the QCut cloud proxy", async () => {
		const { registerElevenLabsTranscribeHandler } = await import(
			"../elevenlabs-transcribe-handler"
		);
		registerElevenLabsTranscribeHandler();

		const handler = handlers.get("transcribe:elevenlabs");
		expect(handler).toBeDefined();
		const result = await handler?.(null, {
			audioPath: "/tmp/interview.mp3",
			diarize: true,
			tagAudioEvents: false,
			language: "zh",
			keyterms: ["QCut"],
		});

		expect(result).toEqual(TRANSCRIPTION_RESULT);
		expect(mockProxyUploadUrl).toHaveBeenCalledWith({
			fileName: "interview.mp3",
			contentType: "audio/mpeg",
			fileSize: 5,
		});
		expect(mockProxyRequest).toHaveBeenCalledWith({
			provider: "fal",
			endpoint: "https://fal.run/fal-ai/elevenlabs/speech-to-text/scribe-v2",
			method: "POST",
			body: {
				audio_url: "https://cdn.fal.example/audio.mp3",
				diarize: true,
				tag_audio_events: false,
				language_code: "zh",
				keyterms: ["QCut"],
			},
			timeoutMs: 120_000,
		});
		expect(global.fetch).toHaveBeenCalledTimes(1);
		expect(global.fetch).toHaveBeenCalledWith(
			"https://upload.fal.example/audio",
			expect.objectContaining({ method: "PUT" })
		);
	});
});
